import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.CONSENT_TEST_URL ?? 'http://localhost:4174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
const optionalRequests = [];

page.on('request', (request) => {
  if (/\/cdn-cgi\/zaraz\/i\.js|connect\.facebook\.net/.test(request.url())) optionalRequests.push(request.url());
});
await page.route(/\/cdn-cgi\/zaraz\/i\.js|connect\.facebook\.net/, (route) => route.fulfill({ status: 204, body: '' }));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  assert.equal(optionalRequests.length, 0, 'optional measurement must not request before a choice');
  await page.getByRole('button', { name: 'Reject all' }).click();
  assert.equal(optionalRequests.length, 0, 'reject must not request optional measurement');

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Accept all' }).click();
  await page.waitForTimeout(200);
  assert.equal(optionalRequests.filter((url) => url.includes('/cdn-cgi/zaraz/i.js')).length, 1, 'accept must load Zaraz once');
  assert.equal(optionalRequests.filter((url) => url.includes('connect.facebook.net')).length, 1, 'accept must load Meta once');

  await page.locator('[data-consent-open]:visible').first().click();
  await page.getByRole('checkbox', { name: /Analytics/ }).uncheck();
  await page.getByRole('checkbox', { name: /Advertising/ }).uncheck();
  await page.getByRole('button', { name: 'Save choices' }).click();
  await assert.doesNotReject(() => page.getByRole('button', { name: 'Reload now' }).waitFor());
  const updates = await page.evaluate(() => (window.dataLayer || []).map((entry) => Array.from(entry)).filter((entry) => entry[0] === 'consent' && entry[1] === 'update'));
  assert.equal(updates.at(-1)?.[2]?.analytics_storage, 'denied');
  assert.equal(updates.at(-1)?.[2]?.ad_storage, 'denied');
  console.log('MTC consent browser contract passed at 320px.');
} finally {
  await browser.close();
}
