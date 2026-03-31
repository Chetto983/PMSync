# AI Features Audit

Comprehensive audit and hardening of all AI functionality in PMSync. Covers backend AI modules, knowledge base/RAG, email intelligence, security guards, frontend components, CRM AI, and observability.

## Scope

| Module | Backend | Frontend | Files | Lines |
|--------|---------|----------|------:|------:|
| AI Core (analysis, triage, embeddings) | `backend/src/modules/ai/` | — | 46 | ~13,000 |
| AI Chat (conversations, tools, RAG) | `backend/src/modules/ai-chat/` | `frontend/src/components/chat/` | ~58 | ~10,700 |
| Email AI (compose, drafts, widgets) | (in ai module) | `frontend/components/email/compose/` | ~8 | ~1,000 |
| Dashboard AI (triage, briefing, follow-ups) | — | `frontend/components/dashboard/widgets/` | ~6 | ~600 |
| Calendar AI (scheduling, time slots) | — | `frontend/components/calendar/ai/` | ~3 | ~783 |
| CRM AI (forecast, governance, NBA, lead score) | `backend/src/modules/crm/` | `frontend/components/dashboard/crm-*/` | ~8 | ~1,300 |
| **Total** | | | **~130** | **~27,400** |

## Structure

```
ai-features-audit/
├── README.md                           # This file
├── docs/
│   ├── 00-AUDIT-FINDINGS.md           # 66 findings (6C, 25H, 25M, 10L)
│   ├── 01-ROADMAP.md                  # Gantt + sprint breakdown
│   └── 02-PRODUCTION-SCORECARD.md     # Before/after scores
└── sprints/
    ├── phase-1-ai-chat-backend/        # S01-S02
    ├── phase-2-knowledge-base-rag/     # S03-S04
    ├── phase-3-email-intelligence/     # S05-S06
    ├── phase-4-ai-security-guards/     # S07
    ├── phase-5-ai-chat-frontend/       # S08-S09
    ├── phase-6-email-ai-frontend/      # S10
    ├── phase-7-crm-ai-frontend/        # S11
    ├── phase-8-observability-cost/     # S12
    └── phase-9-production-validation/  # S13
```

## Sprint Executor

Use `/ai-features-sprint` to run sprints. Auto-advances through S01-S13.

```bash
/ai-features-sprint           # Auto-detect current sprint
/ai-features-sprint S05       # Jump to specific sprint
```

## Baseline Score: 6.5/10

| Severity | Count |
|----------|------:|
| Critical | 6 |
| High | 25 |
| Medium | 25 |
| Low | 10 |
| **Total** | **66** |

Target: >= 9.0/10 after all 13 sprints (~177 SP).
