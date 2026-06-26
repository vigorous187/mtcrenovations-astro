/**
 * Copy portfolio photos into public/assets/img/.../estimator/ when sources exist.
 * Falls back to SVG placeholders so wizard cards never 404.
 *
 * Run: node scripts/prepare-estimator-images.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PRICING = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/pricing-estimator.json"), "utf8"),
);
const PORTFOLIO = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/portfolio.json"), "utf8"),
);

const IMAGE_MAP = {
  "/assets/img/basement/estimator/basement.jpg": pickPortfolio(
    "basement",
    "Rosedene",
  ),
  "/assets/img/basement/estimator/basic-finish.jpg": pickPortfolio(
    "basement",
    "Rosedene",
  ),
  "/assets/img/basement/estimator/full-renovation.jpg": pickPortfolio(
    "basement",
    "Winchester",
  ),
  "/assets/img/basement/estimator/legal-suite.jpg": pickPortfolio(
    "basement",
    "Winchester",
  ),
  "/assets/img/bathroom/estimator/bathroom.jpg": pickPortfolio("bathroom"),
  "/assets/img/kitchen/estimator/kitchen.jpg": pickPortfolio(
    "kitchen",
    "Gateshead",
  ),
  "/assets/img/flooring/estimator/flooring.jpg": pickPortfolio("flooring"),
  "/assets/img/painting/estimator/painting.jpg": null,
  "/assets/img/garden-suite-adu/estimator/garden-suite-adu.jpg": pickPortfolio(
    "kitchen",
    "Queensdale",
  ),
  "/assets/img/garden-suite-adu/estimator/standalone-adu.jpg": pickPortfolio(
    "kitchen",
    "Queensdale",
  ),
  "/assets/img/garden-suite-adu/estimator/garage-conversion.jpg": pickPortfolio(
    "basement",
    "Rosedene",
  ),
  "/assets/img/garden-suite-adu/estimator/large-adu.jpg": pickPortfolio(
    "kitchen",
    "Queensdale",
  ),
  "/assets/img/multi-unit/estimator/multi-unit.jpg": pickPortfolio(
    "kitchen",
    "Winchester",
  ),
  "/assets/img/multi-unit/estimator/duplex-renovation.jpg": pickPortfolio(
    "kitchen",
    "Winchester",
  ),
  "/assets/img/multi-unit/estimator/duplex-to-triplex.jpg": pickPortfolio(
    "basement",
    "Winchester",
  ),
  "/assets/img/multi-unit/estimator/duplex-to-fourplex.jpg": pickPortfolio(
    "kitchen",
    "Winchester",
  ),
  "/assets/img/multi-unit/estimator/triplex-to-fourplex.jpg": pickPortfolio(
    "basement",
    "Winchester",
  ),
};

function pickPortfolio(section, project) {
  const items = PORTFOLIO[section] || PORTFOLIO.photos || [];
  const list = Array.isArray(items) ? items : [];
  const match =
    list.find((p) => project && p.project === project) ||
    list.find((p) => p.project === "Winchester") ||
    list[0];
  return match?.source_path || null;
}

function collectJsonImagePaths() {
  const paths = new Set(Object.keys(IMAGE_MAP));
  for (const t of PRICING.types || []) {
    if (t.image) paths.add(t.image);
  }
  for (const scopes of Object.values(PRICING.scopes || {})) {
    for (const s of scopes) {
      if (s.image) paths.add(s.image);
    }
  }
  return [...paths];
}

function placeholderSvg(label) {
  const text = label
    .replace(/\.[^.]+$/, "")
    .replace(/.*\//, "")
    .replace(/-/g, " ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8f9fa"/>
      <stop offset="100%" stop-color="#dee2e6"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#g)"/>
  <rect x="40" y="40" width="720" height="370" rx="12" fill="#fff" stroke="#ced4da"/>
  <text x="400" y="230" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="#6c757d">${text}</text>
</svg>`;
}

function ensureImage(webPath, sourcePath) {
  const rel = webPath.replace(/^\//, "");
  const dest = path.join(ROOT, "public", rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (sourcePath && fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, dest);
    console.log(`copied ${path.basename(dest)}`);
    return;
  }

  const svgDest = dest.replace(/\.(jpg|jpeg|webp)$/i, ".svg");
  if (!fs.existsSync(svgDest)) {
    fs.writeFileSync(svgDest, placeholderSvg(path.basename(dest)));
    console.log(`placeholder ${path.basename(svgDest)}`);
  }

  // Point JSON paths at SVG when JPG missing — patch pricing JSON once
  if (dest.endsWith(".jpg") && fs.existsSync(svgDest) && !fs.existsSync(dest)) {
    return svgDest.replace(path.join(ROOT, "public"), "");
  }
  return null;
}

const svgReplacements = new Map();
for (const webPath of collectJsonImagePaths()) {
  const source = IMAGE_MAP[webPath] ?? null;
  const alt = ensureImage(webPath, source);
  if (alt) svgReplacements.set(webPath, alt);
}

if (svgReplacements.size) {
  let raw = fs.readFileSync(
    path.join(ROOT, "src/data/pricing-estimator.json"),
    "utf8",
  );
  for (const [jpg, svg] of svgReplacements) {
    raw = raw.replaceAll(jpg, svg);
  }
  fs.writeFileSync(path.join(ROOT, "src/data/pricing-estimator.json"), raw);
  console.log(
    `Updated ${svgReplacements.size} image paths to SVG placeholders`,
  );
}

console.log("Estimator images ready.");
