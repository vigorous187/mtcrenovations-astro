# Dashboard-owned IndexNow evidence — 2026-08-25

## Scope

This PR now routes MTC's post-release IndexNow request through the Forge SEO dashboard after the dashboard accepts the exact provider-verified Cloudflare deployment receipt. It does not apply the separate consent-policy PR and does not change pages, conversions, release identity, rollback, DNS, forms, or credentials.

## Contract

- The site-scoped `RELEASE_RECEIPT_SECRET` authenticates both messages; the dashboard cron secret is never distributed.
- The deployment receipt must be acknowledged before IndexNow can run.
- The dashboard binds the sender to `mtcrenovations`, the exact passed production deployment, and no more than 100 same-host canonical URLs.
- The existing fail-closed changed-route manifest remains authoritative. Shared or uncertain runtime changes select all canonical URLs; exact route changes select current sitemap members; operational workflow, sender, test, and evidence-only changes select zero URLs.
- Zero changed URLs record `not_required_no_changed_urls` in dashboard capability evidence without a provider call.
- Persisted provider failures are classified explicitly; only sanitized IDs and status values enter the retained artifact.
- IndexNow remains noncritical after a healthy release and never triggers rollback or a duplicate direct-provider POST.

Production remains blocked by the explicit MTC release controls documented elsewhere; this evidence does not authorize a merge or deployment while those controls are unmet.
