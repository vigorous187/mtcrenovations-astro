# MTC consent quality evidence

Project/environment: `vigorous187/mtcrenovations-astro` candidate only

Release/build: `codex/consent-necessary-only-20260814`  
Reviewer/date: Codex / 2026-08-14  
Gate: Page Complete (consent interaction)  
Overall result: NOT VERIFIED

## Evidence register

| Area | Check | Result | Method | Evidence / follow-up |
| --- | --- | --- | --- | --- |
| Build | Production-equivalent Astro/Cloudflare build | PASS | `npm run build` | All repository SEO/content gates pass. |
| Analytics/privacy | Missing, rejected, explicit, and version-mismatch states | PASS | `npm run test:consent` | Consent Mode v2 defaults deny all four fields; only explicit current-version choices grant. |
| Analytics/privacy | 320 px browser network contract | PASS | `npm run test:consent:browser` | No Zaraz or Meta request before choice/reject; accept loads each once; withdrawal updates denied and offers reload. |
| Accessibility | Labels, dialog semantics, keyboard-sized controls | PASS | Markup review + 320 px Playwright interaction | Automated interaction covers banner, dialog, checkboxes, and reload control. Focused assistive-technology review remains NOT TESTED. |
| Production | Cloudflare Zaraz state | FAIL | Read-only Cloudflare API `GET /zones/.../settings/zaraz/config` | `autoInjectScript=true`; Consent Management absent; GA4 and Clarity have no `defaultPurpose`. |
| Release | Fail-closed external preflight | PASS | `npm run verify:consent:release` + workflow step | Deployment cannot proceed without a read-only token or unless the exact required state passes. |
| Production | Live before/reject/accept/withdraw network evidence | NOT TESTED | Protected production run | Must occur only after configuration, merge, and legacy deploy-trigger removal approvals. |

## Required external state before any release

1. Turn Cloudflare Zaraz **Auto-inject script** off. The site loads `/cdn-cgi/zaraz/i.js` only after analytics consent.
2. Enable Zaraz Consent Management and hide its native modal because the site supplies the accessible UI.
3. Create one `Analytics` purpose and assign **every active Zaraz tool** to it. Current tools are Google Analytics 4 and Microsoft Clarity. No tool may be unassigned.
4. Keep Google Consent Mode v2 default denied. The site sets `google_consent_default` before releasing queued events and sends `google_consent_update` for every saved choice.
5. Store a least-privilege Zaraz-read token as GitHub Actions secret `CLOUDFLARE_ZARAZ_READ_TOKEN`. The deploy workflow reads configuration only and fails closed.
6. Verify in a protected preview and then production: zero GA4, Clarity, Zaraz, or Meta measurement before choice/reject; one load after the matching opt-in; immediate denied update and reload path after withdrawal.

MTC remains unmerged and unreleased while the legacy launchd job and obsolete Workers trigger are active.
