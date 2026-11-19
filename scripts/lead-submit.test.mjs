import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

// Exercise the real route with only its external CRM/email boundaries replaced.
const bundle = await build({
  entryPoints: ["src/pages/api/leads/submit.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [{
    name: "lead-test-boundaries",
    setup(build) {
      build.onLoad({ filter: /\/lib\/jobtread-pave\.ts$/ }, () => ({
        contents: "export const createCustomerLead = (...args) => globalThis.leadTest.crm(...args);",
      }));
      build.onLoad({ filter: /\/lib\/email\.ts$/ }, () => ({
        contents: "export const sendLeadConfirmationEmail = (...args) => globalThis.leadTest.email(...args);",
      }));
    },
  }],
});
const { POST } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const receipt = { accountId: "account", contactId: "contact", locationId: "location", jobId: "job", created: true };
const input = { name: " Test Lead ", email: " TEST@EXAMPLE.COM ", phone: "202-555-0142", address: "TEST ONLY", hearAbout: "Website", remodelType: "Other" };
const estimate = { id: "saved", type: "bathroom", typeLabel: "Bathroom", sizeLabel: "Small", finishLabel: "Standard", min: 10000, max: 20000 };

async function submit(body, { saved, configured = true, crmError } = {}) {
  const effects = [];
  globalThis.leadTest = {
    crm: async (_key, _org, lead) => {
      effects.push({ kind: "crm", lead });
      if (crmError) throw crmError;
      return receipt;
    },
    email: async (saved, lead) => effects.push({ kind: "email", saved, lead }),
  };
  const response = await POST({
    request: new Request("https://example.com/api/leads/submit/", { method: "POST", body: JSON.stringify(body) }),
    locals: { runtime: { env: {
      ...(configured ? { JOBTREAD_GRANT_KEY: "test", JOBTREAD_ORG_ID: "test" } : {}),
      ESTIMATES: {
        get: async () => saved ? JSON.stringify(saved) : null,
        put: async (key, value) => effects.push({ kind: "save", key, value: JSON.parse(value) }),
      },
    } } },
  });
  return { status: response.status, body: await response.json(), effects };
}

test("invalid CRM picklists fail before creating or confirming a lead", async () => {
  for (const invalid of [{ hearAbout: "Other" }, { remodelType: "General Contracting" }]) {
    const result = await submit({ ...input, ...invalid, estimateId: "saved" }, { saved: estimate });
    assert.equal(result.status, 400);
    assert.equal(result.body.success, undefined);
    assert.deepEqual(result.effects, []);
  }
});

test("missing delivery configuration cannot send confirmation or mark an estimate submitted", async () => {
  const result = await submit({ ...input, estimateId: "saved" }, { saved: estimate, configured: false });
  assert.equal(result.status, 503);
  assert.deepEqual(result.effects, []);
});

test("JobTread failure returns an error without confirmation, saved state, or debug disclosure", async () => {
  const result = await submit({ ...input, estimateId: "saved" }, { saved: estimate, crmError: new Error("upstream-private-detail") });
  assert.equal(result.status, 502);
  assert.deepEqual(result.effects.map(effect => effect.kind), ["crm"]);
  assert.equal(result.body.success, undefined);
  assert.equal(result.body.debug, undefined);
  assert.doesNotMatch(JSON.stringify(result.body), /upstream-private-detail/);
});

test("successful standalone lead returns its CRM receipt and only then sends confirmation", async () => {
  const result = await submit(input);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, syncPending: false, jobTread: { accountId: "account", jobId: "job", created: true } });
  assert.deepEqual(result.effects.map(effect => effect.kind), ["crm", "email"]);
  assert.equal(result.effects[0].lead.email, "test@example.com");
  assert.deepEqual(result.effects[1].lead, { name: "Test Lead", email: "test@example.com" });
});

test("saved estimates infer current JobTread options and persist the actual receipt before email", async () => {
  for (const [type, scope, expected] of [
    ["bathroom", undefined, "Remodel"],
    ["basement", "legal-suite", "New construction"],
    ["garden-suite-adu", undefined, "New construction"],
    ["multi-unit", undefined, "New construction"],
  ]) {
    const result = await submit({ ...input, estimateId: "saved", hearAbout: undefined, remodelType: undefined }, { saved: { ...estimate, type, scope } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.effects.map(effect => effect.kind), ["crm", "save", "email"]);
    assert.equal(result.effects[0].lead.hearAbout, "Price Guide");
    assert.equal(result.effects[0].lead.remodelType, expected);
    assert.equal(result.effects[1].value.leadSubmitted, true);
    const { created, ...ids } = receipt;
    assert.deepEqual(result.effects[1].value.jobTread, ids);
    assert.equal(result.effects[2].saved.jobTread.jobId, "job");
  }
});
