# Sprint 17.1 — CRM UI Audit Fixes

| Campo            | Valore                                      |
| ---------------- | ------------------------------------------- |
| **Fase**         | Phase 3 — Customer Service                  |
| **Date**         | 2026-03-31 (sub-sprint)                     |
| **Obiettivo**    | Fix all High + Medium issues from CRM full-page audit (2026-03-31). Mobile responsive, i18n consistency, portal localization, UI polish. |
| **Capacità**     | 10 SP (solo dev)                            |

---

## Sprint Backlog

### High Priority

- [ ] T-1711 — KB mobile table: wrap in horizontal scroll container OR hide PUBLISHED DATE column on xs. Status column "Pubbli..." must be fully readable — [2 SP] — 📋 TODO
- [ ] T-1712 — Portal nav links hardcoded English: "Knowledge Base" and "Submit Ticket" in `PortalLayout.tsx` must use `useTranslations()` portal section — [1 SP] — 📋 TODO
- [ ] T-1713 — Portal KB mixed language: category names/descriptions stored as English in DB. Title/subtitle/search correctly translated but content is EN. Add locale-aware fallback: if user locale is IT, show translated category names via a `nameIt` field or accept EN content with a visible language indicator — [2 SP] — 📋 TODO

### Medium Priority

- [ ] T-1714 — Portal KB pluralization: `"1 articles"` → `"1 article"`. Use count-aware string in translations or inline ternary — [1 SP] — 📋 TODO
- [ ] T-1715 — Portal ticket tracking: priority chip shows raw `"high"` instead of translated `"Alta"`. Map priority to `tp?.priorityHigh` etc. — [1 SP] — 📋 TODO
- [ ] T-1716 — Deal detail stage stepper: all stages show as completed (blue) even for "Closed Lost". Differentiate lost deals with error color on final step — [1 SP] — 📋 TODO
- [ ] T-1717 — AI Governance mobile: "Modelli" tab label truncated to "Model...". Use `scrollable` variant on Tabs or shorter labels on xs — [1 SP] — 📋 TODO
- [ ] T-1718 — Forecast mobile: chart legend chip "Errore Med..." truncated. Shorten label text or use responsive legend below chart — [1 SP] — 📋 TODO

**Totale: 10 SP**

---

## Dipendenze

- Sprint 17 completato: KB + Portal pages already deployed and validated.
- Audit screenshots at `scripts/screenshots/audit/` for visual reference.

## Rischi

1. **T-1713 locale-aware content** — Most complex task. Options: (a) accept EN content as-is and just display it consistently, (b) add `nameIt`/`descriptionIt` fields to KBCategory, (c) use a generic `translations JSON` field. Option (a) is simplest for MVP.
2. **T-1716 deal stepper** — Need to check if "Closed Lost" is detectable from stage name or if there's a `type` field on pipeline stages.

## Definition of Done

- [ ] KB table fully readable on 375px mobile — no clipped text
- [ ] Portal nav links translated (IT shows "Base di Conoscenza" / "Invia Ticket")
- [ ] Portal KB content language is consistent (either all EN or all IT)
- [ ] `"1 articles"` → `"1 article"` pluralization fixed
- [ ] Priority chips translated on portal ticket tracking
- [ ] Deal stepper visually distinguishes won vs lost
- [ ] AI Governance + Forecast tabs/legends not truncated on mobile
- [ ] `npx tsc --noEmit` passes on both backend and frontend
- [ ] Production validated via Edge CDP screenshots (desktop + mobile)
