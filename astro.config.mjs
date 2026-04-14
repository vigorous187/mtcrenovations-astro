import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwind from "@astrojs/tailwind";
import { fetchGoogleReviews } from "./src/data/fetch-reviews.mjs";
// NOTE: @astrojs/sitemap is INCOMPATIBLE with @astrojs/cloudflare 11.x in hybrid output mode.
// Error: "Cannot read properties of undefined (reading 'reduce')" at astro:build:done.
// Root cause: the cloudflare adapter does not expose the pages list that @astrojs/sitemap
// expects in hybrid mode. Tracked upstream: https://github.com/withastro/adapters/issues
// Workaround: manual sitemap at public/sitemap-0.xml (keep in sync with src/content/blog/).
// Re-test when @astrojs/cloudflare upgrades past 11.x or @astrojs/sitemap adds hybrid support.

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
  trailingSlash: "always",
  adapter: cloudflare({
    imageService: "compile",
  }),
  integrations: [tailwind(), googleReviewsIntegration],
});
