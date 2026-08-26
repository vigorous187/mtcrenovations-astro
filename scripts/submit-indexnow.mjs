import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const INDEXNOW_HOST = "www.mtcrenovations.ca";
export const INDEXNOW_KEY = "ae0b529e-ad61-4957-b4d9-6e2e253a8bd5";
export const DASHBOARD_INDEXNOW_ENDPOINT =
  "https://api.forge-co.ca/internal/indexnow/submit";
export const SITE_SLUG = "mtcrenovations";
export const MAX_DASHBOARD_RETRY_AFTER_SECONDS = 7 * 24 * 60 * 60;
const FULL_SHA = /^[0-9a-f]{40}$/;

export class DashboardIndexNowError extends Error {
  constructor(
    code,
    {
      attempts = 0,
      httpStatus = null,
      dashboardReceipt = null,
      retryAfterAt = null,
      retryAfterSeconds = null,
    } = {},
  ) {
    super(code);
    this.name = "DashboardIndexNowError";
    this.code = code;
    this.attempts = attempts;
    this.httpStatus = httpStatus;
    this.dashboardReceipt = dashboardReceipt;
    this.retryAfterAt = retryAfterAt;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function canonicalUrlList(urls, host = INDEXNOW_HOST) {
  const unique = [];
  const seen = new Set();
  for (const value of urls) {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== host ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(`IndexNow URL is not a canonical same-host URL: ${value}`);
    }
    const canonical = url.toString();
    if (!seen.has(canonical)) {
      seen.add(canonical);
      unique.push(canonical);
    }
  }
  return unique;
}

export function canonicalSitemapUrls(xml, host = INDEXNOW_HOST) {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    decodeXml(match[1].trim()),
  );
  if (!urls.length) throw new Error("No URLs in sitemap");
  return canonicalUrlList(urls, host);
}

async function selectedUrls({ root, sitemapUrls, manifestPath }) {
  if (!manifestPath) {
    return {
      urls: sitemapUrls,
      selectionPolicy: "full_sitemap_missing_manifest",
      selectionReason: "No changed-route manifest was supplied; fail closed to all canonical URLs.",
    };
  }
  const manifest = JSON.parse(await readFile(path.resolve(root, manifestPath), "utf8"));
  if (manifest.host !== INDEXNOW_HOST || !Array.isArray(manifest.urlList)) {
    throw new Error("IndexNow changed-route manifest has an invalid host or URL list");
  }
  const urls = canonicalUrlList(manifest.urlList);
  const sitemapSet = new Set(sitemapUrls);
  for (const url of urls) {
    if (!sitemapSet.has(url)) {
      throw new Error(`IndexNow manifest URL is absent from the canonical sitemap: ${url}`);
    }
  }
  return {
    urls,
    selectionPolicy: manifest.policy,
    selectionReason: manifest.reason,
  };
}

export async function buildIndexNowSubmission({
  root = process.cwd(),
  manifestPath = process.env.INDEXNOW_MANIFEST_PATH,
} = {}) {
  const keyFile = path.join(root, "public", `${INDEXNOW_KEY}.txt`);
  const keyBody = await readFile(keyFile, "utf8");
  if (keyBody !== `${INDEXNOW_KEY}\n`) {
    throw new Error(`IndexNow key file is not exact: ${keyFile}`);
  }
  const xml = await readFile(path.join(root, "dist", "sitemap-0.xml"), "utf8");
  const sitemapUrls = canonicalSitemapUrls(xml);
  const selection = await selectedUrls({ root, sitemapUrls, manifestPath });
  return {
    urls: selection.urls,
    selectionPolicy: selection.selectionPolicy,
    selectionReason: selection.selectionReason,
  };
}

function acceptedResponse(value, urlCount) {
  if (value?.ok !== true || typeof value?.duplicate !== "boolean") return false;
  if (urlCount === 0) {
    return value.status === "not_required_no_changed_urls" &&
      value.url_count === 0 &&
      typeof value.capability_receipt_id === "string" &&
      value.capability_receipt_id.length > 0;
  }
  return ["accepted", "verification_pending"].includes(value.status) &&
    [200, 202].includes(value.http_status) &&
    typeof value.submission_id === "string" &&
    value.submission_id.length > 0;
}

