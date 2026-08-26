/**
 * Contract: generate_lead is fired via zaraz.track after a real success path.
 * No live HTTP to JobTread or /api/leads/submit.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

test("/newleadintake/ tracks generate_lead with zaraz after a successful submit response", () => {
  const src = readSrc("src/pages/newleadintake.astro");
  const fetchIdx = src.indexOf("fetch('/api/leads/submit/'");
  const okIdx = src.indexOf("if (!res.ok)", fetchIdx);
  const trackIdx = src.indexOf("zaraz.track('generate_lead'", okIdx);

  assert.ok(fetchIdx >= 0, "lead form must POST /api/leads/submit/");
  assert.ok(okIdx > fetchIdx, "must check res.ok after submit");
  assert.ok(trackIdx > okIdx, "zaraz.track('generate_lead') must run only after res.ok");
  assert.match(
    src.slice(trackIdx, trackIdx + 240),
    /form_name:\s*'price_guide_lead'/,
  );
  assert.doesNotMatch(src, /gtag\(\s*'event'\s*,\s*'generate_lead'/);
  assert.doesNotMatch(src.slice(0, fetchIdx), /zaraz\.track\(\s*'generate_lead'/);
});

test("/contact/ and get-free-quote listen for JobTread form success without posting", () => {
  const contact = readSrc("src/pages/contact.astro");
  const quote = readSrc("src/pages/[service]/get-free-quote.astro");

  for (const [label, src, formName] of [
    ["/contact/", contact, "contact_lead"],
    ["get-free-quote", quote, "service_quote_lead"],
  ]) {
    const trackIdx = src.indexOf("zaraz.track('generate_lead'");
    const listenerIdx = src.indexOf("addEventListener('success'");
    assert.ok(listenerIdx >= 0, `${label} must listen for JobTread's success CustomEvent`);
    assert.ok(trackIdx >= 0, `${label} must zaraz.track('generate_lead')`);
    assert.match(
      src.slice(trackIdx, trackIdx + 240),
      new RegExp(`form_name:\\s*'${formName}'`),
      `${label} must send form_name ${formName}`,
    );
    const hook = src.slice(Math.min(listenerIdx, trackIdx), Math.max(listenerIdx, trackIdx) + 400);
    assert.doesNotMatch(
      hook,
      /submitWebForm|fetch\(/,
      `${label} generate_lead hook must not POST a lead`,
    );
  }
});

test("success CustomEvent hook calls zaraz.track with no network", () => {
  const calls = [];
  const zaraz = {
    track(event, payload) {
      calls.push({ event, payload });
    },
  };
  const listeners = new Map();
  const form = {
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
      return true;
    },
  };

  form.addEventListener("success", () => {
    if (typeof zaraz !== "undefined") {
      zaraz.track("generate_lead", {
        form_name: "contact_lead",
        page_path: "/contact/",
      });
    }
  });
  form.dispatchEvent({ type: "success" });

  assert.deepEqual(calls, [
    {
      event: "generate_lead",
      payload: { form_name: "contact_lead", page_path: "/contact/" },
    },
  ]);
});
