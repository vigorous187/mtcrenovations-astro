// Build gate: every visible Google review count/rating in dist must match
// src/data/site.json (which build refreshes from reviews.forge-co.ca), the
// JSON-LD aggregateRating must match, and retired hard-coded numbers must be gone.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const site = JSON.parse(readFileSync("src/data/site.json", "utf8"));
const { count, rating } = site.googleReviews;
const failures = [];
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [p] : [];
  });

let pages = 0;
for (const file of walk("dist")) {
  const html = readFileSync(file, "utf8");
  pages++;
  for (const m of html.matchAll(/reviewCount":"(\d+)"/g)) {
    if (Number(m[1]) !== count) failures.push(`${file}: JSON-LD reviewCount ${m[1]} != ${count}`);
  }
  for (const m of html.matchAll(/ratingValue":"([\d.]+)"/g)) {
    if (Number(m[1]) !== rating) failures.push(`${file}: JSON-LD ratingValue ${m[1]} != ${rating}`);
  }
  for (const m of html.matchAll(/\b(\d+)\+? (?:five-star |5-star )?Google reviews/gi)) {
    if (Number(m[1]) !== count) failures.push(`${file}: "${m[0]}" != ${count}`);
  }
  for (const m of html.matchAll(/\((\d+)\+? reviews\)/g)) {
    if (Number(m[1]) !== count) failures.push(`${file}: "${m[0]}" != ${count}`);
  }
  if (/perfect (?:5\.0|4\.9) rating/i.test(html)) failures.push(`${file}: "perfect rating" claim present`);
  if (/50\+ (?:five-star )?Google reviews/i.test(html)) failures.push(`${file}: retired "50+" count present`);
}

if (failures.length) {
  console.error(`[check-review-count] ${failures.length} problem(s):\n${failures.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log(`[check-review-count] OK: ${pages} pages consistent with site.json (count ${count}, rating ${rating}).`);
