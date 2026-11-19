/**
 * Copy MTC portfolio photos from public/assets/img/.../our-work/ into estimator cards.
 * Resizes to ~800px wide JPEG for fast loading.
 *
 * Run: node scripts/prepare-estimator-images.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const PRICING_PATH = path.join(ROOT, "src/data/pricing-estimator.json");

/** Center-crop portrait site photos to match ~3:2 landscape estimator cards (800×533). */
const LANDSCAPE_CARD_CROP = {
  height: 800,
  width: 1200,
  offsetY: 666,
  offsetX: 0,
};

/** Job #604 — 171 East 24th completed 2-story ADU (3762×6688 source). */
const EAST_24TH_ADU_CROP = {
  height: 2508,
  width: 3762,
  offsetY: 2090,
  offsetX: 0,
};

/** dest path (under public/) → source file relative to public/ */
const IMAGE_SOURCES = {
  "assets/img/basement/estimator/basement.jpg":
    "assets/img/basement/our-work/virtual-tour-333305-mls-high-res-image-38.jpg",
  "assets/img/basement/estimator/basic-finish.jpg":
    "assets/img/basement/our-work/virtual-tour-327738-48.jpg",
  "assets/img/basement/estimator/full-renovation.jpg":
    "assets/img/basement/our-work/virtual-tour-320787-50.BNAiWU5q.jpg",
  "assets/img/basement/estimator/legal-suite.jpg":
    "assets/img/basement/our-work/virtual-tour-320787-51.C9WVz6l6.jpg",
  "assets/img/bathroom/estimator/bathroom.jpg":
    "assets/img/bathroom/our-work/virtual-tour-348484-52.jpg",
  "assets/img/kitchen/estimator/kitchen.jpg":
    "assets/img/kitchen/our-work/virtual-tour-333305-mls-high-res-image-12.jpg",
  "assets/img/flooring/estimator/flooring.jpg":
    "assets/img/flooring/our-work/virtual-tour-348484-02.jpg",
  "assets/img/painting/estimator/painting.jpg":
    "assets/img/painting/our-work/virtual-tour-333305-mls-high-res-image-17.jpg",
  "assets/img/garden-suite-adu/estimator/garden-suite-adu.jpg":
    "assets/img/home/virtual-tour-348484-62.jpg",
  "assets/img/garden-suite-adu/estimator/standalone-adu.jpg":
    "assets/img/kitchen/our-work/2023-03-07_6 Kron_After Pics_ Virtual-Tour-334995-07.jpg",
  "assets/img/garden-suite-adu/estimator/garage-conversion.jpg":
    "assets/img/basement/our-work/virtual-tour-327738-49.Bfv60reJ.jpg",
  "assets/img/garden-suite-adu/estimator/large-adu.jpg":
    "assets/img/kitchen/our-work/virtual-tour-333305-mls-high-res-image-6.jpg",
  "assets/img/multi-unit/estimator/multi-unit.jpg":
    "assets/img/multi-unit/our-work/virtual-tour-348484-57.jpg",
  "assets/img/multi-unit/estimator/duplex-renovation.jpg":
    "assets/img/kitchen/our-work/virtual-tour-320787-09.GSCtWwlt.jpg",
  "assets/img/multi-unit/estimator/duplex-to-triplex.jpg":
    "assets/img/basement/our-work/virtual-tour-320787-46.CPMwhOM3.jpg",
  "assets/img/multi-unit/estimator/duplex-to-fourplex.jpg":
    "assets/img/kitchen/our-work/virtual-tour-320787-08.C0A0lxf-.jpg",
  "assets/img/multi-unit/estimator/triplex-to-fourplex.jpg":
    "assets/img/basement/our-work/virtual-tour-320787-50.BNAiWU5q.jpg",
};

function resolveSource(relPath) {
  const candidates = [
    path.join(ROOT, "public", relPath),
    path.join(ROOT, "public", relPath.replace(/\.jpg$/i, ".JPG")),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const dir = path.dirname(path.join(ROOT, "public", relPath));
  const base = path.basename(relPath, path.extname(relPath));
  if (fs.existsSync(dir)) {
    const match = fs
      .readdirSync(dir)
      .find((f) => f.replace(/\.[^.]+$/, "") === base || f.startsWith(base));
    if (match) return path.join(dir, match);
  }
  return null;
}

function optimizeJpeg(src, dest, crop) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = crop
    ? path.join(path.dirname(dest), `.tmp-${path.basename(dest)}`)
    : null;
  try {
    if (crop && tmp) {
      fs.copyFileSync(src, tmp);
      execSync(
        `sips --cropToHeightWidth ${crop.height} ${crop.width} --cropOffset ${crop.offsetY} ${crop.offsetX} "${tmp}" >/dev/null 2>&1`,
        { stdio: "pipe" },
      );
      execSync(
        `sips -s format jpeg -Z 800 "${tmp}" --out "${dest}" >/dev/null 2>&1`,
        { stdio: "pipe" },
      );
      fs.unlinkSync(tmp);
      return true;
    }
    execSync(
      `sips -s format jpeg -Z 800 "${src}" --out "${dest}" >/dev/null 2>&1`,
      { stdio: "pipe" },
    );
    return true;
  } catch {
    if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    fs.copyFileSync(src, dest);
    return true;
  }
}

const pathReplacements = new Map();

for (const [destRel, entry] of Object.entries(IMAGE_SOURCES)) {
  const srcRel = typeof entry === "string" ? entry : entry.src;
  const crop = typeof entry === "string" ? null : (entry.crop ?? null);
  const src = resolveSource(srcRel);
  const dest = path.join(ROOT, "public", destRel);
  if (!src) {
    console.warn(`skip (missing source): ${srcRel}`);
    continue;
  }
  optimizeJpeg(src, dest, crop);
  const webPath = `/${destRel}`;
  pathReplacements.set(webPath.replace(".jpg", ".svg"), webPath);
  pathReplacements.set(webPath, webPath);
  console.log(`→ ${destRel}`);
}

let pricingRaw = fs.readFileSync(PRICING_PATH, "utf8");
for (const [from, to] of pathReplacements) {
  if (from !== to) pricingRaw = pricingRaw.replaceAll(from, to);
}
fs.writeFileSync(PRICING_PATH, pricingRaw);
console.log("pricing-estimator.json image paths updated.");
