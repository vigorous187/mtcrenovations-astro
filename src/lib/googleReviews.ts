import site from '../data/site.json';

// Single source for the Google review count/rating shown on the site.
// src/data/site.json is refreshed from reviews.forge-co.ca at build time
// (see src/data/fetch-reviews-from-worker.mjs). If that fetch fails, the
// committed value is the last known good one. If a value is missing or
// invalid we return null and callers hide the number: never invent one.
const g = (site as { googleReviews?: { count?: unknown; rating?: unknown } }).googleReviews ?? {};

export const reviewCount: number | null =
  typeof g.count === 'number' && Number.isFinite(g.count) && g.count > 0 ? Math.floor(g.count) : null;

export const reviewRating: number | null =
  typeof g.rating === 'number' && Number.isFinite(g.rating) && g.rating > 0 && g.rating <= 5 ? g.rating : null;

/** "34 Google reviews (4.9 average)", or just "Google reviews" when the numbers are unavailable. */
export const reviewSummary: string =
  reviewCount === null
    ? 'Google reviews'
    : `${reviewCount} Google reviews${reviewRating === null ? '' : ` (${reviewRating} average)`}`;
