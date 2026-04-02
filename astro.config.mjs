import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
// NOTE: @astrojs/sitemap temporarily removed — incompatible with @astrojs/cloudflare 11.x in hybrid mode.
// Re-add after upgrading to compatible versions. Sitemap can also be generated post-build.

export default defineConfig({
  site: 'https://www.mtcrenovations.ca',
  output: 'hybrid',
  adapter: cloudflare(),
  integrations: [
    tailwind(),
  ],
});