function failedProviderResponse(value) {
  return value?.ok === true &&
    typeof value?.duplicate === "boolean" &&
    value.status === "failed" &&
    (value.http_status === null || Number.isInteger(value.http_status)) &&
    typeof value.submission_id === "string" &&
    value.submission_id.length > 0;
}

function sanitizedDashboardReceipt(value) {
  return {
    duplicate: typeof value?.duplicate === "boolean" ? value.duplicate : null,
    status: typeof value?.status === "string" ? value.status : null,
    providerHttpStatus: value?.provider_http_status ?? value?.http_status ?? null,
    submissionId: value?.submission_id ?? null,
    capabilityReceiptId: value?.capability_receipt_id ?? null,
    deploymentObservationId: value?.deployment_observation_id ?? null,
    retryAfterAt: value?.retry_after_at ?? null,
    retryAfterSeconds: value?.retry_after_seconds ?? null,
  };
}

function rateLimitEvidence(response, value) {
  const header = response.headers.get("Retry-After");
  const headerSeconds = /^\d{1,7}$/.test(header ?? "") ? Number(header) : null;
  const bodySeconds = Number.isInteger(value?.retry_after_seconds)
    ? value.retry_after_seconds
    : null;
  const retryAfterSeconds = headerSeconds !== null && headerSeconds === bodySeconds &&
      headerSeconds >= 1 && headerSeconds <= MAX_DASHBOARD_RETRY_AFTER_SECONDS
    ? headerSeconds
    : null;
  const parsedAt = typeof value?.retry_after_at === "string"
    ? Date.parse(value.retry_after_at)
    : Number.NaN;
  const retryAfterAt = retryAfterSeconds !== null && Number.isFinite(parsedAt)
    ? new Date(parsedAt).toISOString()
    : null;
  const valid = value?.ok === false &&
    value?.provider_http_status === 429 &&
    Number.isInteger(value?.attempts) &&
    value.attempts >= 1 &&
    typeof value?.submission_id === "string" &&
    value.submission_id.length > 0 &&
    retryAfterAt !== null;
  return { valid, retryAfterAt, retryAfterSeconds };
}

function assertInputs({ releaseReceiptSecret, releaseCommit, deploymentId }) {
  if (!releaseReceiptSecret) throw new DashboardIndexNowError("missing_secret");
  if (!FULL_SHA.test(releaseCommit || "")) {
    throw new DashboardIndexNowError("invalid_release_commit");
  }
  if (
    typeof deploymentId !== "string" ||
    deploymentId.length < 1 ||
    deploymentId.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(deploymentId)
  ) {
    throw new DashboardIndexNowError("invalid_deployment_id");
  }
}

