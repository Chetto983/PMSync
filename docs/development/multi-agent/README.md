# 📚 Documentazione Sistema Multi-Agent per MailAgent

## 🎯 Panoramica

Questa cartella contiene la **documentazione completa** per il sistema multi-agente con Human-in-the-Loop (HITL) e Feedback Loop.

Il sistema utilizza:
- **[LangChain](https://python.langchain.com/)** - Framework per orchestrazione agenti
- **[Mistral AI](https://docs.mistral.ai/)** - LLM e embeddings
- **[NestJS](https://docs.nestjs.com/)** - Backend framework
- **[Prisma](https://www.prisma.io/)** - ORM e database management
- **[PostgreSQL + pgvector](https://github.com/pgvector/pgvector)** - Database con vector search

---

## 📂 Struttura Documentazione

### 🗺️ [INDEX.md](./INDEX.md)
**Hub centrale della documentazione** con:
- Indice generale di tutti i documenti
- Link a risorse esterne (papers, tutorial, repository GitHub)
- Quick start guide
- Glossario e acronimi

### 📋 Documenti Principali

| # | Documento | Descrizione | Durata Lettura |
|---|-----------|-------------|----------------|
| 00 | [**ORIGINAL_SPEC.md**](./00_ORIGINAL_SPEC.md) | Specifiche originali del progetto | 5 min |
| 01 | [**ROADMAP_DETTAGLIATA.md**](./01_ROADMAP_DETTAGLIATA.md) | Piano implementazione 7-8 settimane, fase per fase | 30 min |
| 02 | [**FEEDBACK_LOOP_SYSTEM.md**](./02_FEEDBACK_LOOP_SYSTEM.md) | Sistema di apprendimento e memoria storica | 25 min |
| 03 | [**ARCHITECTURE.md**](./03_ARCHITECTURE.md) | Architettura, design patterns, diagrammi | 20 min |
| 04 | [**API_REFERENCE.md**](./04_API_REFERENCE.md) | Documentazione completa API REST | 15 min |
| 05 | **LANGCHAIN_MISTRAL_GUIDE.md** | Guida integrazione LangChain + Mistral | 20 min |
| 06 | **BEST_PRACTICES.md** | Guidelines e raccomandazioni | 15 min |
| 07 | **TESTING_STRATEGY.md** | Strategia testing completa | 15 min |
| 08 | **DEPLOYMENT.md** | Guida deployment produzione | 20 min |
| 09 | **TROUBLESHOOTING.md** | Risoluzione problemi comuni | 10 min |

---

## 🚀 Quick Start

### 1. Setup Iniziale
```bash
# Clone repository
git clone <repo-url>
cd MailAgent/backend

# Installa dipendenze
npm install

# Setup database
cp .env.example .env
# Configura: DATABASE_URL, MISTRAL_API_KEY, etc.

# Esegui migrazioni
npx prisma migrate dev
npx prisma generate
```

### 2. Avvia Backend
```bash
# Development mode
npm run start:dev

# Test API
curl http://localhost:3000/health
```

### 3. Primi Passi
1. Leggi [INDEX.md](./INDEX.md) per overview generale
2. Studia [01_ROADMAP_DETTAGLIATA.md](./01_ROADMAP_DETTAGLIATA.md) per piano implementazione
3. Consulta [03_ARCHITECTURE.md](./03_ARCHITECTURE.md) per capire l'architettura
4. Testa API con [04_API_REFERENCE.md](./04_API_REFERENCE.md)

---

## 📖 Percorsi di Lettura Consigliati

### Per Developer Backend
1. [00_ORIGINAL_SPEC.md](./00_ORIGINAL_SPEC.md) - Capire i requisiti
2. [03_ARCHITECTURE.md](./03_ARCHITECTURE.md) - Architettura sistema
3. [01_ROADMAP_DETTAGLIATA.md](./01_ROADMAP_DETTAGLIATA.md) - Piano sviluppo
4. **LANGCHAIN_MISTRAL_GUIDE.md** - Integrazione LLM
5. **BEST_PRACTICES.md** - Coding standards

### Per DevOps/SRE
1. [INDEX.md](./INDEX.md) - Overview generale
2. [03_ARCHITECTURE.md](./03_ARCHITECTURE.md) - Componenti infrastrutturali
3. **DEPLOYMENT.md** - Deployment in produzione
4. **TROUBLESHOOTING.md** - Monitoring e debugging

### Per Product Manager/Tech Lead
1. [00_ORIGINAL_SPEC.md](./00_ORIGINAL_SPEC.md) - Requisiti business
2. [01_ROADMAP_DETTAGLIATA.md](./01_ROADMAP_DETTAGLIATA.md) - Timeline e milestone
3. [02_FEEDBACK_LOOP_SYSTEM.md](./02_FEEDBACK_LOOP_SYSTEM.md) - Sistema di learning
4. [04_API_REFERENCE.md](./04_API_REFERENCE.md) - Capabilities API

### Per QA/Test Engineer
1. [03_ARCHITECTURE.md](./03_ARCHITECTURE.md) - Componenti da testare
2. **TESTING_STRATEGY.md** - Strategia di test
3. [04_API_REFERENCE.md](./04_API_REFERENCE.md) - Endpoint da validare
4. **TROUBLESHOOTING.md** - Scenari di errore

---

## 🎓 Risorse di Apprendimento

### LangChain
- **[Documentazione Ufficiale](https://python.langchain.com/docs/get_started/introduction)** - Getting started
- **[LangChain Agents](https://python.langchain.com/docs/modules/agents/)** - Agent framework
- **[LangGraph Tutorial](https://blog.langchain.dev/langgraph-multi-agent-workflows/)** - Multi-agent workflows
- **[GitHub Examples](https://github.com/langchain-ai/langgraph/tree/main/examples)** - Code examples

### Mistral AI
- **[API Documentation](https://docs.mistral.ai/api/)** - REST API reference
- **[Embeddings Guide](https://docs.mistral.ai/guides/embeddings/)** - Vector embeddings
- **[Function Calling](https://docs.mistral.ai/guides/function-calling/)** - Tool integration
- **[Mistral Cookbook](https://github.com/mistralai/cookbook)** - Recipes e examples

### NestJS
- **[Official Docs](https://docs.nestjs.com/)** - Framework documentation
- **[Microservices](https://docs.nestjs.com/microservices/basics)** - Distributed systems
- **[Testing](https://docs.nestjs.com/fundamentals/testing)** - Testing guide
- **[Best Practices](https://github.com/nestjs/nest/tree/master/sample)** - Sample projects

### Multi-Agent Systems
- **[AutoGen (Microsoft)](https://github.com/microsoft/autogen)** - Multi-agent framework
- **[CrewAI](https://github.com/joaomdmoura/crewAI)** - Collaborative AI agents
- **[MetaGPT](https://github.com/geekan/MetaGPT)** - Multi-agent collaboration

---

## 🔗 Link Utili

### API & Tools
- **Swagger UI (dev)**: http://localhost:3000/api/docs
- **Prisma Studio**: `npx prisma studio`
- **Health Check**: http://localhost:3000/health
- **Metrics**: http://localhost:3000/metrics (Prometheus)

### Database
- **pgAdmin**: http://localhost:5050
- **Redis Commander**: http://localhost:8081

### Monitoring (Production)
- **Grafana**: https://grafana.mailagent.com
- **Prometheus**: https://prometheus.mailagent.com
- **Sentry**: https://sentry.io/mailagent

---

## 🤝 Contributing

### Workflow
1. Crea branch: `git checkout -b feature/my-feature`
2. Implementa seguendo [**BEST_PRACTICES.md**]
3. Scrivi test (vedi [**TESTING_STRATEGY.md**])
4. Commit: `git commit -m "feat: add feature"`
5. Push e apri Pull Request

### Coding Standards
- **TypeScript strict mode**
- **Prettier** per formatting
- **ESLint** per linting
- **Conventional Commits** per messaggi
- **Test coverage** > 80%

---

## 📞 Support

### Documentazione
- **Wiki**: https://github.com/your-org/mailagent/wiki
- **FAQ**: Vedi [**TROUBLESHOOTING.md**]

### Communication
- **GitHub Issues**: Bug reports e feature requests
- **Discord**: Community chat
- **Email**: support@mailagent.com

---

## 📊 Status Implementazione

### ✅ Completato
- [x] Infrastruttura base NestJS
- [x] Sistema multi-tenancy
- [x] Integrazione Mistral AI
- [x] RAG con pgvector
- [x] Email insights (summary, smart reply)

### 🚧 In Sviluppo (Fase corrente)
- [ ] Sistema multi-agente orchestrato
- [ ] HITL (Human-in-the-Loop)
- [ ] Feedback loop e learning

### 📋 Pianificato
- [ ] Agenti specializzati avanzati
- [ ] Auto-execution intelligente
- [ ] Dashboard analytics
- [ ] Mobile app integration

---

## 📄 Changelog

### v1.0.0 (2025-01-20)
- ✨ Documentazione completa multi-agent
- ✨ Roadmap implementazione 7-8 settimane
- ✨ Sistema feedback loop
- ✨ Architettura dettagliata
- ✨ API reference completa

---

## 📜 License

MIT License - vedi [../../LICENSE](../../LICENSE)

---

**Ultimo aggiornamento**: 2025-11-20
**Versione documentazione**: 1.0.0
**Maintainer**: MailAgent Team

---

## 📚 Indice Documenti per Riferimento Rapido

```
docs/development/multi-agent/
├── README.md                       ← Questo file
├── INDEX.md                        ← Hub centrale + link esterni
├── 00_ORIGINAL_SPEC.md            ← Spec originali
├── 01_ROADMAP_DETTAGLIATA.md      ← Piano 7-8 settimane
├── 02_FEEDBACK_LOOP_SYSTEM.md     ← Sistema learning
├── 03_ARCHITECTURE.md             ← Design & patterns
├── 04_API_REFERENCE.md            ← API REST docs
├── 05_LANGCHAIN_MISTRAL_GUIDE.md  ← Integrazione LLM
├── 06_BEST_PRACTICES.md           ← Guidelines
├── 07_TESTING_STRATEGY.md         ← Test strategy
├── 08_DEPLOYMENT.md               ← Deploy guide
└── 09_TROUBLESHOOTING.md          ← Problem solving
```

---

**Buona lettura! 🚀**

Per domande o suggerimenti sulla documentazione, apri una issue su GitHub o contatta il team su Discord.

## External References (planning)
- LangChain agents: https://python.langchain.com/docs/modules/agents/
- LangGraph multi-agent workflows: https://blog.langchain.dev/langgraph-multi-agent-workflows/
- AutoGen multi-agent patterns: https://microsoft.github.io/autogen/
- HITL overview: https://aws.amazon.com/what-is/human-in-the-loop/
- RAG with Postgres/pgvector: https://pgdash.io/blog/rag-with-postgresql.html
- Proactive assistant patterns: https://blog.langchain.dev/plan-and-execute-agents/; https://python.langchain.com/docs/use_cases/agent_simulations/meeting_scheduler
- TypeScript/NestJS/langchainjs: https://docs.nestjs.com/; https://docs.nestjs.com/recipes/prisma; https://js.langchain.com/docs
- UI/UX references: https://mui.com/material-ui/; https://mui.com/x/react-data-grid/; https://notistack.com/; https://www.nngroup.com/articles/dialog-design/
- Intelligent Secretary UI plan: [INTELLIGENT_SECRETARY_UI_PLAN.md](./INTELLIGENT_SECRETARY_UI_PLAN.md)
