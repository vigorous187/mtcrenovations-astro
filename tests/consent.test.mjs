import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const layout = readFileSync(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8');
const scripts = [...layout.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)].map(match => match[1]);
function browser({ ready = false, analytics = false, advertising = false } = {}) {
  const listeners = new Map();
  const privacy = { disabled: true };
  const resources = [];
  const tracked = [];
  const cleanups = [];
  let reloads = 0;
  const choices = { analytics, advertising };
  const links = new Map(['tel:', 'mailto:', 'cta'].map(kind => [kind, {
    click: null, textContent: 'Contact', dataset: {},
    addEventListener(_name, fn) { this.click = fn; },
    getAttribute() { return kind === 'cta' ? '/contact/' : kind + 'example'; },
    closest() { return null; },
  }]));
  const document = {
    addEventListener(name, fn) { listeners.set(name, [...(listeners.get(name) || []), fn]); },
    querySelectorAll(selector) {
      if (selector === '[data-mtc-privacy-choices]') return [privacy];
      if (selector === 'a[href^="tel:"]') return [links.get('tel:')];
      if (selector === 'a[href^="mailto:"]') return [links.get('mailto:')];
      return [links.get('cta')];
    },
    createElement() { return {}; },
    getElementsByTagName() { return [{ parentNode: { insertBefore(script) { resources.push(script.src); } } }]; },
  };
  const window = { document, fetch(url, options) { cleanups.push({ url, options }); return Promise.resolve({ ok: true }); }, location: { pathname: '/', reload() { reloads++; } },
    zaraz: { consent: { APIReady: ready, get(purpose) { return choices[purpose]; } },
      track(...args) { tracked.push(args); } } };
  window.window = window;
  const context = vm.createContext(window);
  const run = script => vm.runInContext(script, context);
  const fire = name => Promise.all((listeners.get(name) || []).map(fn => fn()));
  return { window, choices, resources, tracked, cleanups, privacy, links, run, fire, reloads: () => reloads };
}

test('Meta stays unloaded until advertising consent, loads once, tracks navigation and reloads on withdrawal', async () => {
  const b = browser();
  const script = scripts.find(script => script.includes('__mtcConsentInitialized'));
  b.run(script);
  assert.deepEqual(b.resources, []);
  b.window.zaraz.consent.APIReady = true;
  b.choices.analytics = true;
  b.fire('zarazConsentAPIReady');
  assert.equal(b.privacy.disabled, false);
  assert.deepEqual(b.resources, []);
  b.choices.advertising = true;
  b.fire('zarazConsentChoicesUpdated');
  assert.equal(b.resources.length, 1);
  assert.match(b.resources[0], /connect.facebook.net/);
  const views = () => b.window.fbq.queue.filter(args => args[0] === 'track').length;
  assert.equal(views(), 1);
  b.run(script);
  b.fire('zarazConsentChoicesUpdated');
  assert.equal(views(), 1);
  b.fire('astro:after-swap');
  assert.equal(views(), 2);
  b.choices.advertising = false;
  await b.fire('zarazConsentChoicesUpdated');
  assert.equal(b.reloads(), 1);
  assert.equal(b.window.fbq.queue.at(-1)[1], 'revoke');
  assert.doesNotMatch(layout, /<noscript><img[^>]+facebook/);
});

test('stored advertising consent loads Meta, while click events independently require analytics consent', () => {
  const b = browser({ ready: true, advertising: true });
  b.run(scripts.find(script => script.includes('__mtcConsentInitialized')));
  assert.equal(b.resources.length, 1);
  b.run(scripts.find(script => script.includes('function initGATracking')));
  b.fire('DOMContentLoaded');
  for (const link of b.links.values()) link.click();
  assert.deepEqual(b.tracked, []);
  b.choices.analytics = true;
  for (const link of b.links.values()) link.click();
  assert.deepEqual(b.tracked.map(args => args[0]), ['phone_click', 'email_click', 'cta_click']);
  b.choices.analytics = false;
  for (const link of b.links.values()) link.click();
  assert.equal(b.tracked.length, 3);
});