async function writeReceipt(root, receiptPath, receipt) {
  const absoluteReceiptPath = path.resolve(root, receiptPath);
  await mkdir(path.dirname(absoluteReceiptPath), { recursive: true });
  await writeFile(absoluteReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

export async function submitIndexNow({
  root = process.cwd(),
  manifestPath = process.env.INDEXNOW_MANIFEST_PATH,
  fetchImpl = fetch,
  receiptPath = process.env.INDEXNOW_RECEIPT_PATH || path.join("artifacts", "indexnow-receipt.json"),
  now = () => new Date(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  releaseReceiptSecret = process.env.RELEASE_RECEIPT_SECRET,
  releaseCommit = process.env.RELEASE_COMMIT || process.env.GITHUB_SHA,
  deploymentId = process.env.RELEASE_DEPLOYMENT_ID,
  endpoint = DASHBOARD_INDEXNOW_ENDPOINT,
  maxAttempts = 3,
} = {}) {
  assertInputs({ releaseReceiptSecret, releaseCommit, deploymentId });
  const selection = await buildIndexNowSubmission({ root, manifestPath });
  if (selection.urls.length > 100) throw new DashboardIndexNowError("too_many_urls");
  const payload = {
    client_slug: SITE_SLUG,
    deployment_id: deploymentId,
    urls: selection.urls,
  };
  const base = {
    schemaVersion: 2,
    attemptedAt: now().toISOString(),
    candidateSha: releaseCommit,
    deploymentId,
    destination: endpoint,
    siteSlug: SITE_SLUG,
    urlCount: selection.urls.length,
    urlList: selection.urls,
    payloadSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    selectionPolicy: selection.selectionPolicy,
    selectionReason: selection.selectionReason,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-release-receipt-secret": releaseReceiptSecret,
        },
        body: JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      if (attempt < maxAttempts) {
        await sleep(attempt * 1_000);
        continue;
      }
      const receipt = { ...base, status: "failed_noncritical", attempts: attempt, httpStatus: null, errorCode: "network_failure" };
      await writeReceipt(root, receiptPath, receipt);
      throw new DashboardIndexNowError("network_failure", { attempts: attempt });
    }

    const body = await response.json().catch(() => null);
    if (response.ok && acceptedResponse(body, selection.urls.length)) {
      const receipt = {
        ...base,
        status: body.status,
        attempts: attempt,
        httpStatus: response.status,
        dashboardReceipt: sanitizedDashboardReceipt(body),
      };
      await writeReceipt(root, receiptPath, receipt);
      return receipt;
    }
    if (response.ok && failedProviderResponse(body)) {
      const receipt = {
        ...base,
        status: "failed_noncritical",
        attempts: attempt,
        httpStatus: response.status,
        errorCode: "provider_failure",
        dashboardReceipt: sanitizedDashboardReceipt(body),
      };
      await writeReceipt(root, receiptPath, receipt);
      throw new DashboardIndexNowError("provider_failure", {
        attempts: attempt,
        httpStatus: response.status,
        dashboardReceipt: receipt.dashboardReceipt,
      });
    }
    if (response.status === 429) {
      const evidence = rateLimitEvidence(response, body);
      const errorCode = evidence.valid
        ? "provider_rate_limited"
        : "rate_limit_evidence_invalid";
      const dashboardReceipt = body ? sanitizedDashboardReceipt(body) : null;
      const receipt = {
        ...base,
        status: "failed_noncritical",
        attempts: attempt,
        httpStatus: 429,
        errorCode,
        retryAfterAt: evidence.retryAfterAt,
        retryAfterSeconds: evidence.retryAfterSeconds,
        ...(dashboardReceipt ? { dashboardReceipt } : {}),
      };
      await writeReceipt(root, receiptPath, receipt);
      throw new DashboardIndexNowError(errorCode, {
        attempts: attempt,
        httpStatus: 429,
        dashboardReceipt,
        retryAfterAt: evidence.retryAfterAt,
        retryAfterSeconds: evidence.retryAfterSeconds,
      });
    }
    const retryable = response.status >= 500 ||
      (response.ok && body?.status === "pending");
    if (retryable && attempt < maxAttempts) {
      await sleep(attempt * 1_000);
      continue;
    }
    const errorCode = response.ok ? "invalid_response" : "http_failure";
    const receipt = { ...base, status: "failed_noncritical", attempts: attempt, httpStatus: response.status, errorCode };
    await writeReceipt(root, receiptPath, receipt);
    throw new DashboardIndexNowError(errorCode, { attempts: attempt, httpStatus: response.status });
  }
  throw new DashboardIndexNowError("retry_limit_exhausted", { attempts: maxAttempts });
}

async function main() {
  const receipt = await submitIndexNow();
  console.log(`Dashboard IndexNow result: ${receipt.status}; ${receipt.urlCount} URL(s).`);
  console.log(`Receipt: ${process.env.INDEXNOW_RECEIPT_PATH || "artifacts/indexnow-receipt.json"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof DashboardIndexNowError ? error.code : "unexpected_failure");
    process.exitCode = 1;
  });
}
