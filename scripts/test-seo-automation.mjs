import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildGenerateLeadEvent,
  isConfirmedLeadResponse,
  normalizeSubmissionId,
  readConfirmedLeadSubmission,
  trackGenerateLeadOnce,
  writeConfirmedLeadSubmission,
} from "../src/lib/lead-conversion.mjs";
import {
  buildRollbackRequest,
  confirmProductionDeployment,
  inspectReleaseIdentity,
  selectLastKnownGoodDeployment,
  selectSuccessfulProductionDeployment,
  verifyProduction,
} from "./post-deploy-safety.mjs";
import {
  buildChangedRouteManifest,
  selectChangedCanonicalUrls,
} from "./build-indexnow-route-manifest.mjs";
import {
  canonicalSitemapUrls,
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  submitIndexNow,
} from "./submit-indexnow.mjs";
import { writeReleaseReceipt } from "./write-release-receipt.mjs";

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

test("generate_lead browser delivery is session-durable and contains no contact values", () => {
  const values = new Map();
  const calls = [];
  const target = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    zaraz: {
      track: (name, metadata) => calls.push({ name, metadata }),
    },
  };
  const event = buildGenerateLeadEvent({
    success: true,
    conversionEligible: true,
    syncPending: false,
    deduplicated: false,
    jobTread: { jobId: "job-789" },
  }, {
    formName: "price_guide_lead",
    pagePath: "/newleadintake/",
  });

  assert.equal(trackGenerateLeadOnce(event, target), true);
  assert.equal(trackGenerateLeadOnce(event, target), false);
  assert.deepEqual(calls, [{ name: "generate_lead", metadata: event }]);
  assert.equal(JSON.stringify(calls).includes("phone"), false);
  assert.equal(JSON.stringify(calls).includes("email"), false);

  const replayedTarget = {
    sessionStorage: target.sessionStorage,
    zaraz: target.zaraz,
  };
  assert.equal(trackGenerateLeadOnce(event, replayedTarget), false);
});

