# Ponytail + SEO Sprint Plan (MTC)

**Site:** www.mtcrenovations.ca · **Repo:** mtcrenovations-astro · **Vertical:** renovation  
**Debt:** [ponytail-debt.md](./ponytail-debt.md) · **Rule:** [`.cursor/rules/ponytail.mdc`](../.cursor/rules/ponytail.mdc)

---

## Phase 2 — Adopted

- Ponytail Cursor rule (`alwaysApply: true`) with renovation-specific SEO non-regression contract
- Debt ledger D-001 closed; D-002 (CE) and D-003 (GSC sprint) pending
- Build gate includes `check-pricing-alignment.mjs` — pricing/FAQ/blog bands must stay aligned

---

## Shared kit (manifest + skill)

| Layer    | Location                                                              | Purpose                                                  |
| -------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| Manifest | `~/Developer/shared/scripts/config/client-seo-playbook.json`          | MTC slug `mtcrenovations`, repo path, deploy, conversion |
| Skill    | `~/claude/skills/forge-seo-sprint/SKILL.md`                           | GSC audit → surgical fixes → build → deploy              |
| Standard | `~/Developer/shared/knowledge-hub/seo/website-production-standard.md` | Production gate checklist                                |
| Template | `~/Developer/shared/templates/ponytail/`                              | Debt stub + Phase 2 registry notes                       |

**Conversion path:** `/estimate/` · **Deploy:** GitHub Actions → Cloudflare Pages (`mtc-renovations`) · **Blog format:** MD

---

## Next steps

1. **D-002** — Wire Content Engine internal links for renovation vertical in seo-dashboard-platform
2. **D-003** — Run evidence-based GSC sprint via `forge-seo-sprint` (no TRG copy-paste)
3. Keep `blog-calendar.json` aligned with published slugs

---

## SEO non-regression (binding)

1. No URL slug changes without 301 + verify
2. No `noindex` on indexable pages
3. All build gates pass before deploy (including pricing alignment)
4. Surgical title/meta only (GSC-driven)
5. Internal links → real routes only
6. Smoke-test after deploy
7. **SEO wins over cleanup**

Update [ponytail-debt.md](./ponytail-debt.md) as deferred items resolve.
