import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { auditSite } from "./check-site-quality.mjs";

const ORIGIN = "https://example.test";

function makeFixture({
  broken = false,
  imageMarkup = '<img src="/hero.svg" alt="">',
} = {}) {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), "site-quality-"));
  fs.mkdirSync(path.join(distDir, "assets"));
  fs.writeFileSync(
    path.join(distDir, "assets", "main.js"),
    "console.log('ok')\n",
  );
  fs.writeFileSync(
    path.join(distDir, "hero.svg"),
    '<svg viewBox="0 0 10 10"></svg>\n',
  );
  fs.writeFileSync(path.join(distDir, "hero.png"), "fixture\n");
  fs.writeFileSync(
    path.join(distDir, "sitemap-0.xml"),
    `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
  );
  fs.writeFileSync(
    path.join(distDir, "index.html"),
    `<!doctype html><html lang="en"><head><title>Unique title</title><meta name="description" content="Useful description"><meta name="robots" content="index, follow"><link rel="canonical" href="${ORIGIN}/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example"}</script><script src="/assets/main.js"></script></head><body><a href="#main">Skip to main content</a><header><nav><a href="${broken ? "/missing" : "/"}">Home</a></nav></header><main id="main"><h1>Example</h1>${imageMarkup}</main><footer>Footer</footer></body></html>`,
  );
  return distDir;
}

test("passes a complete static candidate", () => {
  const distDir = makeFixture();
  try {
    const report = auditSite({
      distDir,
      origin: ORIGIN,
      maxImagesWithoutReservedSpace: 0,
    });
    assert.equal(report.result, "PASS", report.failures.join("\n"));
    assert.equal(report.metrics.browserAccessibility, "NOT TESTED");
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test("accepts an image that fills an explicitly sized frame", () => {
  const distDir = makeFixture({
    imageMarkup:
      '<div style="height: 240px"><img class="w-100 h-100" src="/hero.png" alt=""></div>',
  });
  try {
    const report = auditSite({
      distDir,
      origin: ORIGIN,
      maxImagesWithoutReservedSpace: 0,
    });
    assert.equal(report.result, "PASS", report.failures.join("\n"));
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test("fails closed on a broken internal link", () => {
  const distDir = makeFixture({ broken: true });
  try {
    const report = auditSite({ distDir, origin: ORIGIN });
    assert.equal(report.result, "FAIL");
    assert.match(report.failures.join("\n"), /broken internal link \/missing/);
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test("keeps shared first-paint assets from delaying representative LCP", () => {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const header = fs.readFileSync(
    path.join(projectRoot, "src/components/Header.astro"),
    "utf8",
  );
  const footer = fs.readFileSync(
    path.join(projectRoot, "src/components/Footer.astro"),
    "utf8",
  );
  const serviceHero = fs.readFileSync(
    path.join(projectRoot, "src/components/ServiceHero.astro"),
    "utf8",
  );
  const home = fs.readFileSync(
    path.join(projectRoot, "src/pages/index.astro"),
    "utf8",
  );
  const css = fs.readFileSync(
    path.join(projectRoot, "src/styles/global.css"),
    "utf8",
  );

  assert.doesNotMatch(header, /logo-white\.png/);
  assert.doesNotMatch(footer, /logo-white\.png/);
  assert.match(header, /logo%20\(1\)\.svg/);
  assert.match(footer, /logo%20\(1\)\.svg/);
  assert.doesNotMatch(serviceHero, /decoding=["']async["']/);
  assert.doesNotMatch(home, /decoding=["']async["']/);
  assert.equal((css.match(/font-display:\s*optional/g) ?? []).length, 9);
  assert.equal((css.match(/font-display:\s*swap/g) ?? []).length, 0);
});
