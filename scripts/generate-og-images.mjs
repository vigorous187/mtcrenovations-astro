#!/usr/bin/env node
/**
 * Generate OG/social preview images (1200x630) for MTC Renovations.
 * Uses Playwright to screenshot HTML templates.
 *
 * Usage: node scripts/generate-og-images.mjs
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "assets", "img", "og");
mkdirSync(outDir, { recursive: true });

const pages = [
  {
    file: "default.png",
    headline: "MTC Renovations",
    subhead: "Burlington, Hamilton & GTA",
    tagline: "Licensed & Insured Home Renovation Contractor",
    icon: "fa-house-chimney",
  },
  {
    file: "basement.png",
    headline: "Basement Renovations",
    subhead: "Hamilton & GTA",
    tagline: "Full Finishing \u00b7 Legal Suites \u00b7 Open Concepts",
    icon: "fa-stairs",
  },
  {
    file: "bathroom.png",
    headline: "Bathroom Renovations",
    subhead: "Hamilton & GTA",
    tagline: "Walk-in Showers \u00b7 Custom Tile \u00b7 Full Remodels",
    icon: "fa-bath",
  },
  {
    file: "kitchen.png",
    headline: "Kitchen Renovations",
    subhead: "Hamilton & GTA",
    tagline: "Cabinets \u00b7 Countertops \u00b7 Open-Concept Layouts",
    icon: "fa-kitchen-set",
  },
  {
    file: "flooring.png",
    headline: "Flooring Installation",
    subhead: "Hamilton & GTA",
    tagline: "Hardwood \u00b7 Luxury Vinyl \u00b7 Tile",
    icon: "fa-layer-group",
  },
  {
    file: "painting.png",
    headline: "Interior Painting",
    subhead: "Hamilton & GTA",
    tagline: "Clean Prep \u00b7 Premium Paint \u00b7 Zero Mess",
    icon: "fa-paint-roller",
  },
];

function buildHTML({ headline, subhead, tagline, icon }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@700&display=swap" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1200px;
      height: 630px;
      background: #0a0a0a;
      font-family: 'Inter', sans-serif;
      color: #f5f5f5;
      display: flex;
      overflow: hidden;
      position: relative;
    }

    /* Subtle grid texture */
    body::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 40px 40px;
      z-index: 0;
    }

    /* Red accent bar on left */
    .accent-bar {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 8px;
      background: #dc3545;
      z-index: 2;
    }

    /* Red glow in top-right */
    .glow {
      position: absolute;
      top: -120px;
      right: -120px;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(220,53,69,0.15) 0%, transparent 70%);
      z-index: 0;
    }

    .content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 60px 80px 60px 80px;
      width: 100%;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 36px;
    }

    .logo-box {
      width: 52px;
      height: 52px;
      background: #dc3545;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      font-family: 'Playfair Display', serif;
      letter-spacing: -0.5px;
    }

    .logo-text {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 20px;
      color: rgba(255,255,255,0.7);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .icon-circle {
      width: 64px;
      height: 64px;
      border: 2px solid rgba(220,53,69,0.4);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      color: #dc3545;
      font-size: 26px;
    }

    h1 {
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      font-size: 72px;
      line-height: 1.05;
      margin-bottom: 16px;
      color: #ffffff;
    }

    .subhead {
      font-size: 22px;
      font-weight: 600;
      color: #dc3545;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      margin-bottom: 20px;
    }

    .tagline {
      font-size: 24px;
      font-weight: 400;
      color: rgba(255,255,255,0.55);
      letter-spacing: 0.02em;
    }

    /* Bottom bar */
    .bottom-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 56px;
      background: rgba(220,53,69,0.08);
      border-top: 1px solid rgba(220,53,69,0.2);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 80px;
      z-index: 1;
    }

    .bottom-bar span {
      font-size: 15px;
      font-weight: 500;
      color: rgba(255,255,255,0.45);
      letter-spacing: 0.04em;
    }

    .bottom-bar .stars {
      color: #dc3545;
      font-size: 16px;
      letter-spacing: 2px;
    }
  </style>
</head>
<body>
  <div class="accent-bar"></div>
  <div class="glow"></div>

  <div class="content">
    <div class="logo-row">
      <div class="logo-box">M</div>
      <span class="logo-text">MTC Renovations</span>
    </div>

    <div class="icon-circle">
      <i class="fas ${icon}"></i>
    </div>

    <h1>${headline}</h1>
    <div class="subhead">${subhead}</div>
    <div class="tagline">${tagline}</div>
  </div>

  <div class="bottom-bar">
    <span>mtcrenovations.ca</span>
    <span class="stars">\u2605\u2605\u2605\u2605\u2605</span>
    <span>Licensed & Insured \u00b7 (647) 560-1095</span>
  </div>
</body>
</html>`;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  for (const page of pages) {
    const html = buildHTML(page);
    const p = await context.newPage();
    await p.setContent(html, { waitUntil: "networkidle" });
    // Wait a bit for fonts to load
    await p.waitForTimeout(1500);
    const outPath = join(outDir, page.file);
    await p.screenshot({ path: outPath, type: "png" });
    await p.close();
    console.log(`Created: ${outPath}`);
  }

  await browser.close();
  console.log("\nAll OG images generated successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
