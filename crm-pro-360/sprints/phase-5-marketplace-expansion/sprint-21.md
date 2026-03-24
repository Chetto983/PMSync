# Sprint 21 — Conversation AI & Chatbot

## Fase: Phase 5 — Marketplace & Expansion

## Date: M11-W1 → M11-W2

## Obiettivo Sprint

Implementazione Conversation AI con LangChain agent e accesso diretto ai dati CRM. NLU multilingua (IT/EN/DE/FR/ES) con intent recognition e entity extraction. Chatbot con conversation context management, safety guardrails (PII filter, hallucination detection), output validation pipeline. Human-in-the-loop per operazioni mutanti. UI widget chatbot e pannello di configurazione admin. Target: conversazione end-to-end funzionante con almeno 5 tool CRM.

## Capacità Team

| Story Points | Ruoli |
|---|---|
| 85 SP | 4 AI/ML, 2 Backend, 1 Frontend, 1 QA |

## Sprint Backlog

| # | Task | SP | Ruolo | Stato |
|---|---|---|---|---|
| 1 | T-2101 — LangChain agent setup (ReAct agent, tool binding, structured output, streaming) | 5 | AI/ML | 📋 TODO |
| 2 | T-2102 — CRM tool: read contacts (ricerca contatti per nome, email, company, filtri avanzati) | 4 | AI/ML | 📋 TODO |
| 3 | T-2103 — CRM tool: read deals (pipeline status, valore, owner, date, filtri temporali) | 4 | AI/ML | 📋 TODO |
| 4 | T-2104 — CRM tool: create task (assegnazione, deadline, priorità, collegamento a contatto/deal) | 4 | AI/ML | 📋 TODO |
| 5 | T-2105 — CRM tool: send email (composizione, template, destinatario da contatti, allegati) | 5 | AI/ML | 📋 TODO |
| 6 | T-2106 — CRM tool: read analytics (KPI summary, trend, confronto periodi) | 4 | AI/ML | 📋 TODO |
| 7 | T-2107 — Conversation context management (per-user session, sliding window, summary compaction) | 5 | Backend | 📋 TODO |
| 8 | T-2108 — NLU intent recognition multilingua IT/EN/DE/FR/ES (classificazione intent, confidence score) | 5 | AI/ML | 📋 TODO |
| 9 | T-2109 — Entity extraction per CRM queries (nome contatto, nome azienda, importo, data, stato deal) | 4 | AI/ML | 📋 TODO |
| 10 | T-2110 — Conversation memory persistente (cronologia per utente, PostgreSQL + embedding search) | 4 | Backend | 📋 TODO |
| 11 | T-2111 — Safety guardrails: PII filter (detect e mascheramento SSN, carta credito, IBAN in output) | 4 | AI/ML | 📋 TODO |
| 12 | T-2112 — Safety guardrails: hallucination detection (fact-check contro dati CRM, confidence threshold) | 5 | AI/ML | 📋 TODO |
| 13 | T-2113 — Output validation pipeline (JSON schema validation, sanitizzazione HTML, length limit) | 3 | Backend | 📋 TODO |
| 14 | T-2114 — HITL escalation per mutations (approvazione umana per create/update/delete/send) | 4 | Backend | 📋 TODO |
| 15 | T-2115 — Chatbot UI widget (floating button, chat panel, message bubbles, typing indicator) | 5 | Frontend | 📋 TODO |
| 16 | T-2116 — Conversation history viewer (lista conversazioni, ricerca, dettaglio con timeline) | 4 | Frontend | 📋 TODO |
| 17 | T-2117 — Admin AI configuration panel (model selection, temperature, max tokens, tool enable/disable) | 3 | Frontend | 📋 TODO |
| 18 | T-2118 — Multilingual response generation (risposta nella lingua dell'utente, fallback EN) | 3 | AI/ML | 📋 TODO |
| 19 | T-2119 — Conversation analytics (usage per utente, intent distribution, resolution rate, CSAT) | 4 | Backend | 📋 TODO |
| 20 | T-2120 — Cost tracking per conversation (token usage, model cost, budget alert per tenant) | 3 | Backend | 📋 TODO |
| 21 | T-2121 — Integration tests: conversation flow E2E (intent → tool call → response → HITL → confirm) | 5 | QA | 📋 TODO |

**Totale: 85 SP** (21 item)

## Dipendenze Esterne

- **LangChain** — versione stabile con supporto streaming e structured output, verificare compatibilità con Node.js runtime
- **LLM provider** — Mistral AI o alternativa, API key e rate limiting, budget per token consumption
- **Sprint 19-20** — infrastruttura GA stabile come prerequisito per deploy nuove feature AI
- **pgvector** — estensione PostgreSQL per embedding search nella conversation memory
- **Modello NLU multilingua** — valutare modello dedicato vs LLM general-purpose per intent/entity extraction
- **GDPR/Privacy** — conversation log contengono dati personali, verificare retention policy e data processing agreement

## Rischi Sprint

1. **Hallucination su dati CRM** — l'agent potrebbe inventare dati non presenti nel CRM, causando decisioni errate. Mitigazione: ogni risposta con dati CRM deve essere fact-checked contro query reale, confidence score visibile all'utente, disclaimer su risposte AI-generated.
2. **Latenza conversazione troppo alta** — LLM call + tool execution + validation potrebbe superare 5s per risposta. Mitigazione: streaming response, parallel tool execution dove possibile, cache per query frequenti, timeout con fallback message.
3. **NLU multilingua impreciso** — intent recognition in lingue diverse dall'inglese potrebbe avere accuracy < 80%. Mitigazione: few-shot examples per ogni lingua, evaluation set per lingua, fallback a EN se confidence < threshold, feedback loop per miglioramento continuo.
4. **HITL bottleneck** — troppe richieste di approvazione umana rallentano l'esperienza utente. Mitigazione: approval solo per operazioni ad alto rischio (delete, send email), auto-approve per operazioni read-only e create task, configurable per admin.

## Definition of Done Sprint

1. [ ] Tutti i 21 item hanno stato completato o giustificazione documentata per rinvio
2. [ ] LangChain agent funzionante con almeno 5 CRM tool operativi
3. [ ] Conversazione end-to-end: domanda utente → intent → tool call → risposta in < 5s (p95)
4. [ ] NLU intent recognition accuracy > 85% su test set per IT e EN
5. [ ] Entity extraction accuracy > 80% per nomi contatti, aziende e importi
6. [ ] PII filter blocca SSN, carta credito, IBAN in output con zero false negative
7. [ ] Hallucination detection attivo: ogni dato CRM in risposta è verificato contro query reale
8. [ ] HITL funzionante per create task e send email con UI di approvazione
9. [ ] Chatbot UI widget responsive con conversation history
10. [ ] Admin panel permette configurazione model e tool enable/disable
11. [ ] Cost tracking operativo con alert per budget threshold
12. [ ] Integration tests E2E passano al 100% per tutti i 5 flow principali

## Deliverable Attesi

- LangChain agent con 5 CRM tool (read contacts, read deals, create task, send email, read analytics)
- NLU multilingua (IT/EN/DE/FR/ES) con intent recognition e entity extraction
- Conversation context management con memory persistente
- Safety guardrails: PII filter + hallucination detection + output validation
- HITL escalation per operazioni mutanti
- Chatbot UI widget con conversation history
- Admin AI configuration panel
- Conversation analytics e cost tracking
- Integration tests E2E conversation flow

## Demo/Review Notes

| Campo | Valore |
|---|---|
| **Data Demo** | _da definire_ |
| **Partecipanti** | _da definire_ |
| **Scenario Demo 1** | Conversazione in italiano: "Mostrami i deal aperti sopra 50K€" → agent cerca → risponde con lista |
| **Scenario Demo 2** | HITL flow: "Invia email a Mario Rossi con offerta" → agent compone → richiede approvazione → invio |
| **Scenario Demo 3** | Safety: tentare di far rivelare PII, mostrare che viene mascherato; hallucination detection in azione |
| **Scenario Demo 4** | Admin panel: cambiare model, disabilitare tool, mostrare cost tracking per tenant |
| **Feedback Ricevuto** | _da compilare post-review_ |
| **Action Items** | _da compilare post-review_ |
| **Velocity Effettiva** | ___ SP / 85 SP pianificati |
