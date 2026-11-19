/**
 * Fetches real Google reviews at build time via Places API (New).
 * Falls back to existing reviews.json if API key is missing or call fails.
 *
 * Env vars:
 *   GOOGLE_PLACES_API_KEY — API key with Places API (New) enabled
 *   GOOGLE_PLACE_ID       — MTC Renovations Place ID
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEWS_PATH = join(__dirname, "reviews.json");
const SITE_PATH = join(__dirname, "site.json");

export async function fetchGoogleReviews() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    console.log(
      "[reviews] No GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID — using fallback reviews.json",
    );
    return false;
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}?fields=reviews,rating,userRatingCount`;
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "reviews,rating,userRatingCount",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[reviews] Places API error ${res.status}: ${body}`);
      return false;
    }

    const data = await res.json();

    if (!data.reviews || data.reviews.length === 0) {
      console.warn("[reviews] No reviews returned from API — using fallback");
      return false;
    }

    // Transform Google reviews to our format
    const reviews = data.reviews.map((r) => ({
      name: r.authorAttribution?.displayName || "Anonymous",
      profilePhoto: r.authorAttribution?.photoUri || null,
      googleProfileUrl: r.authorAttribution?.uri || null,
      rating: r.rating || 5,
      text: r.text?.text || "",
      relativeTime: r.relativePublishTimeDescription || "",
      publishTime: r.publishTime || "",
    }));

    // Write reviews
    writeFileSync(REVIEWS_PATH, JSON.stringify(reviews, null, 2) + "\n");
    console.log(
      `[reviews] Wrote ${reviews.length} real Google reviews to reviews.json`,
    );

    // Update site.json with live rating/count
    const site = JSON.parse(readFileSync(SITE_PATH, "utf-8"));
    if (data.rating) site.googleReviews.rating = data.rating;
    if (data.userRatingCount) site.googleReviews.count = data.userRatingCount;
    writeFileSync(SITE_PATH, JSON.stringify(site, null, 2) + "\n");
    console.log(
      `[reviews] Updated site.json — rating: ${data.rating}, count: ${data.userRatingCount}`,
    );

    return true;
  } catch (err) {
    console.error(`[reviews] Fetch failed: ${err.message} — using fallback`);
    return false;
  }
}
