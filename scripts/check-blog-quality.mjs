#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const GATES = JSON.parse(
  await readFile(new URL("./site-gates.json", import.meta.url), "utf8"),
);
const BQ = GATES.blogQuality || {};
const ROOT = process.cwd();
const BLOG_DIR = join(ROOT, BQ.blogDir || "src/content/blog");
const MIN_WORDS = BQ.minWords ?? 400;
const MIN_H2 = BQ.minH2 ?? 3;
const REQUIRE_SUB = BQ.requireBodySubstring || "/contact/";
const PROHIBITED = (BQ.prohibitedPatterns || []).map((s) => new RegExp(s, "i"));

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: raw };
  const block = raw.slice(3, end).trim();
  const data = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([\w-]+):\s*(.+)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (v === "true") data[m[1]] = true;
    else if (v === "false") data[m[1]] = false;
    else data[m[1]] = v;
  }
  return { data, body: raw.slice(end + 4) };
}

function countWords(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function countH2(md) {
  return (md.match(/^##\s+/gm) || []).length;
}

async function main() {
  const files = (await readdir(BLOG_DIR)).filter((f) => /\.(md|mdx)$/i.test(f));
  const failures = [];
  for (const file of files) {
    const raw = await readFile(join(BLOG_DIR, file), "utf8");
    const { data, body } = parseFrontmatter(raw);
    if (data.draft === true) continue;
    const wc = countWords(body);
    const h2 = countH2(body);
    if (wc < MIN_WORDS)
      failures.push(`${file}: ${wc} words (min ${MIN_WORDS})`);
    if (h2 < MIN_H2) failures.push(`${file}: ${h2} H2 (min ${MIN_H2})`);
    for (const p of PROHIBITED) {
      if (p.test(body)) failures.push(`${file}: prohibited hype pattern`);
    }
    if (REQUIRE_SUB && !body.includes(REQUIRE_SUB)) {
      failures.push(`${file}: missing required body link/text ${REQUIRE_SUB}`);
    }
  }
  if (failures.length) {
    console.error("MTC blog quality gate failed:");
    failures.forEach((f) => console.error("- " + f));
    process.exit(1);
  }
  console.log("MTC blog quality gate passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
