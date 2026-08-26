# Website quality evidence report

Project/environment: MTC Renovations / PR #5 candidate

Release/build: `codex/mtc-measurement-release-safety-20260813`

Reviewer/date: Codex / 2026-08-13

Gate: SITE COMPLETE

Overall result: FAIL

Representative URLs and templates: `/`, `/basement/`, `/location/hamilton/`, `/contact/`, `/estimate/`, `/blog/`, `/blog/open-concept-renovation-hamilton/`

## Evidence register

| Area              | Check                                                                               | Result     | URL/template                             | Tool or method                                                            | Evidence                                                                                           | Owner/follow-up |
| ----------------- | ----------------------------------------------------------------------------------- | ---------- | ---------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| Build             | Production build and tests                                                          | PASS       | All generated routes                     | `npm run build`, SEO automation and release contracts                     | CI build log and `site-quality-report.json` artifact                                               | MTC / Forge     |
| Crawl             | Internal links/assets, robots, sitemap, 404                                         | PASS       | 81 sitemap URLs                          | Generated-output audit plus SEO baseline                                  | 1,914 internal links and 993 assets checked; broken nearby/service links corrected                 | Forge           |
| SEO               | Unique titles/descriptions, self-canonicals, index state                            | PASS       | 81 sitemap URLs                          | Generated HTML and sitemap audit                                          | CI artifact                                                                                        | Forge           |
| Content           | Accuracy, approval, claims, placeholders                                            | NOT TESTED | Site-wide                                | No accountable content-owner approval was supplied                        | Owner approval required                                                                            | MTC             |
| Structured data   | Parseability and required business/article/breadcrumb fields                        | PASS       | 170 JSON-LD blocks                       | JSON parse and type-specific contract                                     | Aggregate-rating business URL corrected                                                            | Forge           |
| Accessibility     | Static landmarks, language, H1, skip link, control names/labels                     | PASS       | 81 sitemap URLs                          | Generated HTML audit                                                      | Added shared skip target; corrected JobTread alt/select label                                      | Forge           |
| Accessibility     | Automated mobile scan                                                               | PASS       | `/`, `/basement/`, `/location/hamilton/` | Lighthouse 12.8.2 Accessibility                                           | All three score 100; zero color-contrast or heading-order findings                                  | Forge / MTC     |
| Accessibility     | Keyboard, focus, 200% zoom, assistive technology                                    | NOT TESTED | Representative templates                 | Manual evidence not captured for this exact candidate                     | Authorized browser review required                                                                 | MTC / Forge     |
| Responsive        | 320 px, mobile, tablet, desktop, zoom                                               | NOT TESTED | Representative templates                 | Manual browser/device evidence not captured                               | Authorized browser review required                                                                 | MTC / Forge     |
| Images            | Alt presence and priority/lazy conflicts                                            | PASS       | 81 sitemap URLs                          | Generated HTML audit                                                      | Missing JobTread logo alt corrected; no high-priority lazy image                                   | Forge           |
| Images            | Reserved dimensions/aspect ratio                                                    | PASS       | Site-wide                                | Generated HTML audit                                                      | 0 of 624 generated images lack deterministic reserved space; CI fails on any regression above zero | Forge           |
| Performance       | Compressed initial JS budget                                                        | PASS       | Generated pages                          | Deterministic gzip calculation                                            | 10,369 bytes against 153,600-byte budget                                                           | Forge           |
| Performance       | Mobile Lighthouse and lab LCP/TBT/CLS                                               | FAIL       | `/`, `/basement/`, `/location/hamilton/` | Lighthouse 12.8.2 mobile default against exact static output with gzip and production-style cache headers | Basement and Hamilton now pass the 2.5 s LCP threshold; home remains at 2.86 s and therefore keeps the overall gate closed | Forge |
| Performance       | Field LCP/INP/CLS                                                                   | NOT TESTED | Production                               | Requires sufficient real-user field data                                  | Review CrUX/Search Console after traffic accrues                                                   | Forge           |
| Functionality     | Forms and primary conversions                                                       | NOT TESTED | Contact/estimate/lead intake             | Real submissions are outside this audit authorization                     | Authorized test lead required                                                                      | MTC             |
| Analytics/privacy | Static Zaraz conversion contracts                                                   | PASS       | Candidate                                | Existing SEO automation and postdeploy contracts                          | CI log                                                                                             | Forge           |
| Analytics/privacy | Browser event and consent behavior                                                  | NOT TESTED | Candidate/production                     | No browser event capture or policy approval in this audit                 | Authorized browser review required                                                                 | MTC / Forge     |
| Security          | Exact release, headers, secrets, dependencies                                       | PASS       | Release workflow                         | Existing exact-SHA release, identity, rollback, and critical verification | `deploy.yml`, `post-deploy-safety.mjs`                                                             | Forge           |
| Operations        | Monitoring, rollback, ownership                                                     | PASS       | Production release                       | Captured last-known-good deployment and verified auto rollback            | `deploy.yml`                                                                                       | Forge           |
| Postdeploy        | Identity, priority status, sitemap, lead contract, IndexNow key, true 404           | PASS       | Production release contract              | Existing retrying postdeploy verifier and expected-commit assertion       | `post-deploy-safety.mjs`                                                                           | Forge           |
| Postdeploy        | Full-site links/assets, browser accessibility, mobile lab, form delivery, field CWV | NOT TESTED | Production                               | Candidate checks do not prove deployed CDN/browser behavior               | Separate authorized acceptance run                                                                 | MTC / Forge     |

