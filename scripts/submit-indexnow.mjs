/**
 * Post-deploy IndexNow batch from dist/sitemap-0.xml (matches cf-pages-deploy-guard pattern).
 * Env: INDEXNOW_HOST (e.g. www.mtcrenovations.ca), INDEXNOW_KEY
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const host = process.env.INDEXNOW_HOST;
const key = process.env.INDEXNOW_KEY;
const sitemapPath = path.join(process.cwd(), "dist", "sitemap-0.xml");

if (!host || !key) {
  console.error("Missing INDEXNOW_HOST or INDEXNOW_KEY");
  process.exit(1);
}

const xml = await readFile(sitemapPath, "utf8");
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length) {
  console.error("No URLs in sitemap");
  process.exit(1);
}

const payload = {
  host,
  key,
  keyLocation: `https://${host}/${key}.txt`,
  urlList: urls,
};

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

console.log("IndexNow HTTP", res.status);
if (!res.ok) {
  const t = await res.text();
  console.error(t.slice(0, 500));
  process.exit(1);
}
