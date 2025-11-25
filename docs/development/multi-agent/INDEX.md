# 📚 Sistema Multi-Agent con HITL e Feedback Loop - Documentazione Completa

## 📋 Indice Generale

### 📖 Documenti Principali
1. [**Roadmap Dettagliata**](./01_ROADMAP_DETTAGLIATA.md) - Piano di implementazione completo (7-8 settimane)
2. [**Sistema Feedback Loop**](./02_FEEDBACK_LOOP_SYSTEM.md) - Memoria storica e apprendimento continuo
3. [**Architettura e Design**](./03_ARCHITECTURE.md) - Diagrammi e pattern architetturali
4. [**API Reference**](./04_API_REFERENCE.md) - Documentazione completa API REST
5. [**Best Practices**](./05_BEST_PRACTICES.md) - Guidelines e raccomandazioni
6. [**Testing Strategy**](./06_TESTING_STRATEGY.md) - Strategia di test completa
7. [**Deployment Guide**](./07_DEPLOYMENT.md) - Guida al deployment in produzione
8. [**Troubleshooting**](./08_TROUBLESHOOTING.md) - Risoluzione problemi comuni

---

## 🌐 Risorse Esterne e Riferimenti

### 📚 Multi-Agent Systems

#### Papers Accademici
- **[LangGraph: Multi-Agent Workflows](https://blog.langchain.dev/langgraph-multi-agent-workflows/)** - Framework per orchestrazione agenti
- **[AutoGPT: Autonomous Agents](https://github.com/Significant-Gravitas/AutoGPT)** - Esempio di agenti autonomi
- **[MetaGPT: Multi-Agent Framework](https://github.com/geekan/MetaGPT)** - Sistema multi-agente con roles
- **[Intelligent Secretary UI Plan](./INTELLIGENT_SECRETARY_UI_PLAN.md)** - Piano UI/UX per esporre multi-agent + HITL nel frontend

## Percorsi di Lettura (per ruolo)
- Backend: README → 00_ORIGINAL_SPEC → 03_ARCHITECTURE → 01_ROADMAP_DETTAGLIATA → 04_API_REFERENCE → 05_LANGCHAIN_MISTRAL_GUIDE.
- Frontend: README → INTELLIGENT_SECRETARY_UI_PLAN → 01_ROADMAP_DETTAGLIATA (frontend rollout) → 04_API_REFERENCE (HITL/APIs).
- QA: 03_ARCHITECTURE → 04_API_REFERENCE → 07_TESTING_STRATEGY.
- Product/Lead: README → INDEX → 01_ROADMAP_DETTAGLIATA → INTELLIGENT_SECRETARY_UI_PLAN.

#### Blog e Tutorial
- **[Building Multi-Agent Systems with LangChain](https://python.langchain.com/docs/use_cases/agent_workflows/)** - Documentazione ufficiale LangChain
- **[AWS Multi-Agent Architecture](https://aws.amazon.com/blogs/machine-learning/multi-agent-orchestration/)** - Best practices AWS
- **[Google Cloud AI Agents](https://cloud.google.com/blog/products/ai-machine-learning/how-to-build-ai-agents)** - Guida Google Cloud

#### Repository GitHub
- **[LangChain Multi-Agent Examples](https://github.com/langchain-ai/langgraph/tree/main/examples/multi_agent)** - Esempi pratici
- **[CrewAI](https://github.com/joaomdmoura/crewAI)** - Framework multi-agent cooperativo
- **[AutoGen (Microsoft)](https://github.com/microsoft/autogen)** - Framework multi-agent Microsoft

---

### 🤝 Human-in-the-Loop (HITL)

#### Articoli e Guide
- **[HITL Machine Learning](https://aws.amazon.com/what-is/human-in-the-loop/)** - Introduzione AWS
- **[Human-in-the-Loop Design Patterns](https://www.microsoft.com/en-us/research/publication/human-in-the-loop-machine-learning/)** - Microsoft Research
- **[HITL Best Practices](https://neptune.ai/blog/human-in-the-loop-machine-learning)** - Neptune.ai guide

#### Strumenti e Piattaforme
- **[Label Studio](https://github.com/heartexlabs/label-studio)** - HITL annotation tool
- **[Prodigy](https://prodi.gy/)** - Active learning HITL tool
- **[AWS SageMaker Ground Truth](https://aws.amazon.com/sagemaker/groundtruth/)** - HITL labeling service

---

### 🔄 Feedback Loop & Reinforcement Learning

#### Papers
- **[RLHF (Reinforcement Learning from Human Feedback)](https://arxiv.org/abs/2203.02155)** - Paper fondamentale
- **[Learning from Human Preferences](https://openai.com/research/learning-from-human-preferences)** - OpenAI research
- **[Reward Modeling for Language](https://arxiv.org/abs/2009.01325)** - Reward models

#### Tutorial Pratici
- **[RLHF Implementation Guide](https://huggingface.co/blog/rlhf)** - HuggingFace tutorial
- **[Building Feedback Loops](https://medium.com/towards-data-science/building-feedback-loops-in-ml-systems-64a2f7867f67)** - Medium article
- **[Active Learning Tutorial](https://modal-python.readthedocs.io/en/latest/content/overview/active_learning.html)** - Active learning basics

---

### 🏗️ NestJS & Architecture

#### Documentazione Ufficiale
- **[NestJS Modules](https://docs.nestjs.com/modules)** - Architettura modulare
- **[NestJS Guards](https://docs.nestjs.com/guards)** - Autenticazione e autorizzazione
- **[NestJS Interceptors](https://docs.nestjs.com/interceptors)** - Middleware pattern

#### Best Practices
- **[NestJS Best Practices](https://github.com/nestjs/nest/tree/master/sample)** - Repository ufficiale esempi
- **[Enterprise NestJS Architecture](https://dev.to/thisdotmedia/enterprise-nestjs-application-architecture-best-practices-1eoi)** - Architettura enterprise
- **[Microservices with NestJS](https://docs.nestjs.com/microservices/basics)** - Pattern microservizi

---

### 🗄️ Database & Prisma

#### Prisma Guide
- **[Prisma Multi-tenancy](https://www.prisma.io/docs/guides/database/multi-tenancy)** - Pattern multi-tenant
- **[Prisma Performance](https://www.prisma.io/docs/guides/performance-and-optimization)** - Ottimizzazione query
- **[Prisma Migrations](https://www.prisma.io/docs/concepts/components/prisma-migrate)** - Gestione migrazioni

#### PostgreSQL & pgvector
- **[pgvector Extension](https://github.com/pgvector/pgvector)** - Vector similarity search
- **[PostgreSQL Full Text Search](https://www.postgresql.org/docs/current/textsearch.html)** - FTS nativo
- **[Postgres Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)** - Ottimizzazione

---

### 🤖 AI & LLM Integration

#### Mistral AI
- **[Mistral API Docs](https://docs.mistral.ai/api/)** - Documentazione ufficiale
- **[Mistral Embeddings](https://docs.mistral.ai/guides/embeddings/)** - Vector embeddings
- **[Mistral Function Calling](https://docs.mistral.ai/guides/function-calling/)** - Tool/function calling

#### LangChain Integration
- **[LangChain Agents](https://python.langchain.com/docs/modules/agents/)** - Agent framework
- **[LangChain Tools](https://python.langchain.com/docs/modules/agents/tools/)** - Custom tools
- **[LangChain Memory](https://python.langchain.com/docs/modules/memory/)** - Conversational memory

#### RAG (Retrieval Augmented Generation)
- **[RAG Overview](https://www.pinecone.io/learn/retrieval-augmented-generation/)** - Introduzione RAG
- **[Building RAG Applications](https://python.langchain.com/docs/use_cases/question_answering/)** - LangChain RAG guide
- **[Advanced RAG Techniques](https://blog.llamaindex.ai/advanced-rag-techniques-an-illustrated-overview-04d193d8fec6)** - LlamaIndex advanced

---

## 🎯 Quick Start Guide

### 1. Prerequisiti
```bash
# Node.js 18+
node --version

# PostgreSQL 14+ con pgvector
psql --version

# Redis (per caching)
redis-cli --version

# Prisma CLI
npm install -g prisma
```

### 2. Setup Progetto
```bash
# Clone repository
git clone <repo-url>
cd MailAgent

# Installa dipendenze
cd backend
npm install

# Setup database
cp .env.example .env
# Configura DATABASE_URL, MISTRAL_API_KEY, etc.

# Esegui migrazioni
npx prisma migrate dev
npx prisma generate
```

### 3. Esegui Backend
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod

# Test API
curl http://localhost:3000/health
```

---

## 📊 Architettura Overview

### Diagramma High-Level

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Email UI │  │ Chat AI  │  │ Calendar │  │ HITL Dashboard │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (NestJS)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            AiMultiAgentController                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            MultiAgentService (Orchestrator)              │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │              │              │              │           │
│         ▼              ▼              ▼              ▼           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Router   │  │  Email   │  │ Calendar │  │  Knowledge   │   │
│  │ Agent    │  │  Agent   │  │  Agent   │  │  Agent       │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               HitlService (Approval Flow)                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           FeedbackService (Learning Loop)                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   PrismaService                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               PostgreSQL + pgvector + Redis                      │
│  ┌────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │   Emails   │  │  AgentPending    │  │  Learning        │    │
│  │   Users    │  │  Actions         │  │  Profiles        │    │
│  │   Tenants  │  │  Feedback        │  │  Embeddings      │    │
│  └────────────┘  └──────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   Mistral AI     │
                    │   (LLM + RAG)    │
                    └──────────────────┘
```

---

## 🔐 Security & Compliance

### Multi-tenancy Isolation
- **Row-Level Security**: Ogni query filtrata per `tenantId`
- **JWT Guards**: Autenticazione e autorizzazione
- **Tenant Guards**: Validazione tenant context
- **Audit Logging**: Tracciamento completo azioni

### Data Privacy
- **GDPR Compliance**: Diritto all'oblio, export dati
- **Encryption**: Token e password crittografati (AES-256)
- **Rate Limiting**: Protezione da abuse
- **Input Validation**: Sanitizzazione input utente

### Riferimenti
- **[OWASP Top 10](https://owasp.org/www-project-top-ten/)** - Security best practices
- **[NestJS Security](https://docs.nestjs.com/security/authentication)** - Autenticazione NestJS
- **[GDPR Compliance Guide](https://gdpr.eu/checklist/)** - Checklist GDPR

---

## 📈 Monitoring & Observability

### Logging
```typescript
// Structured logging con Winston
logger.log('Agent execution', {
  agentName: 'EmailAgent',
  actionType: 'SEND_EMAIL',
  confidence: 0.85,
  tenantId: 'xxx',
  userId: 'yyy',
  duration: 250
});
```

### Metrics (Prometheus)
```typescript
// Custom metrics
agentExecutionDuration.observe({ agent: 'EmailAgent' }, duration);
hitlApprovalRate.set({ actionType: 'SEND_EMAIL' }, approvalRate);
confidenceBoost.set({ agent: 'EmailAgent' }, boost);
```

### Tracing (OpenTelemetry)
- **Distributed tracing**: End-to-end request flow
- **Span tracking**: Agent execution steps
- **Performance profiling**: Bottleneck identification

### Riferimenti
- **[Prometheus + Grafana](https://prometheus.io/docs/visualization/grafana/)** - Monitoring stack
- **[OpenTelemetry NestJS](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/)** - Tracing setup
- **[ELK Stack](https://www.elastic.co/what-is/elk-stack)** - Log aggregation

---

## 🧪 Testing Strategy

### Tipi di Test

#### 1. Unit Tests
```typescript
// Agent unit test
describe('EmailAgent', () => {
  it('should generate smart reply', async () => {
    const result = await emailAgent.handle(context);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('SEND_EMAIL');
  });
});
```

#### 2. Integration Tests
```typescript
// Multi-agent flow test
it('should route email request to EmailAgent', async () => {
  const session = await multiAgentService.createSession(tenantId, userId);
  const result = await multiAgentService.processMessage({
    sessionId: session.id,
    message: 'Reply to john@example.com'
  });
  expect(result.messages).toContain('EmailAgent');
});
```

#### 3. E2E Tests
```typescript
// Full API test
it('POST /ai/multi-agent/message', () => {
  return request(app.getHttpServer())
    .post('/ai/multi-agent/message')
    .set('Authorization', `Bearer ${token}`)
    .send({ sessionId, message: 'Test' })
    .expect(200);
});
```

### Coverage Goals
- **Unit**: > 80%
- **Integration**: > 70%
- **E2E**: Critical paths

### Riferimenti
- **[Jest Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)** - Testing guide
- **[NestJS Testing](https://docs.nestjs.com/fundamentals/testing)** - Framework testing
- **[Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)** - Martin Fowler guide

---

## 🚀 Performance Optimization

### Database
- **Indexing**: Ottimizzazione query con indici
- **Connection pooling**: Prisma connection pool
- **Query optimization**: Prisma query batching
- **Caching**: Redis per query frequenti

### API
- **Response caching**: Cache layer con TTL
- **Pagination**: Limite risultati API
- **Rate limiting**: Throttling richieste
- **Compression**: gzip/brotli

### AI/LLM
- **Prompt caching**: Cache risultati LLM
- **Embedding batching**: Bulk embeddings
- **Vector search optimization**: pgvector HNSW index
- **Model selection**: Modelli più leggeri per task semplici

### Riferimenti
- **[Database Performance](https://use-the-index-luke.com/)** - SQL performance guide
- **[NestJS Performance](https://docs.nestjs.com/techniques/performance)** - Framework optimization
- **[LangChain Optimization](https://python.langchain.com/docs/guides/productionization/)** - LLM optimization

---

## 📦 Deployment

### Docker
```dockerfile
# Dockerfile backend
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mailagent
      - MISTRAL_API_KEY=${MISTRAL_API_KEY}
    depends_on:
      - db
      - redis

  db:
    image: pgvector/pgvector:pg15
    environment:
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
```

### Kubernetes (Helm)
```yaml
# values.yaml
replicaCount: 3
image:
  repository: mailagent/backend
  tag: "1.0.0"
resources:
  limits:
    cpu: 1000m
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 1Gi
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

### Riferimenti
- **[Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)** - Docker guidelines
- **[Kubernetes Patterns](https://kubernetes.io/docs/concepts/cluster-administration/manage-deployment/)** - K8s deployment
- **[NestJS Microservices](https://docs.nestjs.com/microservices/basics)** - Distributed architecture

---

## 🤝 Contributing

### Development Workflow
1. Crea branch da `main`: `git checkout -b feature/my-feature`
2. Implementa feature seguendo coding standards
3. Scrivi test (unit + integration)
4. Esegui linter: `npm run lint`
5. Commit con conventional commits: `feat: add new agent`
6. Push e apri Pull Request
7. Code review e merge

### Coding Standards
- **TypeScript**: Strict mode, no `any`
- **Naming**: camelCase (variabili), PascalCase (classi)
- **Comments**: JSDoc per metodi pubblici
- **Error handling**: Try-catch con logging
- **Formatting**: Prettier

### Riferimenti
- **[Conventional Commits](https://www.conventionalcommits.org/)** - Commit message format
- **[TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)** - Google style guide
- **[Git Best Practices](https://www.conventionalcommits.org/)** - Git workflow

---

## 📞 Support & Community

### Documentation
- **[API Docs](http://localhost:3000/api/docs)** - Swagger/OpenAPI (dev)
- **[Wiki](https://github.com/your-org/mailagent/wiki)** - Internal wiki
- **[FAQ](./FAQ.md)** - Domande frequenti

### Communication
- **GitHub Issues**: Bug reports e feature requests
- **Discord**: Community chat
- **Email**: support@mailagent.com

---

## 📄 License

MIT License - vedi [LICENSE](../../LICENSE) file

---

## 📚 Appendici

### A. Glossary
- **Agent**: Modulo AI specializzato per un dominio specifico
- **HITL**: Human-in-the-Loop, approvazione manuale azioni
- **RAG**: Retrieval Augmented Generation, context-aware AI
- **Confidence**: Score 0-1 che indica certezza dell'agente
- **Feedback Loop**: Sistema di apprendimento da decisioni passate

### B. Acronyms
- **AI**: Artificial Intelligence
- **API**: Application Programming Interface
- **CRUD**: Create Read Update Delete
- **DB**: Database
- **DTO**: Data Transfer Object
- **E2E**: End-to-End
- **JWT**: JSON Web Token
- **LLM**: Large Language Model
- **MVP**: Minimum Viable Product
- **ORM**: Object Relational Mapping
- **RBAC**: Role-Based Access Control
- **REST**: Representational State Transfer
- **SaaS**: Software as a Service
- **SQL**: Structured Query Language
- **TDD**: Test-Driven Development
- **UI**: User Interface
- **UX**: User Experience

### C. Version History
- **v1.0.0** (2025-01-20): Implementazione iniziale multi-agent
- **v1.1.0** (2025-02-15): Aggiunto sistema HITL
- **v1.2.0** (2025-03-10): Feedback loop e learning
- **v2.0.0** (2025-04-01): Produzione-ready release

---

**Ultimo aggiornamento**: 2025-11-20
**Versione documentazione**: 1.0.0
**Maintainer**: MailAgent Team

## External References (planning)
- LangChain agents: https://python.langchain.com/docs/modules/agents/
- LangGraph multi-agent workflows: https://blog.langchain.dev/langgraph-multi-agent-workflows/
- AutoGen multi-agent: https://microsoft.github.io/autogen/
- HITL overview: https://aws.amazon.com/what-is/human-in-the-loop/
- RAG with Postgres/pgvector: https://pgdash.io/blog/rag-with-postgresql.html


- Proactive assistant patterns: https://blog.langchain.dev/plan-and-execute-agents/; https://python.langchain.com/docs/use_cases/agent_simulations/meeting_scheduler
