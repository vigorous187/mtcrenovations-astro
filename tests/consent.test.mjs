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
  const window = { document, location: { pathname: '/', reload() { reloads++; } },
    zaraz: { consent: { APIReady: ready, get(purpose) { return choices[purpose]; } },
      track(...args) { tracked.push(args); } } };
  window.window = window;
  const context = vm.createContext(window);
  const run = script => vm.runInContext(script, context);
  const fire = name => (listeners.get(name) || []).forEach(fn => fn());
  return { window, choices, resources, tracked, privacy, links, run, fire, reloads: () => reloads };
}

test('Meta stays unloaded until advertising consent, loads once, tracks navigation and reloads on withdrawal', () => {
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
  b.fire('zarazConsentChoicesUpdated');
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
