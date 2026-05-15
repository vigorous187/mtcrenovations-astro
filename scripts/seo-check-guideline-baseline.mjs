/**
 * FORGE_PIPELINE_VERSION=1
 * Compare live fingerprints to automation/guideline-baseline.json
 * Exit 1 if mismatch (CI should open an issue separately).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const baselineFile = path.join(ROOT, "automation", "guideline-baseline.json");
const sourcesPath = path.join(ROOT, "scripts", "seo-guideline-sources.json");

function stripNoise(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120_000);
}

function hash(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function main() {
  const baseline = JSON.parse(await readFile(baselineFile, "utf8"));
  const cfg = JSON.parse(await readFile(sourcesPath, "utf8"));
  const mismatches = [];

  for (const { id, url } of cfg.urls) {
    const res = await fetch(url, { redirect: "follow" });
    const text = await res.text();
    const live = hash(stripNoise(text));
    const expected = baseline.fingerprints[id]?.sha256;
    if (!expected) {
      mismatches.push(`${id}: missing baseline entry`);
      continue;
    }
    if (live !== expected) {
      mismatches.push(`${id}: fingerprint changed for ${url}`);
    }
  }

  if (mismatches.length) {
    console.error("Guideline drift detected:\n" + mismatches.join("\n"));
    console.error(
      "\nAction: review Google docs, update shared BLOG_PIPELINE_GOOGLE_CHECKLIST.md and gate scripts, then run seo-init-guideline-baseline.mjs and commit new baseline.",
    );
    process.exit(1);
  }
  console.log("Guideline baseline OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
