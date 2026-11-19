#!/usr/bin/env node
// scripts/check-blog-uniqueness.mjs
// Fail the build if any two non-draft blog posts share an identical body
// (everything after the closing --- of YAML frontmatter, whitespace-normalized).
// SHA-256 hash; any hash appearing more than once = duplicate set.
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";

const ROOT = process.cwd();
// Try common blog content roots in priority order; first one that exists wins.
const CANDIDATES = ["src/content/blog", "src/content/posts", "src/pages/blog"];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findBlogDir() {
  for (const c of CANDIDATES) {
    const full = join(ROOT, c);
    if (await exists(full)) return full;
  }
  return null;
}

async function listPosts(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await listPosts(full);
      out.push(...sub);
    } else if (e.isFile()) {
      const ext = extname(e.name).toLowerCase();
      if (ext === ".md" || ext === ".mdx") out.push(full);
    }
  }
  return out;
}

function splitFrontmatter(raw) {
  // Expect leading `---\n` then frontmatter block then `\n---\n` then body.
  if (!raw.startsWith("---")) return { fm: "", body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { fm: "", body: raw };
  const fm = raw.slice(3, end);
  let body = raw.slice(end + 4);
  if (body.startsWith("\n")) body = body.slice(1);
  return { fm, body };
}

function isDraft(fm) {
  return /^\s*draft\s*:\s*true\s*$/im.test(fm);
}

function normalizeBody(b) {
  return b.replace(/\s+/g, " ").trim();
}

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function main() {
  const dir = await findBlogDir();
  if (!dir) {
    console.log(
      "[blog-uniqueness] no blog content directory found — skipping.",
    );
    return;
  }
  const files = await listPosts(dir);
  if (files.length === 0) {
    console.log(`[blog-uniqueness] ${dir}: 0 posts — skipping.`);
    return;
  }
  const byHash = new Map();
  let scanned = 0;
  for (const f of files) {
    const raw = await readFile(f, "utf8");
    const { fm, body } = splitFrontmatter(raw);
    if (isDraft(fm)) continue;
    const norm = normalizeBody(body);
    if (!norm) continue;
    const h = sha256(norm);
    const slug = basename(f).replace(/\.(md|mdx)$/i, "");
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(slug);
    scanned += 1;
  }
  const dupes = [...byHash.entries()].filter(([, slugs]) => slugs.length > 1);
  if (dupes.length === 0) {
    console.log(
      `[blog-uniqueness] OK — ${scanned} non-draft posts, all bodies unique.`,
    );
    return;
  }
  console.error(
    `[blog-uniqueness] FAIL — ${dupes.length} duplicate body group(s) detected:`,
  );
  for (const [h, slugs] of dupes) {
    console.error(`  hash ${h.slice(0, 12)}…  (${slugs.length} posts)`);
    for (const s of slugs) console.error(`    - ${s}`);
  }
  console.error(
    `[blog-uniqueness] Rewrite duplicates so each post has a distinct body, then re-run.`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[blog-uniqueness] unexpected error:", err);
  process.exit(2);
});
