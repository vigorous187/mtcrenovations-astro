#!/usr/bin/env node
/**
 * MTC Renovations Astro — Playwright Stress Test
 * Tests all pages, checks broken links/images, validates SEO, measures perf
 */
import { chromium } from 'playwright';

const BASE = 'https://mtcrenovations-astro.2313745ontarioinc.workers.dev';

const PAGES = [
  '/',
  '/basement/', '/basement/about-us/', '/basement/how-it-works/', '/basement/why-mtc/',
  '/basement/our-work/', '/basement/get-free-quote/', '/basement/careers/',
  '/bathroom/', '/bathroom/about-us/', '/bathroom/how-it-works/', '/bathroom/why-mtc/',
  '/bathroom/our-work/', '/bathroom/get-free-quote/', '/bathroom/careers/',
  '/kitchen/', '/kitchen/about-us/', '/kitchen/how-it-works/', '/kitchen/why-mtc/',
  '/kitchen/our-work/', '/kitchen/get-free-quote/', '/kitchen/careers/',
  '/flooring/', '/flooring/about-us/', '/flooring/how-it-works/', '/flooring/why-mtc/',
  '/flooring/our-work/', '/flooring/get-free-quote/', '/flooring/careers/',
  '/painting/', '/painting/about-us/', '/painting/how-it-works/', '/painting/why-mtc/',
  '/painting/our-work/', '/painting/get-free-quote/', '/painting/careers/',
  '/locations/',
  '/location/hamilton/', '/location/burlington/', '/location/oakville/',
  '/location/stoney-creek/', '/location/ancaster/', '/location/dundas/',
  '/location/waterdown/', '/location/toronto/',
  '/blog/',
  '/thank-you/',
  '/newleadintake/', '/newvendorintake/',
];

const results = { pass: 0, fail: 0, errors: [], warnings: [], perf: [] };

async function testPage(page, path) {
  const url = `${BASE}${path}`;
  const start = Date.now();

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const loadTime = Date.now() - start;
    const status = response?.status();

    // 1. Status check
    if (status !== 200) {
      results.errors.push(`[${status}] ${path}`);
      results.fail++;
      return;
    }

    // 2. Performance
    results.perf.push({ path, loadTime });
    if (loadTime > 3000) {
      results.warnings.push(`SLOW (${loadTime}ms): ${path}`);
    }

    // 3. SEO: title exists and is not empty
    const title = await page.title();
    if (!title || title.length < 10) {
      results.errors.push(`MISSING TITLE: ${path} (got: "${title}")`);
    }

    // 4. SEO: meta description
    const metaDesc = await page.$eval('meta[name="description"]', el => el.content).catch(() => '');
    if (!metaDesc || metaDesc.length < 20) {
      results.errors.push(`MISSING META DESC: ${path}`);
    }

    // 5. SEO: canonical
    const canonical = await page.$eval('link[rel="canonical"]', el => el.href).catch(() => '');
    if (!canonical) {
      results.warnings.push(`NO CANONICAL: ${path}`);
    }

    // 6. SEO: OG tags
    const ogTitle = await page.$eval('meta[property="og:title"]', el => el.content).catch(() => '');
    if (!ogTitle) {
      results.warnings.push(`NO OG:TITLE: ${path}`);
    }

    // 7. H1 exists
    const h1Count = await page.$$eval('h1', els => els.length);
    if (h1Count === 0) {
      results.warnings.push(`NO H1: ${path}`);
    } else if (h1Count > 1) {
      results.warnings.push(`MULTIPLE H1s (${h1Count}): ${path}`);
    }

    // 8. JSON-LD schema
    const schemas = await page.$$eval('script[type="application/ld+json"]', els => els.length);
    if (schemas === 0) {
      results.warnings.push(`NO JSON-LD: ${path}`);
    }

    // 9. Broken images on page
    const brokenImages = await page.$$eval('img', imgs =>
      imgs.filter(img => !img.complete || img.naturalWidth === 0)
        .map(img => img.src || img.getAttribute('src'))
    );
    if (brokenImages.length > 0) {
      results.warnings.push(`BROKEN IMAGES on ${path}: ${brokenImages.join(', ')}`);
    }

    // 10. Check viewport meta
    const viewport = await page.$eval('meta[name="viewport"]', el => el.content).catch(() => '');
    if (!viewport) {
      results.errors.push(`NO VIEWPORT: ${path}`);
    }

    results.pass++;
  } catch (err) {
    results.errors.push(`TIMEOUT/ERROR: ${path} — ${err.message.slice(0, 100)}`);
    results.fail++;
  }
}

