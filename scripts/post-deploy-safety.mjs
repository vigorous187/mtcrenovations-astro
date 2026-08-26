import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "https://www.mtcrenovations.ca";
const DEFAULT_PROJECT = "mtc-renovations";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const INDEXNOW_KEY = "ae0b529e-ad61-4957-b4d9-6e2e253a8bd5";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "MTC post-deploy verification" },
  });
  return { response, text: await response.text() };
}

async function fetchSameOriginScripts(fetchImpl, baseUrl, html) {
  const scripts = [];
  for (const match of html.matchAll(/<script\b[^>]+src=["']([^"']+)["']/gi)) {
    const url = new URL(match[1], baseUrl);
    if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith("/_astro/")) continue;
    scripts.push((await fetchText(fetchImpl, url.href)).text);
  }
  return scripts.join("\n");
}

export async function verifyProduction({
  baseUrl = DEFAULT_BASE_URL,
  profile = "release",
  expectedCommit,
  fetchImpl = fetch,
} = {}) {
  const base = baseUrl.replace(/\/$/, "");
  const uniqueMissingPath = `/__mtc_post_deploy_${Date.now()}`;
  if (expectedCommit) {
    assert(/^[0-9a-f]{40}$/.test(expectedCommit), "Expected release commit must be a full 40-character Git SHA");
  }

  const [home, robots, sitemap, leadPage, estimateHealth, indexNow, release, missing] =
    await Promise.all([
      fetchText(fetchImpl, `${base}/`),
      fetchText(fetchImpl, `${base}/robots.txt`),
      fetchText(fetchImpl, `${base}/sitemap.xml`),
      fetchText(fetchImpl, `${base}/newleadintake/`),
      fetchText(fetchImpl, `${base}/api/estimates/__postdeploy-health__/`),
      fetchText(fetchImpl, `${base}/${INDEXNOW_KEY}.txt`),
      expectedCommit
        ? fetchText(fetchImpl, `${base}/release.json?expected=${expectedCommit}`)
        : Promise.resolve(null),
      fetchText(fetchImpl, `${base}${uniqueMissingPath}`),
    ]);

  assert(home.response.status === 200, `Homepage returned ${home.response.status}`);
  assert(/<title>[^<]*MTC Renovations[^<]*<\/title>/i.test(home.text), "Homepage title is not MTC Renovations");
  assert(home.text.includes("zaraz.track('phone_click'"), "Zaraz phone tracking contract is missing");

  assert(robots.response.status === 200, `robots.txt returned ${robots.response.status}`);
  assert(/^\s*Sitemap:\s*https:\/\/www\.mtcrenovations\.ca\/sitemap-(?:index|0)\.xml\s*$/im.test(robots.text), "robots.txt has no authoritative sitemap directive");

  assert(sitemap.response.status === 200, `sitemap.xml returned ${sitemap.response.status}`);
  assert(/<sitemapindex\b/i.test(sitemap.text), "sitemap.xml is not a sitemap index");

  assert(leadPage.response.status === 200, `newleadintake returned ${leadPage.response.status}`);
  assert(leadPage.text.includes('id="leadForm"'), "newleadintake form is missing");

  if (profile === "release") {
    assert(home.text.includes("zaraz.track('email_click'"), "Zaraz email tracking contract is missing");
    const leadScripts = await fetchSameOriginScripts(fetchImpl, `${base}/newleadintake/`, leadPage.text);
    assert(leadScripts.includes("/api/leads/submit/"), "newleadintake submit endpoint is missing");
    assert(leadScripts.includes("submissionId"), "newleadintake submission deduplication is missing");
    assert(leadScripts.includes("generate_lead") && leadScripts.includes("zaraz.track"), "newleadintake Zaraz conversion event is missing");
    assert(!/gtag\([^)]*generate_lead/.test(leadScripts), "newleadintake still sends generate_lead through gtag");
  }

  assert(estimateHealth.response.status === 404, `Estimate KV health check returned ${estimateHealth.response.status}`);
  assert(estimateHealth.text.includes("Estimate not found"), "Estimate KV binding health response is invalid");

  assert(indexNow.response.status === 200, `IndexNow key returned ${indexNow.response.status}`);
  assert(indexNow.text === `${INDEXNOW_KEY}\n`, "IndexNow key response is not the exact public key");

  if (expectedCommit) {
    assert(release.response.status === 200, `release.json returned ${release.response.status}`);
    let releaseMetadata;
    try {
      releaseMetadata = JSON.parse(release.text);
    } catch {
      throw new Error("release.json is not valid JSON");
    }
    assert(releaseMetadata.commit === expectedCommit, `Production commit ${releaseMetadata.commit || "missing"} does not match expected ${expectedCommit}`);
    assert(releaseMetadata.branch === "main", `Production release branch ${releaseMetadata.branch || "missing"} is not main`);
  }

  assert(missing.response.status === 404, `Unknown URL returned ${missing.response.status} instead of 404`);

  const checks = [
    "homepage_identity",
    "zaraz_phone_contract",
    "robots_sitemap",
    "sitemap_index",
    "lead_form",
    "estimate_kv_read",
    "indexnow_key",
    "real_404",
  ];
  if (profile === "release") {
    checks.push("zaraz_email_contract", "confirmed_lead_contract");
  }
  if (expectedCommit) checks.push("release_identity");

  return {
    baseUrl: base,
    profile,
    checks,
  };
}

