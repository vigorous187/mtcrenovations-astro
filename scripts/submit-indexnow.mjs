import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const INDEXNOW_HOST = "www.mtcrenovations.ca";
export const INDEXNOW_KEY = "ae0b529e-ad61-4957-b4d9-6e2e253a8bd5";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

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
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeXml(match[1].trim()));
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

  const absoluteManifestPath = path.resolve(root, manifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
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
  const payload = {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
    urlList: selection.urls,
  };
  const body = JSON.stringify(payload);
  return {
    payload,
    body,
    payloadSha256: createHash("sha256").update(body).digest("hex"),
    selectionPolicy: selection.selectionPolicy,
    selectionReason: selection.selectionReason,
  };
}

export async function submitIndexNow({
  root = process.cwd(),
  manifestPath = process.env.INDEXNOW_MANIFEST_PATH,
  fetchImpl = fetch,
  receiptPath = process.env.INDEXNOW_RECEIPT_PATH || path.join("artifacts", "indexnow-receipt.json"),
  now = () => new Date(),
} = {}) {
  const submission = await buildIndexNowSubmission({ root, manifestPath });
  const requestedAt = now().toISOString();
  let response;
  let responseText = "";
  let error = null;

  if (submission.payload.urlList.length === 0) {
    const receipt = {
      status: "skipped_no_changed_urls",
      endpoint: INDEXNOW_ENDPOINT,
      host: INDEXNOW_HOST,
      keyLocation: submission.payload.keyLocation,
      requestedAt,
      urlCount: 0,
      payloadSha256: submission.payloadSha256,
      selectionPolicy: submission.selectionPolicy,
      selectionReason: submission.selectionReason,
      httpStatus: null,
      accepted: false,
      error: null,
      responsePreview: "",
    };
    const absoluteReceiptPath = path.resolve(root, receiptPath);
    await mkdir(path.dirname(absoluteReceiptPath), { recursive: true });
    await writeFile(absoluteReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    return receipt;
  }

  try {
    response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: submission.body,
    });
    responseText = await response.text();
    if (!response.ok) error = `IndexNow returned HTTP ${response.status}`;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "IndexNow request failed";
  }

  const receipt = {
    status: response?.ok ? "accepted" : "failed_noncritical",
    endpoint: INDEXNOW_ENDPOINT,
    host: INDEXNOW_HOST,
    keyLocation: submission.payload.keyLocation,
    requestedAt,
    urlCount: submission.payload.urlList.length,
    payloadSha256: submission.payloadSha256,
    selectionPolicy: submission.selectionPolicy,
    selectionReason: submission.selectionReason,
    httpStatus: response?.status ?? null,
    accepted: Boolean(response?.ok),
    error,
    responsePreview: responseText.slice(0, 500),
  };
  const absoluteReceiptPath = path.resolve(root, receiptPath);
  await mkdir(path.dirname(absoluteReceiptPath), { recursive: true });
  await writeFile(absoluteReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  if (!receipt.accepted) throw new Error(error || "IndexNow submission was not accepted");
  return receipt;
}

async function main() {
  const receipt = await submitIndexNow();
  console.log(`IndexNow accepted ${receipt.urlCount} URLs (HTTP ${receipt.httpStatus})`);
  console.log(`Receipt: ${process.env.INDEXNOW_RECEIPT_PATH || "artifacts/indexnow-receipt.json"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
