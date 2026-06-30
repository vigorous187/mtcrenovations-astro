# Ponytail debt ledger

Intentional shortcuts and upgrade triggers for MTC Renovations. Remove entries when resolved.

| ID    | Area           | Debt                                                     | Upgrade trigger                                       | Status     |
| ----- | -------------- | -------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| D-001 | Phase 2        | Ponytail rule + docs adopted on mtcrenovations-astro     | —                                                     | **closed** |
| D-002 | Content Engine | CE internal link map / post publishing not wired for MTC | Dashboard CE link map ships for `mtcrenovations`      | open       |
| D-003 | GSC            | Per-site GSC SEO sprint not yet run                      | Execute `forge-seo-sprint` skill for `mtcrenovations` | open       |

## Site notes

- **Editorial calendar:** `blog-calendar.json` at repo root tracks slug, keyword, target date, and publish status — keep in sync when shipping blog posts.
- **Pricing gate:** `scripts/check-pricing-alignment.mjs` binds FAQ bands, blog cost claims, and JobTread anchors to `pricing-estimator.json` — do not bypass.

Last updated: Phase 2 Ponytail adopted — D-001 closed.
