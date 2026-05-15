#!/usr/bin/env node
/**
 * GEO-lite: blog metadata + scannability expectations (per scripts/site-gates.json).
 * No Forge-only internal link matrices.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const GATES_URL = new URL("./site-gates.json", import.meta.url);

async function loadGates() {
  const raw = await readFile(GATES_URL, "utf8");
  return JSON.parse(raw);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

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

function hasListOrTable(md) {
  return (
    /^\s*[-*]\s+/m.test(md) || /^\s*\d+\.\s+/m.test(md) || /^\|.+\|$/m.test(md)
  );
}

function hasExternalLink(md) {
  return /\[[^\]]+]\(https?:\/\/[^)]+\)/i.test(md);
}

async function main() {
  const gates = await loadGates();
  const geo = gates.geo || {};
  if (geo.mode === "off") {
    console.log("[geo-lite] mode off — skipping.");
    return;
  }
  const blogDir = join(ROOT, geo.blogDir || "src/content/blog");
  if (!(await exists(blogDir))) {
    console.log("[geo-lite] no blog directory — skipping.");
    return;
  }
  const requireDate = geo.requireAnyDateField || [
    "publishDate",
    "reviewedDate",
    "updatedDate",
    "datePublished",
    "dateModified",
    "lastReviewed",
  ];
  const minSources = geo.minSources ?? 0;
  const requireList = geo.requireListOrTable ?? false;
  const requireExternal = geo.requireExternalCitation ?? false;

  const entries = await readdir(blogDir, { withFileTypes: true });
  const files = entries.filter(
    (e) => e.isFile() && /\.(md|mdx)$/i.test(e.name),
  );
  const failures = [];

  for (const f of files) {
    const full = join(blogDir, f.name);
    const raw = await readFile(full, "utf8");
    const { data, body } = parseFrontmatter(raw);
    if (data.draft === true) continue;

    const hasDate = requireDate.some((k) => {
      const v = data[k];
      return v != null && String(v).trim() !== "";
    });
    if (!hasDate) {
      failures.push(
        `${f.name}: missing date field (need one of: ${requireDate.join(", ")})`,
      );
    }
    const src = Array.isArray(data.sources) ? data.sources : [];
    if (minSources > 0 && src.length < minSources) {
      failures.push(
        `${f.name}: requires at least ${minSources} sources (has ${src.length})`,
      );
    }
    if (requireList && !hasListOrTable(body)) {
      failures.push(`${f.name}: requires a list or table for scannability`);
    }
    if (requireExternal && !hasExternalLink(body) && src.length === 0) {
      failures.push(
        `${f.name}: requires external citation link or source entries`,
      );
    }
  }

  if (failures.length) {
    console.error("[geo-lite] failed:");
    failures.forEach((x) => console.error("- " + x));
    process.exit(1);
  }
  console.log("[geo-lite] passed.");
}

main().catch((e) => {
  console.error("[geo-lite]", e);
  process.exit(1);
});