export async function verifyProductionWithRetry({
  retries = 6,
  delayMs = 5_000,
  ...options
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await verifyProduction(options);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.error(`Production verification attempt ${attempt}/${retries} failed: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

export function selectLastKnownGoodDeployment(deployments) {
  return deployments.find(
    (deployment) =>
      deployment?.environment === "production" &&
      deployment?.is_skipped !== true &&
      deployment?.latest_stage?.status === "success" &&
      typeof deployment?.id === "string" &&
      deployment.id,
  ) ?? null;
}

export function selectSuccessfulProductionDeployment(deployments, expectedCommit) {
  return deployments.find(
    (deployment) =>
      deployment?.environment === "production" &&
      deployment?.is_skipped !== true &&
      deployment?.latest_stage?.status === "success" &&
      deployment?.deployment_trigger?.metadata?.commit_hash === expectedCommit &&
      deployment?.deployment_trigger?.metadata?.branch === "main" &&
      typeof deployment?.id === "string" &&
      deployment.id,
  ) ?? null;
}

function cloudflareUrl(accountId, projectName, suffix = "") {
  assert(accountId, "Missing CLOUDFLARE_ACCOUNT_ID");
  assert(projectName, "Missing Cloudflare Pages project name");
  return `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}/deployments${suffix}`;
}

async function cloudflareJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    const message = body.errors?.[0]?.message || `Cloudflare API HTTP ${response.status}`;
    throw new Error(message);
  }
  return body.result;
}

export async function captureLastKnownGood({
  accountId,
  apiToken,
  projectName = DEFAULT_PROJECT,
  fetchImpl = fetch,
}) {
  assert(apiToken, "Missing CLOUDFLARE_API_TOKEN");
  const url = `${cloudflareUrl(accountId, projectName)}?env=production&per_page=20`;
  const deployments = await cloudflareJson(fetchImpl, url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const deployment = selectLastKnownGoodDeployment(deployments);
  assert(deployment, "No successful production deployment is available for rollback");
  return deployment;
}

export async function confirmProductionDeployment({
  accountId,
  apiToken,
  expectedCommit,
  projectName = DEFAULT_PROJECT,
  fetchImpl = fetch,
}) {
  assert(apiToken, "Missing CLOUDFLARE_API_TOKEN");
  assert(/^[0-9a-f]{40}$/.test(expectedCommit ?? ""), "Expected deployment commit must be a full Git SHA");
  const url = `${cloudflareUrl(accountId, projectName)}?env=production&per_page=20`;
  const deployments = await cloudflareJson(fetchImpl, url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const deployment = selectSuccessfulProductionDeployment(deployments, expectedCommit);
  assert(deployment, `No successful main production deployment matches ${expectedCommit}`);
  return deployment;
}

export async function inspectReleaseIdentity({
  baseUrl = DEFAULT_BASE_URL,
  expectedCommit,
  fetchImpl = fetch,
}) {
  assert(/^[0-9a-f]{40}$/.test(expectedCommit ?? ""), "Expected release commit must be a full Git SHA");
  const { response, text } = await fetchText(fetchImpl, `${baseUrl.replace(/\/$/, "")}/release.json`);
  if (response.status === 404) {
    return { available: false, commit: null, branch: null };
  }
  assert(response.status === 200, `release.json probe returned ${response.status}`);
  let metadata;
  try {
    metadata = JSON.parse(text);
  } catch {
    throw new Error("release.json probe is not valid JSON");
  }
  assert(metadata.commit === expectedCommit, `release.json probe commit ${metadata.commit || "missing"} does not match ${expectedCommit}`);
  assert(metadata.branch === "main", `release.json probe branch ${metadata.branch || "missing"} is not main`);
  return { available: true, commit: metadata.commit, branch: metadata.branch };
}

export function buildRollbackRequest({
  accountId,
  apiToken,
  projectName = DEFAULT_PROJECT,
  deploymentId,
}) {
  assert(apiToken, "Missing CLOUDFLARE_API_TOKEN");
  assert(deploymentId, "Missing last-known-good deployment ID");
  return {
    url: cloudflareUrl(
      accountId,
      projectName,
      `/${encodeURIComponent(deploymentId)}/rollback`,
    ),
    options: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
    },
  };
}

export async function rollbackToDeployment({ fetchImpl = fetch, ...options }) {
  const request = buildRollbackRequest(options);
  return cloudflareJson(fetchImpl, request.url, request.options);
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function main() {
  const command = process.argv[2];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const projectName = argValue("project", DEFAULT_PROJECT);

  if (command === "verify") {
    const result = await verifyProductionWithRetry({
      baseUrl: argValue("base-url", DEFAULT_BASE_URL),
      profile: argValue("profile", "release"),
      expectedCommit: argValue("expected-commit"),
      retries: Number(argValue("retries", "6")),
      delayMs: Number(argValue("delay-ms", "5000")),
    });
    console.log(`Production verification passed (${result.checks.length} critical checks).`);
    return;
  }

  if (command === "capture") {
    const deployment = await captureLastKnownGood({
      accountId,
      apiToken,
      projectName,
    });
    const commitHash = deployment?.deployment_trigger?.metadata?.commit_hash ?? null;
    const branch = deployment?.deployment_trigger?.metadata?.branch ?? null;
    process.stdout.write(JSON.stringify({ id: deployment.id, commitHash, branch }));
    return;
  }

  if (command === "confirm") {
    const deployment = await confirmProductionDeployment({
      accountId,
      apiToken,
      projectName,
      expectedCommit: argValue("expected-commit"),
    });
    process.stdout.write(JSON.stringify({
      id: deployment.id,
      commitHash: deployment.deployment_trigger.metadata.commit_hash,
      branch: deployment.deployment_trigger.metadata.branch,
      url: deployment.url,
    }));
    return;
  }

  if (command === "inspect-release") {
    const result = await inspectReleaseIdentity({
      baseUrl: argValue("base-url", DEFAULT_BASE_URL),
      expectedCommit: argValue("expected-commit"),
    });
    process.stdout.write(JSON.stringify(result));
    return;
  }

  if (command === "rollback") {
    const deploymentId = argValue("deployment-id");
    if (process.argv.includes("--dry-run")) {
      const request = buildRollbackRequest({
        accountId,
        apiToken,
        projectName,
        deploymentId,
      });
      console.log(`Dry run: ${request.options.method} ${request.url}`);
      return;
    }
    const deployment = await rollbackToDeployment({
      accountId,
      apiToken,
      projectName,
      deploymentId,
    });
    console.log(`Rollback requested for deployment ${deployment.id || deploymentId}.`);
    return;
  }

  throw new Error("Usage: post-deploy-safety.mjs <verify|capture|confirm|inspect-release|rollback>");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`Post-deploy safety failed: ${error.message}`);
    process.exit(1);
  });
}
