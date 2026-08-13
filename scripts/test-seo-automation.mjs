import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildGenerateLeadEvent,
  isConfirmedLeadResponse,
  normalizeSubmissionId,
  readConfirmedLeadSubmission,
  writeConfirmedLeadSubmission,
} from "../src/lib/lead-conversion.mjs";
import {
  buildRollbackRequest,
  selectLastKnownGoodDeployment,
  verifyProduction,
} from "./post-deploy-safety.mjs";

function response(status, body, url = "https://www.mtcrenovations.ca/") {
  return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

test("generate_lead requires confirmed JobTread success", () => {
  const confirmed = {
    success: true,
    conversionEligible: true,
    syncPending: false,
    deduplicated: false,
    jobTread: { jobId: "job-123" },
  };
  assert.equal(isConfirmedLeadResponse(confirmed), true);
  assert.equal(isConfirmedLeadResponse({ ...confirmed, syncPending: true }), false);
  assert.equal(isConfirmedLeadResponse({ ...confirmed, conversionEligible: false }), false);
  assert.equal(isConfirmedLeadResponse({ ...confirmed, jobTread: null }), false);
  assert.deepEqual(
    buildGenerateLeadEvent(confirmed, {
      formName: "price_guide_lead",
      pagePath: "/newleadintake/",
    }),
    {
      form_name: "price_guide_lead",
      page_path: "/newleadintake/",
      event_id: "job-123",
      jobtread_confirmed: true,
      deduplicated: false,
    },
  );
});

test("confirmed responses are cached by submission ID and returned as deduplicated", async () => {
  const values = new Map();
  const kv = {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => values.set(key, value),
  };
  const submissionId = "12345678-1234-4234-9234-123456789abc";
  const confirmed = {
    success: true,
    conversionEligible: true,
    syncPending: false,
    jobTread: { jobId: "job-456" },
  };

  assert.equal(normalizeSubmissionId(submissionId), submissionId);
  assert.equal(await writeConfirmedLeadSubmission(kv, submissionId, confirmed), true);
  assert.deepEqual(await readConfirmedLeadSubmission(kv, submissionId), {
    ...confirmed,
    deduplicated: true,
  });
  assert.equal(
    await writeConfirmedLeadSubmission(
      kv,
      "pending-submission-1234",
      { ...confirmed, syncPending: true },
    ),
    false,
  );
});

test("production verification covers identity, Zaraz, crawl files, lead form, KV, and 404", async () => {
  const expectedCommit = "0123456789abcdef0123456789abcdef01234567";
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/") return response(200, `<title>MTC Renovations</title><script>zaraz.track('phone_click');zaraz.track('email_click')</script>`);
    if (path === "/robots.txt") return response(200, "Sitemap: https://www.mtcrenovations.ca/sitemap-index.xml");
    if (path === "/sitemap.xml") return response(200, "<sitemapindex></sitemapindex>");
    if (path === "/newleadintake/") return response(200, '<form id="leadForm"></form><script src="/_astro/lead.js"></script>');
    if (path === "/_astro/lead.js") return response(200, 'fetch("/api/leads/submit/");const x={submissionId:"id"};zaraz.track("generate_lead")');
    if (path === "/api/estimates/__postdeploy-health__/") return response(404, '{"error":"Estimate not found"}');
    if (path === "/ae0b529e-ad61-4957-b4d9-6e2e253a8bd5.txt") return response(200, "ae0b529e-ad61-4957-b4d9-6e2e253a8bd5\n");
    if (path === "/release.json") return response(200, JSON.stringify({ commit: expectedCommit, branch: "main" }));
    if (path.startsWith("/__mtc_post_deploy_")) return response(404, "not found");
    return response(500, "unexpected");
  };

  const result = await verifyProduction({ fetchImpl, expectedCommit });
  assert.equal(result.checks.length, 11);
});

test("production verification rejects a mismatched release commit", async () => {
  const expectedCommit = "0123456789abcdef0123456789abcdef01234567";
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/") return response(200, `<title>MTC Renovations</title><script>zaraz.track('phone_click');zaraz.track('email_click')</script>`);
    if (path === "/robots.txt") return response(200, "Sitemap: https://www.mtcrenovations.ca/sitemap-index.xml");
    if (path === "/sitemap.xml") return response(200, "<sitemapindex></sitemapindex>");
    if (path === "/newleadintake/") return response(200, '<form id="leadForm"></form><script src="/_astro/lead.js"></script>');
    if (path === "/_astro/lead.js") return response(200, 'fetch("/api/leads/submit/");const x={submissionId:"id"};zaraz.track("generate_lead")');
    if (path === "/api/estimates/__postdeploy-health__/") return response(404, '{"error":"Estimate not found"}');
    if (path === "/ae0b529e-ad61-4957-b4d9-6e2e253a8bd5.txt") return response(200, "ae0b529e-ad61-4957-b4d9-6e2e253a8bd5\n");
    if (path === "/release.json") return response(200, JSON.stringify({ commit: "fedcba9876543210fedcba9876543210fedcba98", branch: "main" }));
    if (path.startsWith("/__mtc_post_deploy_")) return response(404, "not found");
    return response(500, "unexpected");
  };

  await assert.rejects(
    () => verifyProduction({ fetchImpl, expectedCommit }),
    /does not match expected/,
  );
});

test("production verification rejects a soft 404", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/") return response(200, `<title>MTC Renovations</title><script>zaraz.track('phone_click')</script>`);
    if (path === "/robots.txt") return response(200, "Sitemap: https://www.mtcrenovations.ca/sitemap-index.xml");
    if (path === "/sitemap.xml") return response(200, "<sitemapindex></sitemapindex>");
    if (path === "/newleadintake/") return response(200, '<form id="leadForm"></form>');
    if (path === "/api/estimates/__postdeploy-health__/") return response(404, "Estimate not found");
    if (path === "/ae0b529e-ad61-4957-b4d9-6e2e253a8bd5.txt") return response(200, "ae0b529e-ad61-4957-b4d9-6e2e253a8bd5\n");
    return response(200, "homepage fallback");
  };
  await assert.rejects(() => verifyProduction({ fetchImpl, profile: "baseline" }), /instead of 404/);
});

test("rollback selects a successful production deployment and targets the official endpoint", () => {
  const selected = selectLastKnownGoodDeployment([
    { id: "preview", environment: "preview", latest_stage: { status: "success" } },
    { id: "failed", environment: "production", latest_stage: { status: "failure" } },
    { id: "good", environment: "production", latest_stage: { status: "success" } },
  ]);
  assert.equal(selected.id, "good");

  const request = buildRollbackRequest({
    accountId: "account",
    apiToken: "test-token",
    projectName: "mtc-renovations",
    deploymentId: "good",
  });
  assert.equal(request.options.method, "POST");
  assert.equal(
    request.url,
    "https://api.cloudflare.com/client/v4/accounts/account/pages/projects/mtc-renovations/deployments/good/rollback",
  );
});

test("production workflow binds build, deploy, verification, and rollback to the release contract", async () => {
  const workflow = await readFile(".github/workflows/deploy.yml", "utf8");
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(workflow, /SOURCE_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /refs\/heads\/\$SOURCE_BRANCH:refs\/remotes\/origin\/\$SOURCE_BRANCH/);
  assert.match(workflow, /PUBLIC_RELEASE_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /--commit-hash=\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /verify --expected-commit=\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /post-deploy-safety\.mjs rollback --deployment-id=/);
  assert.match(workflow, /verify --profile=baseline/);
  assert.match(packageJson.scripts.build, /check-release-metadata\.mjs/);
});
