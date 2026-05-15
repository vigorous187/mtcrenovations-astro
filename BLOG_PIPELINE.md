# MTC Renovations — blog & SEO automation pipeline

Canonical Google checklist: [~/Developer/shared/docs/BLOG_PIPELINE_GOOGLE_CHECKLIST.md](file:///Users/user/Developer/shared/docs/BLOG_PIPELINE_GOOGLE_CHECKLIST.md)

## Schedule

| Workflow                  | When                            | Purpose                                                                                       |
| ------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| `blog-automation.yml`     | Weekly (Mon 13:30 UTC) + manual | Opens **one PR** with a `draft: true` post from `blog-calendar.json` (`pending` → `draft-pr`) |
| `seo-build-health.yml`    | Weekly (Mon 12:00 UTC)          | `npm ci` + `npm run build` on `main`                                                          |
| `seo-guideline-drift.yml` | Monthly (1st 14:00 UTC)         | Fingerprint Google docs; opens issue on change                                                |
| `deploy.yml`              | Push to `main`                  | Cloudflare Pages + **IndexNow** after deploy                                                  |

**Default cadence:** at most **one** automated draft PR per week (`N=1`). No direct-to-prod without merge.

## Secrets (GitHub Actions)

| Secret                  | Required for                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Pages deploy (existing)                                               |
| `CLOUDFLARE_ACCOUNT_ID` | Pages deploy (existing)                                               |
| `INDEXNOW_KEY_MTC`      | Post-deploy IndexNow (`3d4e64…` — must match `public/*.txt` key file) |

## Money pages (internal links in drafts)

Use `/estimate/`, `/contact/`, service hubs under `/basement/`, `/kitchen/`, `/bathroom/`, etc., as appropriate in finished articles.

## Idempotency

- `scripts/blog-open-slot.mjs` picks the first `pending` calendar row with **no** matching `src/content/blog/{slug}.md`.
- Re-runs skip when no pending slots remain.

## Rollback

- Cloudflare Pages: dashboard rollback for project `mtc-renovations` (see shared [cf-pages-deploy-guard.sh](file:///Users/user/Developer/shared/scripts/cf-pages-deploy-guard.sh) for preview-first pattern on other properties).

## Commands

```bash
npm run blog:inventory -- --days=90
npm run seo:guidelines:check
npm run seo:guidelines:init   # refresh baseline after intentional doc updates
```

## Proof inventory (90-day window)

Rule: non-draft posts where `datePublished` is within the last **90** days (local `America/Toronto` date from `blog-inventory.mjs`). Regenerate before audits:

```bash
npm run blog:inventory -- --days=90
```

### Snapshot 2026-05-14

| Slug                                         | File                                            | datePublished | In window |
| -------------------------------------------- | ----------------------------------------------- | ------------- | --------- |
| kitchen-refresh-vs-full-reno-hamilton-2026   | kitchen-refresh-vs-full-reno-hamilton-2026.md   | 2026-05-13    | yes       |
| basement-egress-windows-ontario-code-basics  | basement-egress-windows-ontario-code-basics.md  | 2026-05-10    | yes       |
| reno-timeline-winter-vs-summer-ontario       | reno-timeline-winter-vs-summer-ontario.md       | 2026-05-07    | yes       |
| selecting-tile-and-grout-bathroom-durability | selecting-tile-and-grout-bathroom-durability.md | 2026-05-05    | yes       |
| bathroom-renovation-cost-oakville            | bathroom-renovation-cost-oakville.md            | 2026-04-15    | yes       |
| duplex-to-fourplex-conversion-ontario        | duplex-to-fourplex-conversion-ontario.md        | 2026-03-22    | yes       |
| exterior-renovation-cost-hamilton            | exterior-renovation-cost-hamilton.md            | 2026-03-15    | yes       |
| renovation-mistakes-homeowners               | renovation-mistakes-homeowners.md               | 2026-03-07    | yes       |
| choosing-renovation-contractor-hamilton      | choosing-renovation-contractor-hamilton.md      | 2026-02-28    | yes       |
| master-bathroom-renovation-burlington        | master-bathroom-renovation-burlington.md        | 2026-02-20    | yes       |

**Count in window:** 10 / 20 total published