test('JobTread success handlers preserve accepted conversions and do not queue rejected submissions', () => {
  for (const page of ['contact.astro', '[service]/get-free-quote.astro']) {
    const source = readFileSync(new URL('../src/pages/' + page, import.meta.url), 'utf8');
    const callback = source.match(/^([ \t]*)form\.addEventListener\('success', (function\(\) \{[\s\S]*?)^\1\}\);/m);
    assert.ok(callback, page);
    const b = browser({ ready: true });
    const success = b.run('(' + callback[2] + '\n})');
    success();
    assert.deepEqual(b.tracked, [], page);
    b.choices.analytics = true;
    assert.deepEqual(b.tracked, [], 'Consent acceptance must not replay a previously rejected conversion');
    success();
    assert.deepEqual(b.tracked.map(args => args[0]), ['generate_lead', 'quote_request'], page);
  }
});

test('withdrawal waits for cookie cleanup and repeated choice events share the request', async () => {
  const b = browser({ ready: true, analytics: true, advertising: true });
  b.run(scripts.find(script => script.includes('__mtcConsentInitialized')));
  let complete;
  b.window.fetch = (url, options) => {
    b.cleanups.push({ url, options });
    return new Promise(resolve => { complete = resolve; });
  };
  b.choices.analytics = false;
  b.choices.advertising = false;
  const first = b.fire('zarazConsentChoicesUpdated');
  const duplicate = b.fire('zarazConsentChoicesUpdated');
  assert.equal(b.cleanups.length, 1);
  assert.equal(b.reloads(), 0);
  assert.equal(b.window.fbq.queue.at(-1)[1], 'revoke');
  complete({ ok: true });
  await Promise.all([first, duplicate]);
  assert.equal(b.reloads(), 1);
});

test('pending consent cleans old cookies once without reload; failed cleanup never causes a reload loop', async () => {
  const pending = browser({ ready: true });
  pending.run(scripts.find(script => script.includes('__mtcConsentInitialized')));
  await pending.fire('zarazConsentChoicesUpdated');
  assert.equal(pending.cleanups.length, 1);
  assert.equal(pending.cleanups[0].url, '/api/privacy/clear-analytics/');
  assert.equal(pending.reloads(), 0);
  const b = browser({ ready: true, analytics: true, advertising: true });
  b.run(scripts.find(script => script.includes('__mtcConsentInitialized')));
  b.window.fetch = () => Promise.reject(new Error('offline'));
  b.choices.advertising = false;
  await b.fire('zarazConsentChoicesUpdated');
  await b.fire('zarazConsentChoicesUpdated');
  assert.equal(b.reloads(), 0);
  assert.equal(b.window.fbq.queue.at(-1)[1], 'revoke');
});

test('analytics-only withdrawal cleans without Meta reload and failed cleanup retries on a later event', async () => {
  const b = browser({ ready: true, analytics: true });
  b.run(scripts.find(script => script.includes('__mtcConsentInitialized')));
  await b.fire('zarazConsentChoicesUpdated');
  let requests = 0;
  b.window.fetch = () => { requests++; return Promise.resolve({ ok: requests > 1 }); };
  b.choices.analytics = false;
  await b.fire('zarazConsentChoicesUpdated');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1);
  await b.fire('zarazConsentChoicesUpdated');
  assert.equal(requests, 2);
  assert.equal(b.reloads(), 0);
  assert.deepEqual(b.resources, []);
});

test('reaccepting advertising during cleanup cancels reload and restores existing Meta without reinitalization', async () => {
  const b = browser({ ready: true, analytics: true, advertising: true });
  b.run(scripts.find(script => script.includes('__mtcConsentInitialized')));
  let complete;
  b.window.fetch = () => new Promise(resolve => { complete = resolve; });
  b.choices.advertising = false;
  const withdrawal = b.fire('zarazConsentChoicesUpdated');
  b.choices.advertising = true;
  await b.fire('zarazConsentChoicesUpdated');
  complete({ ok: true });
  await withdrawal;
  assert.equal(b.reloads(), 0);
  assert.equal(b.resources.length, 1);
  assert.equal(b.window.fbq.queue.filter(args => args[0] === 'init').length, 1);
  assert.equal(b.window.fbq.queue.at(-1)[1], 'grant');
});