## Metric record

| URL/template          | Device/profile            | Performance | Accessibility | Best Practices | SEO |       LCP | TBT/INP |   CLS | Report                                        |
| --------------------- | ------------------------- | ----------: | ------------: | -------------: | --: | --------: | ------: | ----: | --------------------------------------------- |
| `/`                   | Lighthouse mobile default, clean serial gzip run | 92 | 100 | 100 | 100 | 2,860 ms | 207 ms | 0 | Exact gzip baseline: 7,587 ms LCP; 62% improvement |
| `/basement/`          | Lighthouse mobile default, clean serial gzip run | 99 | 100 | 100 | 100 | 2,121 ms | 81 ms | 0 | Prior raw-static reference: 5,704 ms; gzip baseline was not captured before this architecture change |
| `/location/hamilton/` | Lighthouse mobile default, clean serial gzip run | 97 | 100 | 100 | 100 | 2,033 ms | 163 ms | 0 | Prior raw-static reference: 5,557 ms; gzip baseline was not captured before this architecture change |

The local server applied gzip, immutable static-asset caching, and revalidation for HTML. It does not reproduce Cloudflare edge latency or field traffic. Home remains `FAIL`; this limitation is not treated as a pass or exception.

## Exceptions and blockers

- Approved exceptions: none supplied.
- Failed mandatory requirement: home mobile LCP is 2,860 ms against the unchanged 2,500 ms threshold. Its TBT was also 207 ms in the final clean run, 7 ms over the 200 ms target. Basement and Hamilton pass. Accessibility remains 100; no threshold was lowered.
- Critical-path finding: the generated candidate now has zero render-blocking stylesheets. The 5.5 KB compressed shared theme is inlined; a bounded Bootstrap first-viewport layer is inlined while the full framework remains authoritative and loads asynchronously. Delaying the full framework until `load` caused CLS and was rejected.
- Delivery finding: mobile heroes now use responsive AVIF (WebP/JPEG fallbacks). The home transfer fell from 259 KB JPEG to 20 KB AVIF, and basement uses an 11 KB AVIF. Five separate Inter faces were replaced by one 47 KB variable face without changing the font family or supported weights. Non-essential icon fonts begin after the critical hero path.
- Browser visual evidence: at 412×915, all three routes loaded the complete Bootstrap and Font Awesome styles, retained the intended Playfair/Inter typography and colors, selected AVIF heroes, and had 412 px document width with no horizontal overflow. Manual keyboard, zoom, and field CWV remain untested.
- Untested mandatory requirements: content-owner approval; manual keyboard/zoom/assistive-technology review; responsive device review; field CWV; authorized form delivery; browser analytics and consent behavior.

## Approval

Prepared by/date: Codex / 2026-08-13

Approved by/role/date: NOT TESTED — accountable owner approval not supplied.
