import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  selectExactProductionDeployment,
  sendVerifiedReleaseReceipt,
} from "./send-release-receipt.mjs";

const candidateSha = "a".repeat(40);
const cloudflareSecret = "cloudflare-secret-that-must-never-leak";
const receiptSecret = "receipt-secret-that-must-never-leak";

function deployment(overrides = {}) {
  return {
    id: "pages-deployment-id",
    project_name: "mtc-renovations",
    environment: "production",
    latest_stage: { status: "success" },
    deployment_trigger: {
      metadata: { branch: "main", commit_hash: candidateSha, commit_dirty: false },
    },
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function options(fetchImpl, overrides = {}) {
  return {
    site: "mtcrenovations.ca",
    candidateSha,
    projectName: "mtc-renovations",
    branch: "main",
    accountId: "account-id",
    cloudflareApiToken: cloudflareSecret,
    releaseReceiptSecret: receiptSecret,
    fetchImpl,
    sleepImpl: async () => {},
    now: () => new Date("2026-08-25T16:00:00.000Z"),
    ...overrides,
  };
}

test("selects only the exact clean successful production deployment", () => {
  assert.equal(
    selectExactProductionDeployment([deployment()], {
      projectName: "mtc-renovations",
      branch: "main",
      candidateSha,
    }).id,
    "pages-deployment-id",
  );
  for (const bad of [
    { environment: "preview" },
    { latest_stage: { status: "failure" } },
    { deployment_trigger: { metadata: { branch: "main", commit_hash: "b".repeat(40), commit_dirty: false } } },
    { deployment_trigger: { metadata: { branch: "main", commit_hash: candidateSha, commit_dirty: true } } },
  ]) {
    assert.throws(
      () => selectExactProductionDeployment([deployment(bad)], {
        projectName: "mtc-renovations",
        branch: "main",
        candidateSha,
      }),
      /production deployment|exact clean release SHA/,
    );
  }
});

test("posts the exact provider-backed receipt without exposing credentials", async () => {
  const calls = [];
  const report = await sendVerifiedReleaseReceipt(options(async (input, init) => {
    calls.push({ input: String(input), init });
    if (calls.length === 1) {
      return jsonResponse({ success: true, result: [deployment()] });
    }
    return jsonResponse({ ok: true, capability_receipt_id: "dashboard-receipt-id" });
  }));

  assert.equal(calls.length, 2);
  assert.match(calls[0].input, /cloudflare\.com\/client\/v4/);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${cloudflareSecret}`);
  assert.equal(calls[1].init.headers["x-release-receipt-secret"], receiptSecret);
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    schema_version: 1,
    site: "mtcrenovations.ca",
    candidate_sha: candidateSha,
    deployment_ids: { pages: "pages-deployment-id" },
    verification_status: "passed",
    verified_at: "2026-08-25T16:00:00.000Z",
    rollback_status: "not_required",
  });
  assert.equal(report.sender_status, "accepted");
  assert.equal(report.sender_attempts, 1);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(`${cloudflareSecret}|${receiptSecret}`));
});

test("never posts before exact provider verification passes", async () => {
  const calls = [];
  await assert.rejects(
    () => sendVerifiedReleaseReceipt(options(async (input, init) => {
      calls.push({ input: String(input), init });
      return jsonResponse({
        success: true,
        result: [deployment({
          deployment_trigger: {
            metadata: { branch: "main", commit_hash: "b".repeat(40), commit_dirty: false },
          },
        })],
      });
    })),
    /exact clean release SHA/,
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].input, /cloudflare\.com/);
});

test("retries dashboard delivery a bounded three times", async () => {
  const calls = [];
  const report = await sendVerifiedReleaseReceipt(options(async (input, init) => {
    calls.push({ input: String(input), init });
    if (calls.length === 1) {
      return jsonResponse({ success: true, result: [deployment()] });
    }
    if (calls.length < 4) return jsonResponse({ error: "temporary" }, 503);
    return jsonResponse({ ok: true });
  }));
  assert.equal(calls.length, 4);
  assert.equal(report.sender_attempts, 3);

  let failedCalls = 0;
  await assert.rejects(
    () => sendVerifiedReleaseReceipt(options(async () => {
      failedCalls += 1;
      if (failedCalls === 1) {
        return jsonResponse({ success: true, result: [deployment()] });
      }
      return jsonResponse({ error: "temporary" }, 503);
    })),
    /after 3 attempts/,
  );
  assert.equal(failedCalls, 4);

  let networkCalls = 0;
  await assert.rejects(
    () => sendVerifiedReleaseReceipt(options(async () => {
      networkCalls += 1;
      if (networkCalls === 1) {
        return jsonResponse({ success: true, result: [deployment()] });
      }
      throw new Error(`network failure containing ${receiptSecret}`);
    })),
    (error) => {
      assert.match(error.message, /after 3 attempts/);
      assert.doesNotMatch(error.message, new RegExp(receiptSecret));
      assert.doesNotMatch(JSON.stringify(error.evidence), new RegExp(receiptSecret));
      return true;
    },
  );
  assert.equal(networkCalls, 4);
});

test("sender runs only after the guarded production verification path", () => {
  const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
  const deploy = workflow.indexOf("cloudflare/wrangler-action@v3");
  const live = workflow.indexOf("Verify production critically");
  const localReceipt = workflow.indexOf("Record combined release receipt");
  const sender = workflow.indexOf("Send verified release receipt to SEO dashboard");
  const indexNow = workflow.indexOf("Submit changed canonical URLs through SEO dashboard");
  assert.ok(deploy >= 0 && live > deploy && sender > live && indexNow > sender && localReceipt > indexNow);
  assert.match(workflow, /if: \$\{\{ steps\.production_verify\.outcome == 'success' \}\}/);
  assert.match(workflow, /continue-on-error:\s*true/);
  assert.match(workflow, /npm run release:test/);
  assert.match(workflow, /secrets\.RELEASE_RECEIPT_SECRET/);
  assert.match(workflow, /retention-days:\s*90/);
  assert.match(
    readFileSync(".github/workflows/seo-build-health.yml", "utf8"),
    /npm run release:test/,
  );
  for (const otherPath of [
    ".github/workflows/blog-automation.yml",
    ".github/workflows/seo-build-health.yml",
    ".github/workflows/seo-guideline-drift.yml",
  ]) {
    assert.doesNotMatch(
      readFileSync(otherPath, "utf8"),
      /RELEASE_RECEIPT_SECRET|send-release-receipt/,
    );
  }
});

test("sender logging paths never interpolate either credential", () => {
  const source = readFileSync("scripts/send-release-receipt.mjs", "utf8");
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:apiToken|releaseReceiptSecret)/);
});