async function testQuoteForm(page) {
  console.log('\n--- FORM TEST ---');
  try {
    await page.goto(`${BASE}/basement/get-free-quote/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const formExists = await page.$('#quoteForm');
    if (!formExists) {
      results.errors.push('QUOTE FORM NOT FOUND on /basement/get-free-quote/');
      return;
    }

    // Check all required fields exist
    const fields = ['#name', '#email', '#phone', '#service', '#message'];
    for (const sel of fields) {
      const exists = await page.$(sel);
      if (!exists) results.errors.push(`FORM FIELD MISSING: ${sel}`);
    }

    // Check service dropdown has options
    const options = await page.$$eval('#service option', opts => opts.length);
    if (options < 5) results.warnings.push(`SERVICE DROPDOWN: only ${options} options (expected 6+)`);

    console.log('  Form validation: OK');
  } catch (err) {
    results.errors.push(`FORM TEST FAILED: ${err.message.slice(0, 100)}`);
  }
}

async function testNavigation(page) {
  console.log('\n--- NAV TEST ---');
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Check navbar links
    const navLinks = await page.$$eval('nav a', links =>
      links.map(l => ({ text: l.textContent?.trim(), href: l.href }))
    );
    console.log(`  Navbar links: ${navLinks.length}`);

    // Check footer links
    const footerLinks = await page.$$eval('footer a', links =>
      links.map(l => ({ text: l.textContent?.trim(), href: l.href }))
    );
    console.log(`  Footer links: ${footerLinks.length}`);

    // Check service cards link to correct pages
    const serviceLinks = await page.$$eval('.service-card', cards =>
      cards.map(c => c.closest('a')?.href).filter(Boolean)
    );
    console.log(`  Service card links: ${serviceLinks.length}`);

    if (navLinks.length < 5) results.errors.push('NAV: Too few navbar links');
    if (footerLinks.length < 5) results.errors.push('NAV: Too few footer links');
  } catch (err) {
    results.errors.push(`NAV TEST FAILED: ${err.message.slice(0, 100)}`);
  }
}

async function testMobile(page, context) {
  console.log('\n--- MOBILE TEST ---');
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 375, height: 812 });

  try {
    await mobilePage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Check hamburger menu exists
    const hamburger = await mobilePage.$('.navbar-toggler');
    if (!hamburger) {
      results.errors.push('MOBILE: No hamburger menu');
    } else {
      console.log('  Hamburger menu: present');
    }

    // Check no horizontal overflow
    const bodyWidth = await mobilePage.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await mobilePage.evaluate(() => window.innerWidth);
    if (bodyWidth > viewportWidth + 5) {
      results.warnings.push(`MOBILE OVERFLOW: body=${bodyWidth}px > viewport=${viewportWidth}px`);
    } else {
      console.log('  No horizontal overflow: OK');
    }
  } catch (err) {
    results.errors.push(`MOBILE TEST FAILED: ${err.message.slice(0, 100)}`);
  }
  await mobilePage.close();
}

// Main
(async () => {
  console.log('=== MTC Renovations Stress Test ===');
  console.log(`Base URL: ${BASE}`);
  console.log(`Pages to test: ${PAGES.length}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Test all pages
  console.log('--- PAGE TESTS ---');
  for (const path of PAGES) {
    process.stdout.write(`  Testing ${path} ... `);
    await testPage(page, path);
    const last = results.perf[results.perf.length - 1];
    if (last) {
      console.log(`${last.loadTime}ms`);
    } else {
      console.log('FAIL');
    }
  }

  // Form test
  await testQuoteForm(page);

  // Navigation test
  await testNavigation(page);

  // Mobile test
  await testMobile(page, context);

  await browser.close();

  // Report
  console.log('\n========================================');
  console.log('         STRESS TEST RESULTS');
  console.log('========================================');
  console.log(`Pages tested: ${PAGES.length}`);
  console.log(`PASS: ${results.pass}`);
  console.log(`FAIL: ${results.fail}`);

  if (results.errors.length > 0) {
    console.log(`\nERRORS (${results.errors.length}):`);
    results.errors.forEach(e => console.log(`  ❌ ${e}`));
  }

  if (results.warnings.length > 0) {
    console.log(`\nWARNINGS (${results.warnings.length}):`);
    results.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }

  // Performance summary
  const times = results.perf.map(p => p.loadTime).sort((a, b) => a - b);
  if (times.length > 0) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const slowest = results.perf.sort((a, b) => b.loadTime - a.loadTime).slice(0, 3);

    console.log('\nPERFORMANCE:');
    console.log(`  Avg: ${avg}ms | P50: ${p50}ms | P95: ${p95}ms`);
    console.log(`  Slowest:`);
    slowest.forEach(s => console.log(`    ${s.loadTime}ms — ${s.path}`));
  }

  console.log('\n========================================');
  const verdict = results.fail === 0 && results.errors.length === 0 ? 'PASS' : 'NEEDS FIXES';
  console.log(`  VERDICT: ${verdict}`);
  console.log('========================================');

  process.exit(results.fail > 0 ? 1 : 0);
})();
