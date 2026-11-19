/**
 * FORGE_PIPELINE_VERSION=1
 * Lists blog posts with datePublished for proof tables.
 * Usage: node scripts/blog-inventory.mjs [--days=90]
 * Env: BLOG_GLOB default src/content/blog/*.{md,mdx}
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const windowDays = daysArg ? Number(daysArg.split("=")[1]) : 90;
const blogDir =
  process.env.BLOG_DIR || path.join(ROOT, "src", "content", "blog");

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return {};
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = raw.slice(3, end).trim();
  const data = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    data[m[1]] = v;
  }
  return data;
}

async function main() {
  const files = await readdir(blogDir).catch(() => []);
  const md = files.filter((f) => /\.(md|mdx)$/i.test(f));
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const rows = [];

  for (const file of md) {
    const raw = await readFile(path.join(blogDir, file), "utf8");
    const data = parseFrontmatter(raw);
    const draft = String(data.draft).toLowerCase() === "true";
    const pub =
      data.datePublished || data.publishDate || data.published || data.date;
    if (draft || !pub) continue;
    const slug = file.replace(/\.(md|mdx)$/i, "");
    const d = new Date(pub);
    rows.push({ slug, file, datePublished: pub, inWindow: d >= cutoff });
  }

  rows.sort((a, b) =>
    String(b.datePublished).localeCompare(String(a.datePublished)),
  );

  console.log(`# Blog inventory (${windowDays}-day window)\n`);
  console.log("| Slug | File | datePublished | In window |");
  console.log("|------|------|----------------|------------|");
  for (const r of rows) {
    console.log(
      `| ${r.slug} | ${r.file} | ${r.datePublished} | ${r.inWindow ? "yes" : "no"} |`,
    );
  }
  const inW = rows.filter((r) => r.inWindow);
  console.log(
    `\n**Count in window:** ${inW.length} / ${rows.length} total published`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
