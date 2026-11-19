# SANDBOX: mtcrenovations-astro
Status: 3 CLEAN RUNS -- AWAITING SHIP IT
Created: 2026-03-29
Goal: Build MTC Renovations Astro 4.x site with Bootstrap 5.3, dynamic service routes, content collections, SEO

## Run Log
- Run 1: CLEAN -- 44 HTML pages generated, all SEO elements verified (JSON-LD, OG, Twitter, canonical, hreflang)
- Run 2: CLEAN -- identical output, zero errors
- Run 3: CLEAN -- identical output, zero errors

## Notes
- @astrojs/sitemap temporarily removed: incompatible with @astrojs/cloudflare 11.x in hybrid mode (_routes undefined in build hook). Re-add after version update or generate sitemap post-build.
- Blog collection warning is expected (empty scaffold by design, no blog posts yet).
- Sharp image service warning is expected with Cloudflare adapter (uses Cloudflare's own image service in production).

## Graduation Checklist
- [x] Run 1: clean
- [x] Run 2: clean
- [x] Run 3: clean
- [ ] Michael approved: "ship it"

## Integration Notes
(fill after graduation)
