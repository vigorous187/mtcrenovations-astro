/**
 * Blog chrome gate — prevents duplicate site chrome and invisible light-body copy.
 * Canonical copy lives in forge-site; sync to consumer Astro repos, do not fork rules.
 *
 * Checks:
 * 1. Blog route sources must not import/render Header or Footer (layout owns chrome).
 * 2. Built blog HTML must have at most one <header> and one <footer>.
 * 3. Light-body posts (bg-white + text-primary on <body>) must not use prose-invert
 *    or faded white body copy (text-white/50, text-white/90) inside <article>.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BLOG_PAGES_DIR = path.join(ROOT, "src", "pages", "blog");
const DIST_DIR = path.join(ROOT, "dist", "blog");

const FORBIDDEN_ARTICLE_PATTERNS = [
  "prose-invert",
  "text-white/90",
  "text-white/50",
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile() && /\.(astro|mdx|md)$/.test(entry.name))
      files.push(full);
  }
  return files;
}

async function collectBlogHtml(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectBlogHtml(full)));
    else if (entry.name === "index.html") files.push(full);
  }
  return files;
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

function extractArticle(html) {
  const open = html.indexOf("<article");
  if (open === -1) return "";
  const close = html.indexOf("</article>", open);
  if (close === -1) return html.slice(open);
  return html.slice(open, close);
}

function isLightBodyPage(html) {
  return /<body[^>]*class="[^"]*bg-white[^"]*text-primary/.test(html);
}

async function checkBlogSources() {
  let files;
  try {
    files = await walk(BLOG_PAGES_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const source = await readFile(file, "utf8");
    assertTrue(
      !/import\s+Header\s+from/i.test(source),
      `${rel}: must not import Header — use the shared layout only`,
    );
    assertTrue(
      !/import\s+Footer\s+from/i.test(source),
      `${rel}: must not import Footer — use the shared layout only`,
    );
    assertTrue(
      !/<Header\b/.test(source),
      `${rel}: must not render <Header /> — layout already includes site chrome`,
    );
    assertTrue(
      !/<Footer\b/.test(source),
      `${rel}: must not render <Footer /> — layout already includes site chrome`,
    );
  }
}

async function checkBuiltBlogPages() {
  let htmlFiles;
  try {
    htmlFiles = await collectBlogHtml(DIST_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const file of htmlFiles) {
    const rel = path.relative(ROOT, file);
    const html = await readFile(file, "utf8");
    const headerCount = (html.match(/<header\b/gi) || []).length;
    const footerCount = (html.match(/<footer\b/gi) || []).length;

    assertTrue(
      headerCount <= 1,
      `${rel}: expected at most one <header>, found ${headerCount}`,
    );
    assertTrue(
      footerCount <= 1,
      `${rel}: expected at most one <footer>, found ${footerCount}`,
    );

    if (!isLightBodyPage(html)) continue;

    const article = extractArticle(html);
    for (const pattern of FORBIDDEN_ARTICLE_PATTERNS) {
      assertTrue(
        !article.includes(pattern),
        `${rel}: light-body article must not use "${pattern}" (use text-primary / text-secondary + prose)`,
      );
    }
    assertTrue(
      !/<h1[^>]*class="[^"]*text-white\b/.test(article),
      `${rel}: light-body post title must not use text-white on h1`,
    );
  }
}

async function main() {
  await checkBlogSources();
  await checkBuiltBlogPages();
  console.log("Blog chrome check passed.");
}

main().catch((error) => {
  console.error(`Blog chrome check failed: ${error.message}`);
  process.exit(1);
});
