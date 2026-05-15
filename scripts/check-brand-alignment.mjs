import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const GATES = JSON.parse(
  await readFile(new URL("./site-gates.json", import.meta.url), "utf8"),
);
const BR = GATES.brand || {};
const ROOT = path.resolve(process.cwd(), "src");
const SCAN_DIRS = BR.scanDirs || ["pages", "components", "layouts"];
const SKIP_SUB = BR.skipPathSubstrings || [];
const FORBIDDEN = (BR.forbiddenPatterns || []).map((s) => new RegExp(s, "i"));

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }
    if (
      entry.name.endsWith(".astro") ||
      entry.name.endsWith(".mdx") ||
      entry.name.endsWith(".md")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  if (FORBIDDEN.length === 0) {
    console.log("MTC brand alignment: no patterns configured — skipping.");
    return;
  }
  const violations = [];
  for (const dir of SCAN_DIRS) {
    const target = path.join(ROOT, dir);
    const files = await listFiles(target);
    for (const file of files) {
      const rel = path.relative(process.cwd(), file);
      if (SKIP_SUB.some((s) => rel.includes(s))) continue;
      const content = await readFile(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(content)) {
          violations.push(`${rel}: matches ${pattern}`);
        }
      }
    }
  }
  if (violations.length > 0) {
    console.error("MTC brand alignment check failed:");
    violations.forEach((v) => console.error("- " + v));
    process.exit(1);
  }
  console.log("MTC brand alignment check passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
