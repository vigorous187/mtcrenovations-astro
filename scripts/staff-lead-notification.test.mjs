import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/email.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { sendStaffLeadNotification } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

const submittedAt = new Date("2026-01-15T15:30:00Z");
const lead = {
  name: "Ada Lovelace",
  phone: "647-555-0142",
  email: "ada@example.com",
  address: "10 Main St",
  city: "Hamilton",
  projectType: "Remodel",
  description: "Kitchen and a <script> note",
  source: "price-guide",
  estimateId: "est_123",
  submittedAt,
  jobId: "job_9",
  jobName: "Price Guide — Kitchen",
  customerId: "cust_4",
};

const token = "email-token-do-not-leak";
const grantKey = "grant-key-do-not-leak";

function env(overrides = {}) {
  return {
    ESTIMATES: {},
    CLOUDFLARE_EMAIL_API_TOKEN: token,
    JOBTREAD_GRANT_KEY: grantKey,
    STAFF_LEAD_NOTIFY_TO: "michael@mtcrenovations.ca, mtc-cos+webleads@mail.grokbot.com",
    ...overrides,
  };
}

async function captureSend(notifyEnv, notifyLead = lead) {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      headers: init.headers,
      body: JSON.parse(init.body),
    });
    return Response.json({ success: true });
  };
  try {
    const result = await sendStaffLeadNotification(notifyLead, notifyEnv);
    return { result, calls };
  } finally {
    globalThis.fetch = previous;
  }
}

test("missing or blank staff recipients skip without sending", async () => {
  for (const STAFF_LEAD_NOTIFY_TO of [undefined, "", "   ", " , "]) {
    const { result, calls } = await captureSend(env({ STAFF_LEAD_NOTIFY_TO }));
    assert.deepEqual(result, { ok: true, skipped: true });
    assert.equal(calls.length, 0);
  }
});

test("staff notice is plain text from info@ to each recipient", async () => {
  const { result, calls } = await captureSend(env());
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/email\/sending\/send$/);

  const bodies = calls.map((call) => call.body);
  assert.deepEqual(bodies.map((body) => body.to), [
    "michael@mtcrenovations.ca",
    "mtc-cos+webleads@mail.grokbot.com",
  ]);
  for (const body of bodies) {
    assert.equal(body.from, "info@mtcrenovations.ca");
    assert.equal(body.subject, "New web lead: Ada Lovelace (price-guide)");
    assert.match(body.text, /Name: Ada Lovelace/);
    assert.match(body.text, /Phone: 647-555-0142/);
    assert.match(body.text, /Email: ada@example.com/);
    assert.match(body.text, /Address: 10 Main St/);
    assert.match(body.text, /City: Hamilton/);
    assert.match(body.text, /Project type: Remodel/);
    assert.match(body.text, /Description:\nKitchen and a <script> note/);
    assert.match(body.text, /Source: price-guide \(estimate est_123\)/);
    assert.match(body.text, /Submitted \(America\/Toronto\): Jan 15, 2026, 10:30 a\.m\. EST/);
    assert.match(body.text, /JobTread job id: job_9/);
    assert.match(body.text, /JobTread job name: Price Guide — Kitchen/);
    assert.match(body.text, /JobTread customer id: cust_4/);
    assert.equal(body.text.includes(token), false);
    assert.equal(body.text.includes(grantKey), false);
    assert.equal(body.html.includes(token), false);
    assert.equal(body.html.includes("<script>"), false);
    assert.match(body.html, /&lt;script&gt;/);
    assert.equal(callHeader(calls[0], "authorization").includes(token), true);
  }
});

test("address and city are omitted when absent", async () => {
  const { result, calls } = await captureSend(
    env({ STAFF_LEAD_NOTIFY_TO: "desk@mtcrenovations.ca" }),
    {
      name: "No Address",
      phone: "647-555-0100",
      email: "none@example.com",
      source: "Website",
      submittedAt,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.subject, "New web lead: No Address (Website)");
  assert.equal(calls[0].body.text.includes("Address:"), false);
  assert.equal(calls[0].body.text.includes("City:"), false);
  assert.equal(calls[0].body.text.includes("JobTread"), false);
  assert.match(calls[0].body.text, /Source: Website/);
});

test("an email API failure is reported and does not throw", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: false, errors: [{ message: "rejected" }] }, { status: 400 });
  try {
    const result = await sendStaffLeadNotification(lead, env({ STAFF_LEAD_NOTIFY_TO: "desk@mtcrenovations.ca" }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "api_error");
  } finally {
    globalThis.fetch = previous;
  }
});

test("without an API token the same message uses the EMAIL binding", async () => {
  const sent = [];
  const bindingEnv = env({
    CLOUDFLARE_EMAIL_API_TOKEN: undefined,
    STAFF_LEAD_NOTIFY_TO: "desk@mtcrenovations.ca",
    EMAIL: {
      async send(message) {
        sent.push(message);
        return {};
      },
    },
  });
  const previous = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error("binding path should not use fetch");
  };
  try {
    const result = await sendStaffLeadNotification(lead, bindingEnv);
    assert.deepEqual(result, { ok: true });
    assert.equal(fetched, false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "desk@mtcrenovations.ca");
    assert.equal(sent[0].from.email, "info@mtcrenovations.ca");
    assert.equal(sent[0].subject, "New web lead: Ada Lovelace (price-guide)");
    assert.match(sent[0].text, /JobTread customer id: cust_4/);
    assert.equal(sent[0].text.includes(grantKey), false);
  } finally {
    globalThis.fetch = previous;
  }
});

function callHeader(call, name) {
  const headers = call.headers;
  const value = headers[name] ?? headers[name[0].toUpperCase() + name.slice(1)] ?? headers.Authorization;
  return String(value ?? "");
}
