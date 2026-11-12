import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const checks = {
  robotsFile: path.join(ROOT, "public", "robots.txt"),
  canonicalFile: path.join(ROOT, "src", "components", "SEOHead.astro"),
  articleSchemaFile: path.join(ROOT, "src", "components", "seo", "schemas.ts"),
  sitemapFiles: [
    path.join(ROOT, "public", "sitemap.xml"),
    path.join(ROOT, "public", "sitemap-index.xml"),
    path.join(ROOT, "public", "sitemap-0.xml"),
    path.join(ROOT, "dist", "sitemap.xml"),
    path.join(ROOT, "dist", "sitemap-index.xml"),
    path.join(ROOT, "dist", "sitemap-0.xml"),
  ],
  noindexPaths: [
    "/thank-you/",
    "/newvendorintake/",
    "/newleadintake/",
    "/basement/careers/",
    "/bathroom/careers/",
    "/kitchen/careers/",
    "/flooring/careers/",
    "/painting/careers/",
    "/basement/about-us/",
    "/bathroom/about-us/",
    "/kitchen/about-us/",
    "/flooring/about-us/",
    "/painting/about-us/",
  ],
  indexableExplainers: ["basement", "kitchen", "bathroom", "flooring", "painting"].flatMap(
    (slug) => [`/${slug}/how-it-works/`, `/${slug}/why-mtc/`],
  ),
};

async function readIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

function distHtmlPath(pathname) {
  const rel = pathname.replace(/^\/|\/$/g, "");
  return path.join(ROOT, "dist", rel, "index.html");
}

