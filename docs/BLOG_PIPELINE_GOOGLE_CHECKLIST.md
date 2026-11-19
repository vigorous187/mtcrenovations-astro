# Blog pipeline — Google checklist

Reviewed 2026-09-21 against the allowlisted sources in `scripts/seo-guideline-sources.json`. This file is the in-repo copy of the shared checklist. Fingerprints live in `automation/guideline-baseline.json`.

| Id | URL | Doc last updated |
| --- | --- | --- |
| helpful-content | https://developers.google.com/search/docs/fundamentals/creating-helpful-content | 2025-12-10 UTC |
| gen-ai-content | https://developers.google.com/search/docs/fundamentals/using-gen-ai-content | 2025-12-10 UTC |
| spam-policies | https://developers.google.com/search/docs/essentials/spam-policies | 2026-08-28 UTC |

## People-first

- Write for homeowners who would use the page if they came to the site directly.
- Add original, specific, first-hand renovation detail. Do not republish other pages with light rewriting.
- Titles and headings describe the page. No shock headlines or ranking promises.
- Make it clear who is responsible. Trust matters most. Cost, permit, and safety topics sit closer to YMYL, so sourcing and accuracy matter more there.
- Do not change publish or modified dates to look fresh when the body did not substantially change.
- Do not add or delete posts mainly to make the site look fresh.
- Discovery work (internal links, sitemap, IndexNow) belongs on people-first pages.

## Generative AI

- Automation may research and structure a draft. It may not ship many pages that add little for the reader.
- Posts with `howCreated: automation-llm` are AI-assisted. Say how the draft was produced when a reader would reasonably ask.
- Check facts, local cost and code claims, and metadata (title, description, structured data, image alt) before merge.
- The reason for the page is helping the reader, not manipulating rankings or generative AI answers.

## Spam policies — do not

- Scaled content abuse: many low-value or near-duplicate pages, including generative-AI pages without added value.
- Doorway pages, city or keyword stuffing, hidden text, cloaking, sneaky redirects, or scraped rewrites.
- Link schemes and thin affiliate pages.
- Third-party pages published mainly to borrow this domain's ranking (site reputation policy).

## 2026-09-21 review

Helpful-content and generative-AI docs are still dated 2025-12-10 UTC, before the 2026-05-15 fingerprint baseline. Those two pages did not require checklist edits.

Spam policies were updated 2026-08-28 UTC. Material change: the site reputation policy now splits enforcement. Outside the EEA, a manual action still affects only the offending section. Inside the EEA, that manual action does not change rankings; the section may be categorized apart from the main domain and rank on its own. MTC publishes for Ontario. The publishing rule is unchanged: first-party content, editorial control, and no third-party pages hosted to borrow rank.

Blog quality gates were not changed. Fingerprint scripts request `Accept-Language: en`. Without that header, these URLs sometimes redirect to a machine translation (`?hl=`), and the monthly check fails on locale noise. After this review, refresh fingerprints with `npm run seo:guidelines:init`.
