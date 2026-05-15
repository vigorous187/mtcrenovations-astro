import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const REVIEWS_PATH = join(__dirname, "reviews-artifact.json");
const LEGACY_REVIEWS_PATH = join(__dirname, "reviews.json");
const SITE_PATH = join(__dirname, "site.json");
const LLMS_PATH = join(ROOT, "public", "llms.txt");

const API_BASE =
  process.env.FORGE_REVIEWS_API_BASE ?? "https://reviews.forge-co.ca";

function patchLlmsTxt(count, rating) {
  let content = readFileSync(LLMS_PATH, "utf-8");
  const line = `${count} Google reviews (${rating} average rating)`;
  const reviewLine =
    /- \d+\+? five-star Google reviews[^\n]*\n|- \d+ Google reviews[^\n]*\n/g;
  if (reviewLine.test(content)) {
    content = content.replace(reviewLine, `- ${line}\n`);
  } else {
    content = content.replace(/(## Key Facts\n)/, `$1- ${line}\n`);
  }
  writeFileSync(LLMS_PATH, content);
}

function writeLegacyReviews(reviews) {
  const legacy = reviews.map((r) => ({
    name: r.name,
    profilePhoto: r.profilePhoto,
    googleProfileUrl: r.googleProfileUrl,
    rating: r.rating,
    text: r.text,
    relativeTime: r.relativeTime,
    publishTime: r.publishTime,
  }));
  writeFileSync(LEGACY_REVIEWS_PATH, JSON.stringify(legacy, null, 2) + "\n");
}

export async function fetchReviewsFromWorker() {
  const url = `${API_BASE.replace(/\/$/, "")}/api/reviews/mtc`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Reviews API ${res.status}`);
    }
    const data = await res.json();
    const artifact = {
      aggregate: data.aggregate,
      reviews: data.reviews,
      fetched_at: data.fetched_at,
      googleReviewsUrl: "https://g.page/r/mtcrenovations/review",
    };
    writeFileSync(REVIEWS_PATH, JSON.stringify(artifact, null, 2) + "\n");
    writeLegacyReviews(data.reviews);

    const site = JSON.parse(readFileSync(SITE_PATH, "utf-8"));
    site.googleReviews.rating = data.aggregate.rating;
    site.googleReviews.count = data.aggregate.count;
    writeFileSync(SITE_PATH, JSON.stringify(site, null, 2) + "\n");

    if (data.aggregate.count > 0) {
      patchLlmsTxt(data.aggregate.count, data.aggregate.rating);
    }

    console.log(
      `[reviews] Worker: ${data.reviews.length} reviews, ${data.aggregate.count} total (${data.source})`,
    );
    return data.reviews.length > 0;
  } catch (err) {
    console.warn(
      `[reviews] Worker fetch failed: ${err.message} — using existing reviews.json`,
    );
    try {
      const site = JSON.parse(readFileSync(SITE_PATH, "utf-8"));
      const legacy = JSON.parse(readFileSync(LEGACY_REVIEWS_PATH, "utf-8"));
      const artifact = {
        aggregate: {
          rating: site.googleReviews?.rating ?? 0,
          count: site.googleReviews?.count ?? 0,
        },
        reviews: legacy.map((r) => ({
          ...r,
          googleReviewUrl: r.googleReviewUrl ?? null,
        })),
        fetched_at: new Date().toISOString(),
        googleReviewsUrl: site.googleReviews?.url,
      };
      writeFileSync(REVIEWS_PATH, JSON.stringify(artifact, null, 2) + "\n");
      if (artifact.aggregate.count > 0) {
        patchLlmsTxt(artifact.aggregate.count, artifact.aggregate.rating);
      }
      return legacy.length > 0;
    } catch {
      return false;
    }
  }
}