async function walkHtml(dir, acc = []) {
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) await walkHtml(full, acc);
    else if (name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

function visibleWordCount(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

async function main() {
  const robots = await readIfExists(checks.robotsFile);
  assertTrue(robots, "Missing robots.txt");
  assertTrue(
    /^\s*Sitemap:\s*https?:\/\/\S+/m.test(robots),
    "robots.txt is missing a Sitemap directive",
  );

  const canonicalLayout = await readIfExists(checks.canonicalFile);
  assertTrue(canonicalLayout, "Missing SEO head component");
  assertTrue(
    canonicalLayout.includes('rel="canonical"'),
    "SEO head is missing canonical link tag",
  );

  const articleSchema = await readIfExists(checks.articleSchemaFile);
  assertTrue(articleSchema, "Missing article schema module");
  assertTrue(
    !articleSchema.includes("/assets/img/og-default.png"),
    "Article schema still uses the 404 /assets/img/og-default.png path",
  );
  assertTrue(
    articleSchema.includes("/assets/img/og/default.png"),
    "Article schema is missing the /assets/img/og/default.png fallback",
  );

  const sitemapContents = (
    await Promise.all(
      checks.sitemapFiles.map((sitemapPath) => readIfExists(sitemapPath)),
    )
  ).filter(Boolean);
  assertTrue(
    sitemapContents.length > 0,
    "No sitemap files found in dist/ or public/",
  );

  const sitemapXml =
    (await readIfExists(path.join(ROOT, "public", "sitemap.xml"))) ||
    (await readIfExists(path.join(ROOT, "dist", "sitemap.xml")));
  assertTrue(sitemapXml, "Missing public/sitemap.xml (or dist/sitemap.xml)");
  assertTrue(
    sitemapXml.includes("<sitemapindex") && sitemapXml.includes("/sitemap-0.xml"),
    "sitemap.xml must be a sitemapindex pointing at sitemap-0.xml",
  );

  const urlset =
    (await readIfExists(path.join(ROOT, "public", "sitemap-0.xml"))) || "";
  assertTrue(urlset.includes("<urlset"), "Missing public/sitemap-0.xml urlset");

  const combinedSitemap = sitemapContents.join("\n");
  for (const blockedPath of checks.noindexPaths) {
    assertTrue(
      !combinedSitemap.includes(blockedPath),
      `Noindex path is present in sitemap: ${blockedPath}`,
    );
  }

  for (const pathname of checks.indexableExplainers) {
    assertTrue(
      urlset.includes(`https://www.mtcrenovations.ca${pathname}`),
      `Indexable explainer missing from sitemap: ${pathname}`,
    );
    const html = await readIfExists(distHtmlPath(pathname));
    assertTrue(html, `Missing built HTML for ${pathname}`);
    assertTrue(
      !/noindex/i.test(html),
      `${pathname} still contains noindex`,
    );
    const h1s = html.match(/<h1\b/gi) || [];
    assertTrue(h1s.length === 1, `${pathname} should have one h1, found ${h1s.length}`);
  }

  const staticNoindex = checks.noindexPaths.filter(
    (pathname) => pathname !== "/newleadintake/",
  );
  for (const pathname of staticNoindex) {
    const html = await readIfExists(distHtmlPath(pathname));
    assertTrue(html, `Missing built HTML for noindex page ${pathname}`);
    assertTrue(
      /<meta name="robots" content="noindex,follow"/.test(html),
      `${pathname} must stay noindex,follow`,
    );
  }

  const intake = await readIfExists(
    path.join(ROOT, "src", "pages", "newleadintake.astro"),
  );
  assertTrue(intake && intake.includes("noindex={true}"), "/newleadintake/ must stay noindex");
  assertTrue(
    intake && !intake.includes("noindex={false}"),
    "/newleadintake/ must not be marked indexable",
  );

  for (const slug of ["flooring", "painting"]) {
    const html = await readIfExists(distHtmlPath(`/${slug}/`));
    assertTrue(html, `Missing built HTML for /${slug}/`);
    assertTrue(
      html.includes(`href="/${slug}/our-work/"`),
      `/${slug}/ must link to its project gallery`,
    );
  }

  const emailOff = "<!--email_off-->info@mtcrenovations.ca<!--/email_off-->";
  for (const pathname of ["/contact/", "/basement/careers/", "/privacy-policy/", "/terms-of-use/"]) {
    const html = await readIfExists(distHtmlPath(pathname));
    assertTrue(html, `Missing built HTML for ${pathname}`);
    assertTrue(
      html.includes(emailOff),
      `${pathname} must keep the address visible inside email_off so Cloudflare will not rewrite it`,
    );
  }

  const contact = await readIfExists(distHtmlPath("/contact/"));
  assertTrue(contact, "Missing built HTML for /contact/");
  const images = contact.match(/<img\b[\s\S]*?>/gi) || [];
  assertTrue(images.length >= 3, `Expected the contact images, found ${images.length}`);
  for (const img of images) {
    assertTrue(
      /\salt="[^"]+"/.test(img),
      `Contact image is missing alt: ${img.slice(0, 120)}`,
    );
  }

  const quoteCounts = [];
  for (const slug of ["basement", "bathroom", "flooring", "kitchen", "painting"]) {
    const html = await readIfExists(distHtmlPath(`/${slug}/get-free-quote/`));
    assertTrue(html, `Missing built HTML for /${slug}/get-free-quote/`);
    const words = visibleWordCount(html);
    quoteCounts.push(`${slug}=${words}`);
    assertTrue(words >= 400, `/${slug}/get-free-quote/ is thin (${words} words)`);
  }

  const htmlFiles = await walkHtml(path.join(ROOT, "dist"));
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    assertTrue(
      !/href=["']mailto:/i.test(html),
      `Crawlable mailto link in ${path.relative(ROOT, file)}`,
    );
    assertTrue(
      !html.includes("/cdn-cgi/l/email-protection"),
      `Email-protection URL in ${path.relative(ROOT, file)}`,
    );
  }

  console.log(`Quote page word counts: ${quoteCounts.join(", ")}`);
  console.log("SEO baseline check passed.");
}

main().catch((error) => {
  console.error(`SEO baseline check failed: ${error.message}`);
  process.exit(1);
});
