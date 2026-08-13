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
| Performance       | Mobile Lighthouse and lab LCP/TBT/CLS                                               | FAIL       | `/`, `/basement/`, `/location/hamilton/` | Lighthouse 12.8.2 mobile default against exact static production output   | LCP fails all three representative templates; TBT and CLS pass                                     | Forge           |
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
| `/`                   | Lighthouse mobile default |          62 |           100 |            100 | 100 | 11,409 ms |   53 ms | 0.001 | Exact static candidate; no CDN compression/cache |
| `/basement/`          | Lighthouse mobile default |          64 |           100 |            100 | 100 |  7,803 ms |   47 ms | 0.001 | Exact static candidate; no CDN compression/cache |
| `/location/hamilton/` | Lighthouse mobile default |          63 |           100 |            100 | 100 |  7,355 ms |   48 ms | 0.033 | Exact static candidate; no CDN compression/cache |

The lab server does not reproduce Cloudflare compression or caching, so these results are a conservative candidate proxy. They remain `FAIL`; this limitation is not treated as a pass or exception.

## Exceptions and blockers

- Approved exceptions: none supplied.
- Failed mandatory requirements: representative mobile Performance and LCP remain below the house thresholds. The candidate improved home LCP from 12,256 ms to 11,409 ms; basement and Hamilton varied from their recorded baselines and remain failures. Accessibility regressions were not traded for performance.
- Untested mandatory requirements: content-owner approval; manual keyboard/zoom/assistive-technology review; responsive device review; field CWV; authorized form delivery; browser analytics and consent behavior.

## Approval

Prepared by/date: Codex / 2026-08-13

Approved by/role/date: NOT TESTED — accountable owner approval not supplied.
