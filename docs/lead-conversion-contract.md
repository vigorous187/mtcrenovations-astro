# Lead conversion contract

## Counted conversion

`newleadintake` emits `generate_lead` through Cloudflare Zaraz only when the API confirms all of the following:

- the request succeeded;
- the API explicitly marks the response conversion-eligible;
- JobTread sync is not pending; and
- JobTread returned a non-empty job ID.

The browser does not fall back to `gtag`. CTA clicks remain intent events and submit-button clicks are not conversions. Phone and email links use `phone_click` and `email_click` through Zaraz.

## Retry and deduplication

The browser assigns one random submission ID and reuses it after a network error. Confirmed API responses are cached in the existing `ESTIMATES` KV binding for 90 days. A sequential retry returns that result with `deduplicated: true` instead of creating another JobTread job. Saved estimates also short-circuit when they already contain a confirmed JobTread job ID.

This is best-effort protection, not a global transactional lock. Cloudflare KV is eventually consistent, so simultaneous submissions in different locations can still race. JobTread creation is multi-step and its current Pave integration provides no atomic idempotency key; a failure after a partial create can also require manual reconciliation.

## Safe verification boundary

`npm run test:seo-automation` uses in-memory fakes and never submits a form or writes JobTread. A real end-to-end test requires an owner-approved test contact, a unique test marker, access to verify the created JobTread job, and permission to remove or retain that test record. Until those controls exist, JobTread delivery is `NOT VERIFIED` rather than inferred from an HTTP response.

The official JobTread form on `/contact/` is a separate cross-origin embed. Its confirmed-success event remains deferred until a supported JobTread callback or webhook is configured.

## Release safety

The deploy workflow records the current successful Cloudflare Pages production deployment before upload. Release verification performs read-only checks for site identity, the Zaraz phone/email and confirmed-lead contracts, robots and sitemap, the lead form, the estimate KV binding, and real 404 behavior. A critical failure fails the workflow and calls Cloudflare Pages' official rollback endpoint for the recorded production deployment, then verifies the restored site with the baseline profile so an older last-known-good build is not required to contain the new release contract.
