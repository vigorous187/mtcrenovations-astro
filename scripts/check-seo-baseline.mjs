import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const checks = {
  robotsFile: path.join(ROOT, "public", "robots.txt"),
  canonicalFile: path.join(ROOT, "src", "components", "SEOHead.astro"),
  redirectsFile: path.join(ROOT, "public", "_redirects"),
  articleSchemaFile: path.join(ROOT, "src", "components", "seo", "schemas.ts"),
  sitemapFiles: [
    path.join(ROOT, "public", "sitemap-index.xml"),
    path.join(ROOT, "public", "sitemap-0.xml"),
    path.join(ROOT, "dist", "sitemap-index.xml"),
    path.join(ROOT, "dist", "sitemap-0.xml"),
  ],
  noindexPaths: [
    "/thank-you/",
    "/newvendorintake/",
    "/newleadintake/",
    "/basement/why-mtc/",
    "/bathroom/why-mtc/",
    "/kitchen/why-mtc/",
    "/flooring/why-mtc/",
    "/painting/why-mtc/",
  ],
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

  const redirects = await readIfExists(checks.redirectsFile);
  assertTrue(redirects, "Missing public/_redirects");
  assertTrue(
    /\/sitemap\.xml\s+\/sitemap-index\.xml\s+301/.test(redirects),
    "public/_redirects must 301 /sitemap.xml to /sitemap-index.xml",
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

  const combinedSitemap = sitemapContents.join("\n");
  for (const blockedPath of checks.noindexPaths) {
    assertTrue(
      !combinedSitemap.includes(blockedPath),
      `Noindex path is present in sitemap: ${blockedPath}`,
    );
  }

  console.log("SEO baseline check passed.");
}

main().catch((error) => {
  console.error(`SEO baseline check failed: ${error.message}`);
  process.exit(1);
});
