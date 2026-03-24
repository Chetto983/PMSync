# CRM Pro 360 — Roadmap su PMSync

## Panoramica

CRM Pro 360 è costruito **sopra** PMSync, non lo sostituisce.

- **PMSync fornisce:** email, calendar, contacts, AI chat, auth, multi-tenancy, GDPR, observability
- **CRM Pro 360 aggiunge:** pipeline/deals, lead scoring, forecasting, ticketing, analytics
- **Formato:** solo developer, 18 sprint (~9 mesi), 3 fasi

---

## Cosa PMSync Fornisce Già

| Capability              | Modulo PMSync                  | Status |
|-------------------------|--------------------------------|--------|
| Email sync & threading  | `email`, `email-sync`          | ✅     |
| Calendar events         | `calendar`                     | ✅     |
| Contacts & companies    | `contacts`                     | ✅     |
| AI chat + tool calling  | `ai-chat`                      | ✅     |
| Multi-tenancy           | `tenant`, Prisma RLS           | ✅     |
| Auth (better-auth + JWT)| `auth`                         | ✅     |
| GDPR / data export      | `gdpr`                         | ✅     |
| Observability           | OpenTelemetry, Sentry          | ✅     |
| Label AI triage         | `labels`, `ai-chat/tools`      | ✅     |
| Real-time (Socket.IO)   | `gateway`                      | ✅     |
| Background jobs         | BullMQ                         | ✅     |
| Embeddings / RAG        | pgvector, Mistral AI           | 🟡     |

---

## Cosa CRM Pro 360 Aggiunge

| Capability             | Epic                          | Fase | Sprint  |
|------------------------|-------------------------------|------|---------|
| Account management     | EP-03R Contacts & Accounts    | 1    | S01-S02 |
| Pipeline & deals       | EP-04R Pipeline & Deals       | 1    | S03-S06 |
| Custom fields          | EP-04R Pipeline & Deals       | 1    | S07-S08 |
| Kanban board           | EP-04R Pipeline & Deals       | 1    | S05-S06 |
| Lead scoring (AI)      | EP-08R AI Intelligence        | 2    | S09-S10 |
| Forecasting            | EP-08R AI Intelligence        | 2    | S11-S12 |
| Churn prediction & NBA | EP-08R AI Intelligence        | 2    | S13-S14 |
| Ticketing & SLA        | EP-06R Customer Service       | 3    | S15-S16 |
| Knowledge base         | EP-06R Customer Service       | 3    | S17     |
| CSAT & analytics       | EP-06R Customer Service       | 3    | S18     |

---

## Tech Stack

Identico a PMSync — nessuna dipendenza aggiuntiva.

- **Backend:** NestJS 11, Prisma 7, PostgreSQL 17, Redis, BullMQ, Mistral AI + pgvector
- **Frontend:** Next.js 16, React 19, TanStack Query, Zustand, MUI
- **NO:** Tailwind in components, Kafka, Elasticsearch, FastAPI, React Native

---

## Struttura Directory

```
crm/
├── README.md                          ← questo file
├── docs/
│   ├── 00-BRIDGE-PMSYNC-CRM.md       — Mappatura PMSync → CRM Pro 360
│   └── 01-ROADMAP-SOLO.md            — Roadmap 18 sprint per solo dev
├── epics/
│   ├── EP-03R-contacts-accounts-gaps.md
│   ├── EP-04R-pipeline-deals.md
│   ├── EP-06R-customer-service.md
│   └── EP-08R-ai-intelligence.md
└── sprints/
    ├── phase-1-core-crm/              — Sprint 01-08 (~4 mesi)
    ├── phase-2-intelligence/           — Sprint 09-14 (~3 mesi)
    └── phase-3-service/                — Sprint 15-18 (~2 mesi)
```

---

## Fasi

### Phase 1 — Core CRM (S01-S08, ~4 mesi)
Account model, pipeline stages, deal CRUD, Kanban drag-and-drop, custom fields engine.

### Phase 2 — Intelligence (S09-S14, ~3 mesi)
Lead scoring ML, revenue forecasting, churn prediction, next-best-action (NBA), nuovi AI tools.

### Phase 3 — Service (S15-S18, ~2 mesi)
Ticketing system, SLA tracking, knowledge base con RAG, CSAT surveys e analytics dashboard.

---

## Dove il Codice CRM Vive in PMSync

| Cosa                | Path                                          |
|---------------------|-----------------------------------------------|
| Backend modules     | `backend/src/modules/crm/`                    |
| Frontend pages      | `frontend/src/pages/dashboard/crm/`           |
| Prisma schema       | `backend/prisma/schema.prisma` (esteso)       |
| AI tools            | `backend/src/modules/ai-chat/tools/`          |
| Traduzioni          | `frontend/locales/{en,it}.ts`                 |
| Query hooks         | `frontend/hooks/queries/use-crm-*.ts`         |

---

## Come Navigare Questa Documentazione

1. Parti da `docs/00-BRIDGE-PMSYNC-CRM.md` per capire cosa esiste vs cosa va costruito
2. Leggi `docs/01-ROADMAP-SOLO.md` per la timeline dettagliata
3. Leggi l'epic rilevante per user stories e acceptance criteria
4. Controlla i file sprint per il breakdown concreto dei task

---

## Sprint Velocity

- **Solo dev:** 15-20 story points per sprint (2 settimane)
- **Totale stimato:** ~314 SP su 18 sprint
- **Buffer:** 10% per sprint riservato a bug fix e tech debt

---

## Relazione con `crm-pro-360/`

La directory `crm-pro-360/` contiene il roadmap originale full-scale (36 FTE, 24 sprint).
Questa directory `crm/` è l'adattamento realistico per solo developer.
L'originale serve come riferimento per scaling futuro del team.
