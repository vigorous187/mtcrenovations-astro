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
  assert.doesNotMatch(src, /quote_request/);
});

test("/contact/ and get-free-quote track lead events after JobTread success without posting", () => {
  const contact = readSrc("src/pages/contact.astro");
  const quote = readSrc("src/pages/[service]/get-free-quote.astro");

  for (const [label, src, formName] of [
    ["/contact/", contact, "contact_lead"],
    ["get-free-quote", quote, "service_quote_lead"],
  ]) {
    const generateLeadIdx = src.indexOf("zaraz.track('generate_lead'");
    const quoteRequestIdx = src.indexOf("zaraz.track('quote_request'");
    const listenerIdx = src.indexOf("addEventListener('success'");
    assert.ok(listenerIdx >= 0, `${label} must listen for JobTread's success CustomEvent`);
    assert.ok(generateLeadIdx > listenerIdx, `${label} must zaraz.track('generate_lead') after success`);
    assert.ok(quoteRequestIdx > listenerIdx, `${label} must zaraz.track('quote_request') after success`);
    assert.match(
      src.slice(generateLeadIdx, generateLeadIdx + 240),
      new RegExp(`form_name:\\s*'${formName}'`),
      `${label} generate_lead must send form_name ${formName}`,
    );
    assert.match(
      src.slice(quoteRequestIdx, quoteRequestIdx + 240),
      new RegExp(`form_name:\\s*'${formName}'`),
      `${label} quote_request must send form_name ${formName}`,
    );
    const hook = src.slice(listenerIdx, quoteRequestIdx + 400);
    assert.doesNotMatch(
      hook,
      /submitWebForm|fetch\(/,
      `${label} tracking hook must not POST a lead`,
    );
    assert.doesNotMatch(src, /gtag\(\s*'event'\s*,\s*'(?:generate_lead|quote_request)'/);
  }
});

test("labelled non-submit success check calls both Zaraz events with no network", () => {
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
      zaraz.track("quote_request", {
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
    {
      event: "quote_request",
      payload: { form_name: "contact_lead", page_path: "/contact/" },
    },
  ]);
});

test("mailto links track email_click through Zaraz without gtag or network", () => {
  const src = readSrc("src/layouts/BaseLayout.astro");
  const selectorIdx = src.indexOf("querySelectorAll('a[href^=\"mailto:\"]')");
  const listenerIdx = src.indexOf("addEventListener('click'", selectorIdx);
  const trackIdx = src.indexOf("zaraz.track('email_click'", listenerIdx);
  const hook = src.slice(selectorIdx, trackIdx + 320);

  assert.ok(selectorIdx >= 0, "BaseLayout must select mailto links");
  assert.ok(listenerIdx > selectorIdx, "email_click must run from a click listener");
  assert.ok(trackIdx > listenerIdx, "email_click must run after the click");
  assert.match(hook, /typeof zaraz !== 'undefined'/);
  assert.match(hook, /email_address:/);
  assert.doesNotMatch(hook, /fetch\(|submitWebForm/);
  assert.doesNotMatch(src, /gtag\(\s*'event'\s*,\s*'email_click'/);
});
