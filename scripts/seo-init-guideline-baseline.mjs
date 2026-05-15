/**
 * FORGE_PIPELINE_VERSION=1
 * One-time: fetch allowlisted URLs and write automation/guideline-baseline.json
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const sourcesPath = path.join(ROOT, "scripts", "seo-guideline-sources.json");
const outDir = path.join(ROOT, "automation");
const outFile = path.join(outDir, "guideline-baseline.json");

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
  const cfg = JSON.parse(await readFile(sourcesPath, "utf8"));
  const fingerprints = {};
  for (const { id, url } of cfg.urls) {
    const res = await fetch(url, { redirect: "follow" });
    const text = await res.text();
    fingerprints[id] = {
      url,
      status: res.status,
      sha256: hash(stripNoise(text)),
      fetchedAt: new Date().toISOString(),
    };
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(
    outFile,
    JSON.stringify({ version: 1, fingerprints }, null, 2) + "\n",
  );
  console.log(`Wrote ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
