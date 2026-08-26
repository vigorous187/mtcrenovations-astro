import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const DASHBOARD_RECEIPT_ENDPOINT =
  "https://api.forge-co.ca/internal/cloudflare/release-receipt";
const FULL_SHA = /^[0-9a-f]{40}$/;

class SafeReleaseReceiptError extends Error {
  constructor(code, message, evidence = null) {
    super(message);
    this.name = "SafeReleaseReceiptError";
    this.code = code;
    this.evidence = evidence;
  }
}

function requireValue(value, code, message) {
  if (!value) throw new SafeReleaseReceiptError(code, message);
  return value;
}

function deploymentsUrl(accountId, projectName) {
  return `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}/deployments?env=production&page=1&per_page=20`;
}

function parseCloudflareEnvelope(body) {
  if (!body || body.success !== true || !Array.isArray(body.result)) {
    throw new SafeReleaseReceiptError(
      "provider_response_invalid",
      "Cloudflare did not return a valid deployment list",
    );
  }
  return body.result;
}

export function selectExactProductionDeployment(
  deployments,
  { projectName, branch, candidateSha },
) {
  const deployment = deployments.find(
    (candidate) =>
      candidate?.environment === "production" &&
      candidate?.is_skipped !== true &&
      candidate?.latest_stage?.status === "success",
  );
  if (!deployment) {
    throw new SafeReleaseReceiptError(
      "production_deployment_missing",
      "Cloudflare has no successful production deployment",
    );
  }
  if (!deployment.id || deployment.project_name !== projectName) {
    throw new SafeReleaseReceiptError(
      "deployment_identity_mismatch",
      "Cloudflare production deployment identity does not match the release project",
    );
  }
  const metadata = deployment?.deployment_trigger?.metadata;
  if (
    metadata?.branch !== branch ||
    metadata?.commit_hash !== candidateSha ||
    metadata?.commit_dirty !== false
  ) {
    throw new SafeReleaseReceiptError(
      "deployment_identity_mismatch",
      "Cloudflare production deployment does not match the exact clean release SHA",
    );
  }
  return deployment;
}

export async function verifyExactProductionDeployment({
  accountId,
  apiToken,
  projectName,
  branch,
  candidateSha,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  requireValue(accountId, "cloudflare_account_missing", "Cloudflare account ID is required");
  requireValue(apiToken, "cloudflare_token_missing", "Cloudflare API token is required");
  requireValue(projectName, "project_missing", "Cloudflare Pages project is required");
  requireValue(branch, "branch_missing", "Production branch is required");
  if (!FULL_SHA.test(candidateSha ?? "")) {
    throw new SafeReleaseReceiptError(
      "candidate_sha_invalid",
      "Release candidate must be a full Git SHA",
    );
  }
  const response = await fetchImpl(deploymentsUrl(accountId, projectName), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiToken}` },
    redirect: "error",
  });
  if (!response.ok) {
    throw new SafeReleaseReceiptError(
      "provider_request_failed",
      `Cloudflare deployment verification returned HTTP ${response.status}`,
    );
  }
  const deployment = selectExactProductionDeployment(
    parseCloudflareEnvelope(await response.json().catch(() => null)),
    { projectName, branch, candidateSha },
  );
  return {
    deploymentId: deployment.id,
    verifiedAt: now().toISOString(),
  };
}

function receiptPayload({ site, candidateSha, deploymentId, verifiedAt }) {
  return {
    schema_version: 1,
    site,
    candidate_sha: candidateSha,
    deployment_ids: { pages: deploymentId },
    verification_status: "passed",
    verified_at: verifiedAt,
    rollback_status: "not_required",
  };
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function sendVerifiedReleaseReceipt({
  site,
  candidateSha,
  projectName,
  branch,
  accountId,
  cloudflareApiToken,
  releaseReceiptSecret,
  fetchImpl = fetch,
  sleepImpl = delay,
  now = () => new Date(),
  maxAttempts = 3,
}) {
  requireValue(site, "site_missing", "Production site is required");
  requireValue(
    releaseReceiptSecret,
    "receipt_secret_missing",
    "Release receipt secret is required",
  );
  const verification = await verifyExactProductionDeployment({
    accountId,
    apiToken: cloudflareApiToken,
    projectName,
    branch,
    candidateSha,
    fetchImpl,
    now,
  });
  const payload = receiptPayload({
    site,
    candidateSha,
    deploymentId: verification.deploymentId,
    verifiedAt: verification.verifiedAt,
  });

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new SafeReleaseReceiptError(
      "retry_policy_invalid",
      "Dashboard receipt delivery allows between one and three attempts",
      payload,
    );
  }
  let lastStatus = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(DASHBOARD_RECEIPT_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-release-receipt-secret": releaseReceiptSecret,
        },
        body: JSON.stringify(payload),
        redirect: "error",
      });
    } catch {
      lastStatus = "network_error";
      if (attempt < maxAttempts) {
        await sleepImpl(500 * 2 ** (attempt - 1));
        continue;
      }
      break;
    }
    lastStatus = response.status;
    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      return {
        ...payload,
        sender_status: "accepted",
        sender_attempts: attempt,
        dashboard_receipt_id:
          typeof result?.capability_receipt_id === "string"
            ? result.capability_receipt_id
            : null,
      };
    }
    if (attempt < maxAttempts) await sleepImpl(500 * 2 ** (attempt - 1));
  }
  throw new SafeReleaseReceiptError(
    "dashboard_delivery_failed",
    `Dashboard receipt delivery failed after ${maxAttempts} attempts (last HTTP ${lastStatus})`,
    { ...payload, sender_attempts: maxAttempts },
  );
}

async function writeReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  const reportPath =
    process.env.RELEASE_RECEIPT_REPORT_PATH ??
    "artifacts/release-receipt-sender.json";
  try {
    const report = await sendVerifiedReleaseReceipt({
      site: process.env.RELEASE_RECEIPT_SITE,
      candidateSha: process.env.RELEASE_RECEIPT_CANDIDATE_SHA,
      projectName: process.env.RELEASE_RECEIPT_PROJECT,
      branch: process.env.RELEASE_RECEIPT_BRANCH,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
      releaseReceiptSecret: process.env.RELEASE_RECEIPT_SECRET,
    });
    await writeReport(reportPath, report);
    console.log(
      `Release receipt accepted for ${report.candidate_sha} deployment ${report.deployment_ids.pages}`,
    );
  } catch (error) {
    const report = {
      ...(error instanceof SafeReleaseReceiptError && error.evidence
        ? error.evidence
        : {}),
      schema_version: 1,
      sender_status: "failed",
      reason_code:
        error instanceof SafeReleaseReceiptError ? error.code : "unexpected_sender_failure",
      recorded_at: new Date().toISOString(),
    };
    await writeReport(reportPath, report);
    console.error(`Release receipt not sent: ${report.reason_code}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
