import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwind from "@astrojs/tailwind";
import { fetchGoogleReviews } from "./src/data/fetch-reviews.mjs";
// NOTE: @astrojs/sitemap temporarily removed — incompatible with @astrojs/cloudflare 11.x in hybrid mode.
// Re-add after upgrading to compatible versions. Sitemap can also be generated post-build.

const googleReviewsIntegration = {
  name: "google-reviews",
  hooks: {
    "astro:build:start": async () => {
      await fetchGoogleReviews();
    },
  },
};

export default defineConfig({
  site: "https://www.mtcrenovations.ca",
  output: "hybrid",
  adapter: cloudflare({
    imageService: "compile",
  }),
  integrations: [tailwind(), googleReviewsIntegration],
});