test("shared click instrumentation is delegated once and omits literal destinations", async () => {
  const layout = await readFile("src/layouts/BaseLayout.astro", "utf8");
  assert.match(layout, /dataset\.mtcAnalyticsClickTrackingInstalled/);
  assert.equal((layout.match(/document\.addEventListener\('click'/g) ?? []).length, 1);
  assert.doesNotMatch(layout, /phone_number\s*:/);
  assert.doesNotMatch(layout, /email_address\s*:/);
  assert.match(layout, /zaraz\.track\('phone_click',[\s\S]+page_path/);
  assert.match(layout, /zaraz\.track\('email_click',[\s\S]+page_path/);
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

test("Cloudflare identity confirmation requires exact successful main commit metadata", async () => {
  const expectedCommit = "0123456789abcdef0123456789abcdef01234567";
  const deployments = [
    { id: "preview", environment: "preview", latest_stage: { status: "success" }, deployment_trigger: { metadata: { commit_hash: expectedCommit, branch: "main" } } },
    { id: "wrong-branch", environment: "production", latest_stage: { status: "success" }, deployment_trigger: { metadata: { commit_hash: expectedCommit, branch: "staging" } } },
    { id: "exact", url: "https://exact.pages.dev", environment: "production", latest_stage: { status: "success" }, deployment_trigger: { metadata: { commit_hash: expectedCommit, branch: "main" } } },
  ];
  assert.equal(selectSuccessfulProductionDeployment(deployments, expectedCommit).id, "exact");
  const confirmed = await confirmProductionDeployment({
    accountId: "account",
    apiToken: "token",
    expectedCommit,
    fetchImpl: async () => Response.json({ success: true, result: deployments }),
  });
  assert.equal(confirmed.id, "exact");
});

test("rollback identity probe allows one legacy baseline then requires exact release metadata", async () => {
  const expectedCommit = "0123456789abcdef0123456789abcdef01234567";
  assert.deepEqual(
    await inspectReleaseIdentity({
      expectedCommit,
      fetchImpl: async () => response(404, "not found"),
    }),
    { available: false, commit: null, branch: null },
  );
  assert.deepEqual(
    await inspectReleaseIdentity({
      expectedCommit,
      fetchImpl: async () => response(200, JSON.stringify({ commit: expectedCommit, branch: "main" })),
    }),
    { available: true, commit: expectedCommit, branch: "main" },
  );
  await assert.rejects(
    () => inspectReleaseIdentity({
      expectedCommit,
      fetchImpl: async () => response(200, JSON.stringify({ commit: "fedcba9876543210fedcba9876543210fedcba98", branch: "main" })),
    }),
    /does not match/,
  );
});

test("IndexNow accepts only canonical sitemap URLs on the production host", () => {
  assert.deepEqual(
    canonicalSitemapUrls(`
      <urlset>
        <url><loc>https://${INDEXNOW_HOST}/</loc></url>
        <url><loc>https://${INDEXNOW_HOST}/services/kitchen-renovations/</loc></url>
        <url><loc>https://${INDEXNOW_HOST}/</loc></url>
      </urlset>
    `),
    [
      `https://${INDEXNOW_HOST}/`,
      `https://${INDEXNOW_HOST}/services/kitchen-renovations/`,
    ],
  );
  assert.throws(
    () => canonicalSitemapUrls("<urlset><url><loc>https://example.com/</loc></url></urlset>"),
    /not a canonical same-host URL/,
  );
  assert.throws(
    () => canonicalSitemapUrls(`<urlset><url><loc>https://${INDEXNOW_HOST}/?tracking=1</loc></url></urlset>`),
    /not a canonical same-host URL/,
  );
});

test("IndexNow changed-route policy narrows only exact routes and otherwise fails closed", () => {
  const sitemapUrls = [
    `https://${INDEXNOW_HOST}/`,
    `https://${INDEXNOW_HOST}/about/`,
    `https://${INDEXNOW_HOST}/blog/test-post/`,
  ];
  assert.deepEqual(
    selectChangedCanonicalUrls({ changedFiles: ["src/pages/about.astro"], sitemapUrls }),
    {
      policy: "changed_canonical_urls",
      reason: "Every runtime change mapped to an exact canonical sitemap URL.",
      urlList: [`https://${INDEXNOW_HOST}/about/`],
    },
  );
  assert.equal(
    selectChangedCanonicalUrls({ changedFiles: ["src/styles/global.css"], sitemapUrls }).policy,
    "all_canonical_urls",
  );
  assert.equal(
    selectChangedCanonicalUrls({ changedFiles: ["astro.config.mjs"], sitemapUrls }).policy,
    "all_canonical_urls",
  );
  assert.equal(
    selectChangedCanonicalUrls({ changedFiles: ["wrangler.toml"], sitemapUrls }).policy,
    "all_canonical_urls",
  );
  assert.equal(
    selectChangedCanonicalUrls({ changedFiles: ["src/pages/[service]/index.astro"], sitemapUrls }).policy,
    "all_canonical_urls",
  );
  assert.deepEqual(
    selectChangedCanonicalUrls({ changedFiles: ["docs/release.md"], sitemapUrls }).urlList,
    [],
  );
  assert.deepEqual(
    selectChangedCanonicalUrls({
      changedFiles: [
        ".github/workflows/deploy.yml",
        "docs/quality-evidence/dashboard-indexnow.md",
        "scripts/build-indexnow-route-manifest.mjs",
        "scripts/submit-indexnow.mjs",
        "scripts/test-seo-automation.mjs",
      ],
      sitemapUrls,
    }).urlList,
    [],
  );
});

test("IndexNow manifest derives a Git diff and falls back to every canonical on uncertainty", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mtc-indexnow-manifest-"));
  const previousCommit = "1111111111111111111111111111111111111111";
  const sourceCommit = "2222222222222222222222222222222222222222";
  try {
    await mkdir(path.join(root, "dist"));
    await writeFile(
      path.join(root, "dist", "sitemap-0.xml"),
      `<urlset><url><loc>https://${INDEXNOW_HOST}/</loc></url><url><loc>https://${INDEXNOW_HOST}/about/</loc></url></urlset>`,
    );
    const exact = await buildChangedRouteManifest({
      root,
      previousCommit,
      sourceCommit,
      outputPath: "exact.json",
      execImpl: (_command, args) => args[0] === "diff" ? "src/pages/about.astro\n" : "",
    });
    assert.equal(exact.policy, "changed_canonical_urls");
    assert.deepEqual(exact.urlList, [`https://${INDEXNOW_HOST}/about/`]);

    const fallback = await buildChangedRouteManifest({
      root,
      previousCommit,
      sourceCommit,
      outputPath: "fallback.json",
      execImpl: () => { throw new Error("history unavailable"); },
    });
    assert.equal(fallback.policy, "all_canonical_urls");
    assert.equal(fallback.urlCount, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("IndexNow sends changed URLs through the dashboard and writes a non-secret receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mtc-indexnow-"));
  try {
    await mkdir(path.join(root, "public"));
    await mkdir(path.join(root, "dist"));
    await writeFile(path.join(root, "public", `${INDEXNOW_KEY}.txt`), `${INDEXNOW_KEY}\n`);
    await writeFile(
      path.join(root, "dist", "sitemap-0.xml"),
      `<urlset><url><loc>https://${INDEXNOW_HOST}/</loc></url><url><loc>https://${INDEXNOW_HOST}/about/</loc></url></urlset>`,
    );
    await writeFile(
      path.join(root, "manifest.json"),
      JSON.stringify({ host: INDEXNOW_HOST, policy: "changed_canonical_urls", reason: "test", urlList: [`https://${INDEXNOW_HOST}/about/`] }),
    );
    let posted;
    let requestHeaders;
    const receipt = await submitIndexNow({
      root,
      manifestPath: "manifest.json",
      now: () => new Date("2026-08-13T19:00:00.000Z"),
      releaseReceiptSecret: "mtc-site-secret",
      releaseCommit: "0123456789abcdef0123456789abcdef01234567",
      deploymentId: "deployment-123",
      fetchImpl: async (_url, options) => {
        posted = JSON.parse(options.body);
        requestHeaders = options.headers;
        return new Response(JSON.stringify({
          ok: true,
          duplicate: false,
          status: "accepted",
          http_status: 200,
          submission_id: "indexnow-mtc-123",
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    assert.deepEqual(posted, {
      client_slug: "mtcrenovations",
      deployment_id: "deployment-123",
      urls: [`https://${INDEXNOW_HOST}/about/`],
    });
    assert.equal(requestHeaders["x-release-receipt-secret"], "mtc-site-secret");
    assert.equal(receipt.status, "accepted");
    assert.equal(receipt.httpStatus, 200);
    assert.match(receipt.payloadSha256, /^[0-9a-f]{64}$/);
    const stored = JSON.parse(
      await readFile(path.join(root, "artifacts", "indexnow-receipt.json"), "utf8"),
    );
    assert.equal(stored.attemptedAt, "2026-08-13T19:00:00.000Z");
    assert.equal(stored.selectionPolicy, "changed_canonical_urls");
    assert.equal(JSON.stringify(stored).includes("mtc-site-secret"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("IndexNow records no-change through the dashboard without a provider submission", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mtc-indexnow-empty-"));
  try {
    await mkdir(path.join(root, "public"));
    await mkdir(path.join(root, "dist"));
    await writeFile(path.join(root, "public", `${INDEXNOW_KEY}.txt`), `${INDEXNOW_KEY}\n`);
    await writeFile(path.join(root, "dist", "sitemap-0.xml"), `<urlset><url><loc>https://${INDEXNOW_HOST}/</loc></url></urlset>`);
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ host: INDEXNOW_HOST, policy: "changed_canonical_urls", reason: "none", urlList: [] }));
    let requests = 0;
    const receipt = await submitIndexNow({
      root,
      manifestPath: "manifest.json",
      releaseReceiptSecret: "mtc-site-secret",
      releaseCommit: "0123456789abcdef0123456789abcdef01234567",
      deploymentId: "deployment-123",
      fetchImpl: async (_url, options) => {
        requests += 1;
        assert.deepEqual(JSON.parse(options.body).urls, []);
        return new Response(JSON.stringify({
          ok: true,
          duplicate: false,
          status: "not_required_no_changed_urls",
          url_count: 0,
          capability_receipt_id: "indexnow-no-change-mtc",
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    assert.equal(receipt.status, "not_required_no_changed_urls");
    assert.equal(receipt.urlCount, 0);
    assert.equal(requests, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("IndexNow rejects missing site credentials before network and sanitizes provider failure", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mtc-indexnow-failure-"));
  try {
    await mkdir(path.join(root, "public"));
    await mkdir(path.join(root, "dist"));
    await writeFile(path.join(root, "public", `${INDEXNOW_KEY}.txt`), `${INDEXNOW_KEY}\n`);
    await writeFile(path.join(root, "dist", "sitemap-0.xml"), `<urlset><url><loc>https://${INDEXNOW_HOST}/</loc></url></urlset>`);
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ host: INDEXNOW_HOST, policy: "changed_canonical_urls", reason: "test", urlList: [`https://${INDEXNOW_HOST}/`] }));
    let requests = 0;
    await assert.rejects(
      submitIndexNow({
        root,
        manifestPath: "manifest.json",
        releaseReceiptSecret: "",
        releaseCommit: "0123456789abcdef0123456789abcdef01234567",
        deploymentId: "deployment-123",
        fetchImpl: async () => { requests += 1; },
      }),
      (error) => error.code === "missing_secret",
    );
    assert.equal(requests, 0);

    const sensitive = "provider internal detail";
    await assert.rejects(
      submitIndexNow({
        root,
        manifestPath: "manifest.json",
        releaseReceiptSecret: "mtc-site-secret",
        releaseCommit: "0123456789abcdef0123456789abcdef01234567",
        deploymentId: "deployment-123",
        fetchImpl: async () => new Response(JSON.stringify({
          ok: true,
          duplicate: true,
          status: "failed",
          http_status: 403,
          submission_id: "indexnow-mtc-failed-123",
          error: sensitive,
        }), { status: 200, headers: { "content-type": "application/json" } }),
      }),
      (error) => error.code === "provider_failure",
    );
    const stored = await readFile(path.join(root, "artifacts", "indexnow-receipt.json"), "utf8");
    assert.equal(stored.includes(sensitive), false);
    assert.equal(stored.includes("mtc-site-secret"), false);
    assert.match(stored, /indexnow-mtc-failed-123/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("combined release receipt always contains the dashboard contract without secrets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mtc-release-receipt-"));
  try {
    const indexNowReceiptPath = path.join(root, "indexnow.json");
    const outputPath = path.join(root, "release.json");
    await writeFile(indexNowReceiptPath, JSON.stringify({ status: "accepted" }));
    const receipt = await writeReleaseReceipt({
      outputPath,
      indexNowReceiptPath,
      env: {
        SOURCE_COMMIT: "0123456789abcdef0123456789abcdef01234567",
        DEPLOYMENT_ID: "deployment-123",
        DEPLOYMENT_IDENTITY_OUTCOME: "success",
        PRODUCTION_VERIFY_OUTCOME: "success",
        ROLLBACK_OUTCOME: "skipped",
        INDEXNOW_OUTCOME: "success",
      },
      now: () => new Date("2026-08-13T20:00:00.000Z"),
    });
    assert.deepEqual(
      Object.fromEntries(["site", "candidate_sha", "deployment_id", "verification_status", "verified_at", "rollback_status", "indexnow_status"].map((key) => [key, receipt[key]])),
      {
        site: "mtcrenovations",
        candidate_sha: "0123456789abcdef0123456789abcdef01234567",
        deployment_id: "deployment-123",
        verification_status: "passed",
        verified_at: "2026-08-13T20:00:00.000Z",
        rollback_status: "not_required",
        indexnow_status: "accepted",
      },
    );
    assert.doesNotMatch(JSON.stringify(receipt), /token|secret|authorization/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("combined release receipt records rollback and noncritical IndexNow failures explicitly", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mtc-release-failure-receipt-"));
  try {
    const receipt = await writeReleaseReceipt({
      outputPath: path.join(root, "release.json"),
      indexNowReceiptPath: path.join(root, "missing-indexnow.json"),
      env: {
        SOURCE_COMMIT: "0123456789abcdef0123456789abcdef01234567",
        DEPLOYMENT_IDENTITY_OUTCOME: "success",
        PRODUCTION_VERIFY_OUTCOME: "failure",
        ROLLBACK_OUTCOME: "failure",
        INDEXNOW_OUTCOME: "failure",
      },
      now: () => new Date("2026-08-13T20:01:00.000Z"),
    });
    assert.equal(receipt.verification_status, "failed");
    assert.equal(receipt.rollback_status, "failed");
    assert.equal(receipt.indexnow_status, "failed_noncritical");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production workflow binds build, deploy, verification, and rollback to the release contract", async () => {
  const workflow = await readFile(".github/workflows/deploy.yml", "utf8");
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(workflow, /SOURCE_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /refs\/heads\/\$SOURCE_BRANCH:refs\/remotes\/origin\/\$SOURCE_BRANCH/);
  assert.match(workflow, /PUBLIC_RELEASE_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /--commit-hash=\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /verify --expected-commit=\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /post-deploy-safety\.mjs confirm --expected-commit=/);
  assert.match(workflow, /post-deploy-safety\.mjs rollback --deployment-id=/);
  assert.match(workflow, /EXACT_RESTORE_REQUIRED/);
  assert.match(workflow, /verify --profile=baseline --expected-commit=/);
  assert.doesNotMatch(workflow, /INDEXNOW_KEY_MTC/);
  assert.match(workflow, /id: indexnow[\s\S]+continue-on-error:\s*true/);
  assert.match(workflow, /steps\.release_receipt\.outcome == 'success'/);
  assert.match(workflow, /RELEASE_DEPLOYMENT_ID: \$\{\{ steps\.release_receipt\.outputs\.deployment_id \}\}/);
  assert.match(workflow, /build-indexnow-route-manifest\.mjs/);
  assert.match(workflow, /write-release-receipt\.mjs/);
  assert.match(workflow, /artifacts\/release-receipt\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /artifacts\/indexnow-receipt\.json/);
  assert.doesNotMatch(workflow, /api\.indexnow\.org/);
  assert.match(packageJson.scripts.build, /check-release-metadata\.mjs/);
});

test("quality workflow runs for Astro and Wrangler configuration-only pull requests", async () => {
  const workflow = await readFile(".github/workflows/seo-build-health.yml", "utf8");
  assert.match(workflow, /- 'astro\.config\.mjs'/);
  assert.match(workflow, /- 'wrangler\.toml'/);
});
