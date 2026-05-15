import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const baseUrl = "https://www.mtcrenovations.ca";
const today = new Date().toISOString().slice(0, 10);

const staticPages = [
  "/",
  "/about/",
  "/contact/",
  "/estimate/",
  "/faq/",
  "/locations/",
  "/blog/",
  "/mtc-vs-big-box-renovations/",
  "/mtc-vs-diy-renovation/",
  "/mtc-vs-general-contractors/",
  "/privacy-policy/",
  "/terms-of-use/",
];

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function listSlugs(directory, extension = ".md") {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name.slice(0, -extension.length));
}

async function getPublishedBlogSlugs(blogDir) {
  const entries = await fs.readdir(blogDir, { withFileTypes: true });
  const published = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(blogDir, entry.name);
    const content = await fs.readFile(filePath, "utf8");
    if (/^\s*draft:\s*true\s*$/m.test(content)) continue;
    published.push(entry.name.slice(0, -3));
  }

  return published;
}

function buildUrl(pathname) {
  return `${baseUrl}${pathname}`;
}

function toSitemapUrlTag(
  url,
  { changefreq = "monthly", priority = "0.7" } = {},
) {
  return `  <url><loc>${url}</loc><lastmod>${today}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

async function main() {
  const servicesPath = path.join(projectRoot, "src", "data", "services.json");
  const citiesDir = path.join(projectRoot, "src", "content", "cities");
  const blogDir = path.join(projectRoot, "src", "content", "blog");
  const publicDir = path.join(projectRoot, "public");

  const services = await readJson(servicesPath);
  const citySlugs = await listSlugs(citiesDir);
  const blogSlugs = await getPublishedBlogSlugs(blogDir);

  const urls = [];

  for (const page of staticPages) {
    const priority =
      page === "/"
        ? "1.0"
        : page === "/estimate/" || page === "/contact/"
          ? "0.8"
          : "0.7";
    const changefreq = page === "/" || page === "/blog/" ? "weekly" : "monthly";
    urls.push(toSitemapUrlTag(buildUrl(page), { changefreq, priority }));
  }

  for (const service of services) {
    urls.push(
      toSitemapUrlTag(buildUrl(`/${service.slug}/`), { priority: "0.9" }),
    );
    urls.push(
      toSitemapUrlTag(buildUrl(`/${service.slug}/our-work/`), {
        priority: "0.8",
      }),
    );
    urls.push(
      toSitemapUrlTag(buildUrl(`/${service.slug}/get-free-quote/`), {
        priority: "0.9",
      }),
    );
  }

  for (const slug of citySlugs) {
    urls.push(
      toSitemapUrlTag(buildUrl(`/location/${slug}/`), { priority: "0.7" }),
    );
  }

  for (const slug of blogSlugs) {
    urls.push(toSitemapUrlTag(buildUrl(`/blog/${slug}/`), { priority: "0.8" }));
  }

  const uniqueSortedUrls = [...new Set(urls)].sort();

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...uniqueSortedUrls,
    "</urlset>",
    "",
  ].join("\n");

  const sitemapIndex = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <sitemap>",
    `    <loc>${baseUrl}/sitemap-0.xml</loc>`,
    `    <lastmod>${today}</lastmod>`,
    "  </sitemap>",
    "</sitemapindex>",
    "",
  ].join("\n");

  await fs.writeFile(path.join(publicDir, "sitemap-0.xml"), sitemap, "utf8");
  await fs.writeFile(
    path.join(publicDir, "sitemap-index.xml"),
    sitemapIndex,
    "utf8",
  );
  console.log(`Generated sitemap with ${uniqueSortedUrls.length} URLs.`);
}

main().catch((error) => {
  console.error("Failed to generate sitemap:", error);
  process.exit(1);
});
