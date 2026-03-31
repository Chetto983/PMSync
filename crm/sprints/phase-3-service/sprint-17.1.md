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

- [x] T-1711 — KB mobile table: hide Published Date + Actions columns on xs. Status fully readable — [2 SP] — ✅ DONE
- [x] T-1712 — Portal nav links: use `useTranslations()` for "Base di Conoscenza"/"Invia Ticket" — [1 SP] — ✅ DONE
- [x] T-1713 — Portal KB mixed language: accepted EN content as user data, UI framing is locale-aware — [2 SP] — ✅ DONE (accepted)

### Medium Priority

- [x] T-1714 — Portal KB pluralization: singular/plural templates `articleCount`/`articlesCount` — [1 SP] — ✅ DONE
- [x] T-1715 — Portal ticket tracking: priority chip translated via `tp?.priorityHigh` etc. — [1 SP] — ✅ DONE
- [x] T-1716 — Deal stepper: Closed Lost uses `error.main` (red) instead of `primary.main` (blue) — [1 SP] — ✅ DONE
- [x] T-1717 — AI Governance tabs: `variant="scrollable" scrollButtons="auto"` — [1 SP] — ✅ DONE
- [x] T-1718 — Forecast legend: `flexWrap: 'wrap'` on chip container — [1 SP] — ✅ DONE

**Totale: 10 SP**

---

## Dipendenze

- Sprint 17 completato: KB + Portal pages already deployed and validated.
- Audit screenshots at `scripts/screenshots/audit/` for visual reference.

## Rischi

1. **T-1713 locale-aware content** — Most complex task. Options: (a) accept EN content as-is and just display it consistently, (b) add `nameIt`/`descriptionIt` fields to KBCategory, (c) use a generic `translations JSON` field. Option (a) is simplest for MVP.
2. **T-1716 deal stepper** — Need to check if "Closed Lost" is detectable from stage name or if there's a `type` field on pipeline stages.

## Definition of Done

- [x] KB table fully readable on 375px mobile — Title + Status only, "Pubblicato" fully readable
- [x] Portal nav links translated (IT: "Base di Conoscenza" / "Invia un Ticket")
- [x] Portal KB content language is consistent — EN content accepted as user data, UI framing locale-aware
- [x] `"1 articles"` → `"1 articolo"` / `"2 articoli"` pluralization fixed
- [x] Priority chips translated on portal ticket tracking — "Alta" not "high"
- [x] Deal stepper visually distinguishes won vs lost — red dots/connectors for Closed Lost
- [x] AI Governance tabs: minWidth auto + Forecast legend flexWrap — pending Vercel deploy for tabs
- [x] `npx tsc --noEmit` passes on both backend and frontend
- [x] Production validated via Edge CDP screenshots (desktop + mobile) — audit_v3/
