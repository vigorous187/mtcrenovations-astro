import assert from 'node:assert/strict';
import test from 'node:test';
import { googleConsent, parseConsent } from '../src/lib/consent-manager.js';
import { auditZarazConfig } from './verify-zaraz-consent-config.mjs';

test('missing, invalid, and old consent is denied', () => {
  assert.equal(parseConsent(null), null);
  assert.equal(parseConsent('bad-json'), null);
  assert.equal(parseConsent(JSON.stringify({ version: 0, analytics: true, advertising: true })), null);
  assert.deepEqual(googleConsent(null), {
    analytics_storage: 'denied', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied',
  });
});

test('release preflight fails closed until auto-inject is off and every tool has an Analytics purpose', () => {
  assert(auditZarazConfig({ settings: { autoInjectScript: true }, tools: { ga4: { name: 'Google Analytics 4' } } }).length >= 3);
  assert.deepEqual(auditZarazConfig({
    settings: { autoInjectScript: false },
    consent: { enabled: true, hideModal: true, purposes: { analytics: { name: 'Analytics', description: 'Site measurement' } } },
    tools: { ga4: { name: 'Google Analytics 4', defaultPurpose: 'analytics' }, clarity: { name: 'Microsoft Clarity', defaultPurpose: 'analytics' } },
  }), []);
});

test('current explicit choices map deterministically to Consent Mode v2', () => {
  const choice = parseConsent(JSON.stringify({ version: 1, updatedAt: '2026-08-14T00:00:00.000Z', analytics: true, advertising: false }));
  assert.deepEqual(googleConsent(choice), {
    analytics_storage: 'granted', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied',
  });
});
