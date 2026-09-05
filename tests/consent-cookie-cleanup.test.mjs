import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/pages/api/privacy/clear-analytics.ts';

const existing = 'cfz_google-analytics_v4=legacy; cfzs_google-analytics_v4=legacy-session; _fbp=legacy-meta; essential=keep';
for (const consent of [null, 'malformed%', { analytics: false, advertising: false }, { analytics: true, advertising: false }, { analytics: false, advertising: true }, { analytics: true, advertising: true }]) {
  test(`cleanup respects recorded purposes: ${JSON.stringify(consent)}`, async () => {
    const value = typeof consent === 'object' ? encodeURIComponent(JSON.stringify(consent)) : consent;
    const request = new Request('https://www.mtcrenovations.ca/api/privacy/clear-analytics/', {
      method: 'POST', headers: { cookie: existing + (consent === null ? '' : '; cf_consent=' + value) },
    });
    const response = await POST({ request });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const cookies = response.headers.getSetCookie();
    const analytics = consent?.analytics === true;
    const advertising = consent?.advertising === true;
    assert.equal(cookies.length, (analytics ? 0 : 4) + (advertising ? 0 : 2));
    assert.equal(cookies.some(cookie => cookie.startsWith('cfz_')), !analytics);
    assert.equal(cookies.some(cookie => cookie.startsWith('_fbp=')), !advertising);
    assert.ok(cookies.every(cookie => /Path=\/; Max-Age=0; Secure; SameSite=Lax/.test(cookie)));
    assert.equal(cookies.filter(cookie => cookie.includes('Domain=.mtcrenovations.ca')).length, cookies.length / 2);
    assert.ok(cookies.every(cookie => !cookie.startsWith('essential=')));
  });
}

test('raw JSON consent is supported and no absent analytics cookies are created', async () => {
  const response = await POST({ request: new Request('https://www.mtcrenovations.ca/api/privacy/clear-analytics/', {
    method: 'POST', headers: { cookie: 'cf_consent={"analytics":true,"advertising":false}; cfz_google-analytics_v4=keep' },
  }) });
  assert.deepEqual(response.headers.getSetCookie(), []);
});
