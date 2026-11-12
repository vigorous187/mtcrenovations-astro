/**
 * Post-build guard: every HTML page must have exactly one <h1> and no skipped
 * heading levels (e.g. h1 → h3 without an h2 in between).
 *
 * Run after `astro build` (see package.json `build` script).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

function walkHtmlFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkHtmlFiles(full, acc);
    else if (name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

function stripNoise(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
}

function extractHeadings(html) {
  const cleaned = stripNoise(html);
  const headings = [];
  const re = /<h([1-6])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const level = Number.parseInt(m[1], 10);
    const text = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    headings.push({ level, text });
  }
  return headings;
}

function auditHeadings(headings) {
  const issues = [];
  const h1 = headings.filter((h) => h.level === 1);
  if (h1.length === 0) issues.push("missing h1");
  if (h1.length > 1) issues.push(`multiple h1 (${h1.length})`);

  let prev = 0;
  for (let i = 0; i < headings.length; i++) {
    const L = headings[i].level;
    if (prev > 0 && L > prev + 1) {
      issues.push(
        `skipped level h${prev}->h${L} at #${i + 1} ("${headings[i].text.slice(0, 48)}...")`,
      );
    }
    prev = L;
  }
  return issues;
}

function pagePathFromDist(file) {
  const rel = path.relative(DIST, file).replace(/\\/g, "/");
  const noIndex = rel.replace(/\/index\.html$/i, "").replace(/\.html$/i, "");
  return noIndex === "" || noIndex === "." ? "/" : `/${noIndex}`;
}

/** Astro emits minimal HTML for static redirects — no heading outline to audit. */
function isMetaRefreshRedirect(html) {
  return /<meta\s+http-equiv=["']refresh["']/i.test(html);
}

function main() {
  let files;
  try {
    files = walkHtmlFiles(DIST);
  } catch (e) {
    console.error(
      "Heading audit failed: dist/ is missing or unreadable. Run astro build first.",
    );
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("Heading audit failed: no HTML files under dist/.");
    process.exit(1);
  }

  files.sort((a, b) => a.localeCompare(b));
  const failures = [];

  for (const file of files) {
    const html = readFileSync(file, "utf8");
    if (isMetaRefreshRedirect(html)) continue;
    const headings = extractHeadings(html);
    const issues = auditHeadings(headings);
    if (issues.length > 0) {
      failures.push({ file: pagePathFromDist(file), issues, headings });
    }
  }

  if (failures.length > 0) {
    console.error("Heading audit failed:\n");
    for (const { file, issues, headings } of failures) {
      console.error(`  ${file}`);
      for (const msg of issues) console.error(`    - ${msg}`);
      console.error(
        `    sequence: ${headings.map((h) => h.level).join(" → ")}\n`,
      );
    }
    process.exit(1);
  }

  console.log(`Heading audit passed (${files.length} HTML files).`);
}

main();
