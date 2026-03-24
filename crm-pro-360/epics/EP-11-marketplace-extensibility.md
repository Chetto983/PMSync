# Epic EP-11: Marketplace & Extensibility

## Metadata

| Campo | Valore |
|-------|--------|
| **Epic ID** | EP-11 |
| **Titolo** | Marketplace & Extensibility |
| **Persona** | Chiara (CTO) |
| **Fase** | 3-5 (Sprint 18 architettura v1, Sprint 23 marketplace completo) |
| **Story Points Totali** | ~89 SP |
| **Stato** | Draft |
| **Data Creazione** | 2026-03-24 |

---

## Overview

Architettura plugin system con sandbox isolato (V8 isolates), processo di certificazione app, developer portal con documentazione e SDK, app listing e discovery con search e categorie, billing integration per app a pagamento (revenue share 70/30), sandbox environment per testing, documentazione completa per sviluppatori terzi.

L'obiettivo finale e' trasformare CRM Pro 360 in una piattaforma aperta dove sviluppatori terzi possano estendere le funzionalita' core senza compromettere sicurezza, stabilita' o performance del sistema principale.

---

## User Stories

### US-128: Plugin System con Lifecycle Management

**Come** Chiara (CTO), **voglio** un plugin system con gestione completa del lifecycle (install/enable/disable/uninstall), **in modo da** permettere l'estensione modulare della piattaforma senza modificare il core.

**Story Points:** 13
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 18
**Dipendenze:** Nessuna (fondazione)

**Criteri di Accettazione:**

```gherkin
Given un plugin valido in formato .crmpkg
When l'amministratore avvia l'installazione dal pannello admin
Then il sistema valida il manifest, estrae i file, registra il plugin nel database
  And lo stato iniziale e' "installed" (non attivo)

Given un plugin installato con stato "installed" o "disabled"
When l'amministratore clicca "Enable"
Then il sistema esegue l'hook onActivate del plugin
  And lo stato diventa "enabled"
  And le extension points del plugin diventano attive nell'applicazione

Given un plugin con stato "enabled"
When l'amministratore clicca "Disable"
Then il sistema esegue l'hook onDeactivate
  And lo stato diventa "disabled"
  And tutte le extension points vengono rimosse senza side-effect

Given un plugin con stato "disabled"
When l'amministratore clicca "Uninstall"
Then il sistema esegue l'hook onUninstall
  And rimuove tutti i file, dati e registrazioni dal database
  And notifica l'utente del completamento

Given un plugin con stato "enabled"
When l'amministratore tenta l'uninstall diretto
Then il sistema mostra un errore: "Disabilitare il plugin prima di disinstallarlo"

Given un plugin con dipendenze da altri plugin
When l'amministratore tenta di disabilitare un plugin da cui altri dipendono
Then il sistema mostra la lista dei plugin dipendenti
  And richiede conferma per la disabilitazione a cascata
```

---

### US-129: Sandbox Isolato per Esecuzione Plugin (V8 Isolates)

**Come** Chiara (CTO), **voglio** che ogni plugin venga eseguito in un sandbox V8 isolato, **in modo da** garantire che un plugin malfunzionante o malevolo non possa compromettere il sistema principale.

**Story Points:** 13
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 18
**Dipendenze:** US-128

**Criteri di Accettazione:**

```gherkin
Given un plugin attivo
When il plugin viene eseguito
Then l'esecuzione avviene in un V8 isolate dedicato
  And il plugin non ha accesso diretto al filesystem del server
  And il plugin non ha accesso diretto al database
  And il plugin comunica col sistema solo tramite API bridge

Given un plugin in esecuzione
When il plugin supera il limite di CPU (500ms per singola esecuzione)
Then l'isolate viene terminato
  And il sistema logga un warning con dettagli del plugin
  And il plugin viene messo in stato "throttled"

Given un plugin in esecuzione
When il plugin supera il limite di memoria (128MB heap)
Then l'isolate viene terminato con OOM
  And il plugin viene disabilitato automaticamente
  And l'amministratore riceve una notifica

Given un plugin che tenta di accedere a risorse non dichiarate nel manifest
When la chiamata viene intercettata dal security layer
Then la richiesta viene rifiutata con errore "PermissionDenied"
  And l'evento viene registrato nell'audit log

Given 50 plugin attivi contemporaneamente
When tutti eseguono operazioni simultanee
Then il sistema mantiene latenza sotto i 100ms per le API core
  And il pool di isolate scala dinamicamente
```

---

### US-130: Processo Certificazione App

**Come** Chiara (CTO), **voglio** un processo di certificazione app con review automatica e manuale, **in modo da** garantire qualita', sicurezza e compatibilita' di ogni app pubblicata nel marketplace.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 20
**Dipendenze:** US-128, US-129

**Criteri di Accettazione:**

```gherkin
Given uno sviluppatore che invia un plugin per la certificazione
When il sistema riceve il pacchetto .crmpkg
Then avvia automaticamente la checklist di review:
  - Validazione manifest (schema JSON valido)
  - Scan vulnerabilita' (dipendenze con CVE note)
  - Analisi statica del codice (pattern pericolosi: eval, Function constructor)
  - Test dei permessi dichiarati vs permessi effettivamente usati
  - Verifica limiti di risorse (memoria, CPU, network)
  And genera un report con punteggio 0-100

Given un plugin con punteggio automatico >= 70
When il report automatico e' completato
Then il plugin viene inoltrato alla coda di review manuale
  And un reviewer riceve notifica con il report automatico allegato

Given un plugin con punteggio automatico < 70
When il report automatico e' completato
Then il plugin viene rifiutato automaticamente
  And lo sviluppatore riceve feedback dettagliato sui problemi trovati

Given un reviewer che ha completato la review manuale
When approva il plugin
Then il plugin riceve il badge "Certified"
  And diventa disponibile nel marketplace pubblico

Given un reviewer che rifiuta il plugin
When fornisce motivazione
Then lo sviluppatore riceve email con motivi del rifiuto
  And puo' risottomettere dopo aver corretto i problemi
```

---

### US-131: Developer Portal con Registrazione e API Key Management

**Come** Chiara (CTO), **voglio** un developer portal dove gli sviluppatori terzi possano registrarsi, gestire le API key e accedere alla documentazione, **in modo da** abilitare un ecosistema di sviluppatori attorno alla piattaforma.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 19
**Dipendenze:** US-128

**Criteri di Accettazione:**

```gherkin
Given uno sviluppatore esterno
When accede al developer portal e compila il form di registrazione
Then il sistema crea un account developer
  And invia email di verifica
  And dopo la verifica, l'account e' attivo con piano "Free"

Given uno sviluppatore registrato
When accede alla sezione "API Keys"
Then puo' generare fino a 5 API key per ambiente (dev, staging, production)
  And ogni key mostra data di creazione, ultimo utilizzo, e permessi

Given uno sviluppatore che genera una nuova API key
When il sistema crea la key
Then la key completa viene mostrata una sola volta
  And successivamente solo gli ultimi 4 caratteri sono visibili
  And la key ha una scadenza configurabile (default: 1 anno)

Given uno sviluppatore con API key attiva
When revoca una key
Then la key diventa immediatamente invalida
  And tutte le richieste in corso con quella key ricevono 401

Given uno sviluppatore registrato
When accede alla sezione documentazione
Then visualizza API reference generata da OpenAPI spec
  And ha accesso a guide Getting Started, tutorial, e code examples
  And puo' provare le API direttamente dalla console interattiva
```

---

### US-132: App Listing e Discovery

**Come** Chiara (CTO), **voglio** una sezione marketplace con ricerca, categorie e rating, **in modo da** permettere agli utenti di scoprire e valutare le app disponibili.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 21
**Dipendenze:** US-130

**Criteri di Accettazione:**

```gherkin
Given un utente che accede al marketplace
When visualizza la pagina principale
Then vede le sezioni: "In Evidenza", "Piu' Popolari", "Aggiunte di Recente"
  And ogni app mostra: icona, nome, descrizione breve, rating, numero installazioni

Given un utente che cerca un'app
When digita un termine nella barra di ricerca
Then i risultati vengono filtrati in tempo reale (debounce 300ms)
  And la ricerca copre: nome, descrizione, tag, nome sviluppatore
  And i risultati sono ordinati per rilevanza (full-text search con ranking)

Given un utente che naviga per categoria
When seleziona una categoria (es. "Produttivita'", "Integrazioni", "Analytics")
Then vede tutte le app certificate in quella categoria
  And puo' ordinare per: rating, popolarita', data pubblicazione, prezzo

Given un utente che visualizza il dettaglio di un'app
When clicca su un'app
Then vede: descrizione completa, screenshot, changelog, rating e recensioni
  And vede: requisiti di sistema, permessi richiesti, prezzo
  And puo' installare/acquistare direttamente dalla pagina dettaglio

Given un utente che ha installato un'app
When torna alla pagina dell'app nel marketplace
Then puo' lasciare una recensione (1-5 stelle + testo)
  And puo' segnalare problemi direttamente allo sviluppatore
```

---

### US-133: Billing Integration per App a Pagamento

**Come** Chiara (CTO), **voglio** un sistema di billing integrato per le app a pagamento con revenue share 70/30, **in modo da** monetizzare l'ecosistema e incentivare gli sviluppatori.

**Story Points:** 13
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 22
**Dipendenze:** US-131, US-132

**Criteri di Accettazione:**

```gherkin
Given uno sviluppatore che pubblica un'app a pagamento
When configura il prezzo nel developer portal
Then puo' scegliere tra modelli: una tantum, abbonamento mensile/annuale, freemium
  And il prezzo minimo e' 0.99 EUR
  And il sistema mostra l'anteprima della revenue share (70% sviluppatore, 30% piattaforma)

Given un utente che acquista un'app a pagamento
When clicca "Acquista" e completa il checkout (Stripe)
Then il pagamento viene processato via Stripe Connect
  And l'app viene installata automaticamente
  And lo sviluppatore riceve il 70% del netto (dopo commissioni Stripe)
  And viene emessa fattura/ricevuta all'acquirente

Given uno sviluppatore con app a pagamento attive
When accede alla dashboard finanze nel developer portal
Then vede: revenue totale, revenue per app, trend mensile
  And vede lo stato dei payout (pendenti, completati)
  And puo' configurare i dati bancari per il payout

Given un utente con abbonamento a un'app
When annulla l'abbonamento
Then l'app resta attiva fino alla fine del periodo pagato
  And alla scadenza viene disabilitata automaticamente
  And i dati creati dal plugin vengono mantenuti per 90 giorni

Given un refund request da parte di un utente
When la richiesta viene inoltrata entro 14 giorni dall'acquisto
Then il sistema processa il rimborso automaticamente via Stripe
  And la revenue share viene ricalcolata per lo sviluppatore
```

---

### US-134: Sandbox Environment per Testing Plugin

**Come** Chiara (CTO), **voglio** un ambiente sandbox per il testing dei plugin, **in modo da** permettere agli sviluppatori di testare senza rischi per i dati di produzione.

**Story Points:** 5
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 19
**Dipendenze:** US-128, US-129

**Criteri di Accettazione:**

```gherkin
Given uno sviluppatore registrato nel developer portal
When crea un nuovo sandbox environment
Then il sistema provisiona un'istanza isolata con dati di esempio
  And il sandbox ha un URL dedicato (sandbox-{id}.crmpro360.dev)
  And l'istanza ha limiti: 1GB storage, 512MB RAM, TTL 72 ore

Given uno sviluppatore con sandbox attivo
When carica un plugin nel sandbox
Then il plugin viene installato e attivato nell'ambiente di test
  And lo sviluppatore puo' interagire con tutte le API come utente admin
  And tutte le operazioni sono loggate per debugging

Given un sandbox attivo da piu' di 72 ore
When il TTL scade
Then il sistema invia notifica 1 ora prima della scadenza
  And allo scadere, il sandbox viene eliminato
  And lo sviluppatore puo' crearne uno nuovo immediatamente

Given uno sviluppatore che testa un plugin nel sandbox
When il plugin genera errori
Then i log dettagliati sono visibili nella console del developer portal
  And include stack trace, request/response, e stato dell'isolate
```

---

### US-135: SDK per Sviluppatori

**Come** Chiara (CTO), **voglio** un SDK completo per sviluppatori con hooks, UI extension points e API client, **in modo da** ridurre la barriera d'ingresso e standardizzare lo sviluppo di plugin.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 19-20
**Dipendenze:** US-128, US-129

**Criteri di Accettazione:**

```gherkin
Given uno sviluppatore che installa l'SDK via npm
When esegue `npm install @crmpro360/plugin-sdk`
Then ha accesso a:
  - TypeScript types per tutte le API
  - API client con auto-discovery degli endpoint
  - Hook system (onEvent, beforeAction, afterAction)
  - UI component library per extension points
  - CLI tool per scaffold, build, test, package

Given uno sviluppatore che usa gli hooks dell'SDK
When registra un handler per l'evento "contact.created"
Then l'handler viene invocato ogni volta che un contatto viene creato
  And riceve il payload tipizzato dell'evento
  And puo' modificare il flusso (preventAction) o aggiungere side-effects

Given uno sviluppatore che usa UI extension points
When dichiara un widget per lo slot "contact-detail-sidebar"
Then il widget appare nella sidebar del dettaglio contatto
  And ha accesso al contesto (dati del contatto corrente)
  And puo' usare i componenti UI del design system della piattaforma

Given uno sviluppatore che usa la CLI
When esegue `crmpro360 plugin init my-plugin`
Then viene generato un progetto scaffold con:
  - manifest.json pre-configurato
  - Struttura directory standard (src/, tests/, assets/)
  - TypeScript config con i types dell'SDK
  - Script di build e package

Given uno sviluppatore che esegue `crmpro360 plugin test`
When il comando viene eseguito
Then avvia un mini-environment locale con mock delle API
  And esegue i test unitari del plugin
  And valida il manifest contro lo schema corrente
```

---

### US-136: App Analytics Dashboard per Sviluppatori

**Come** Chiara (CTO), **voglio** una dashboard analytics nel developer portal, **in modo da** permettere agli sviluppatori di monitorare l'adozione e le performance delle loro app.

**Story Points:** 5
**Priorita:** 🟢 Bassa
**Sprint Target:** Sprint 23
**Dipendenze:** US-132, US-133

**Criteri di Accettazione:**

```gherkin
Given uno sviluppatore con almeno un'app pubblicata
When accede alla sezione Analytics del developer portal
Then vede per ogni app:
  - Installazioni totali e trend (daily/weekly/monthly)
  - Utenti attivi (DAU, WAU, MAU)
  - Rating medio e distribuzione
  - Revenue (se app a pagamento)

Given uno sviluppatore che analizza le performance
When seleziona il tab "Performance"
Then vede metriche di runtime:
  - Tempo medio di esecuzione per hook
  - Numero di errori e tasso di errore
  - Consumo medio di memoria e CPU
  - Chiamate API per minuto

Given uno sviluppatore che esporta i dati
When clicca "Esporta CSV" su qualsiasi grafico
Then il sistema genera un CSV con i dati del periodo selezionato
  And il download si avvia automaticamente

Given uno sviluppatore che configura alert
When imposta una soglia (es. error rate > 5%)
Then riceve notifica via email quando la soglia viene superata
  And il grafico mostra la soglia come linea di riferimento
```

---

### US-137: Template App di Esempio

**Come** Chiara (CTO), **voglio** 3 template app di esempio (widget, integration, workflow), **in modo da** fornire riferimenti concreti agli sviluppatori e accelerare l'adozione dell'SDK.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 21
**Dipendenze:** US-135

**Criteri di Accettazione:**

```gherkin
Given uno sviluppatore che accede alla sezione "Templates" del developer portal
When visualizza la lista dei template disponibili
Then vede 3 template:
  1. "Widget Template" - widget per la sidebar contatti
  2. "Integration Template" - integrazione con servizio esterno (webhook)
  3. "Workflow Template" - automazione custom con trigger e azioni

Given uno sviluppatore che seleziona il "Widget Template"
When clicca "Usa questo template" ed esegue il setup
Then ottiene un progetto funzionante che:
  - Mostra un widget nella sidebar del contatto
  - Legge dati dal contatto corrente via API bridge
  - Ha un form di configurazione nel pannello settings
  - Include test unitari e test di integrazione

Given uno sviluppatore che seleziona l'"Integration Template"
When completa il setup
Then ottiene un progetto funzionante che:
  - Registra un webhook endpoint
  - Riceve eventi dalla piattaforma (contact.created, deal.updated)
  - Invia dati a un servizio esterno (simulato con mock)
  - Gestisce retry e error handling
  - Include documentazione inline

Given uno sviluppatore che seleziona il "Workflow Template"
When completa il setup
Then ottiene un progetto funzionante che:
  - Definisce un trigger custom (es. "quando deal supera X EUR")
  - Implementa 2 azioni custom (es. "invia notifica", "crea task")
  - Ha un pannello di configurazione per le condizioni
  - Include test end-to-end

Given uno sviluppatore che ha usato un template
When lo ha personalizzato e vuole pubblicare
Then il template include script `crmpro360 plugin publish`
  And la documentazione guida step-by-step alla pubblicazione
```

---

## Riepilogo Story Points

| Story | Titolo | SP | Priorita | Sprint |
|-------|--------|----|----------|--------|
| US-128 | Plugin System con Lifecycle Management | 13 | 🔴 Alta | 18 |
| US-129 | Sandbox Isolato V8 Isolates | 13 | 🔴 Alta | 18 |
| US-130 | Processo Certificazione App | 8 | 🔴 Alta | 20 |
| US-131 | Developer Portal | 8 | 🔴 Alta | 19 |
| US-132 | App Listing e Discovery | 8 | 🟡 Media | 21 |
| US-133 | Billing Integration | 13 | 🟡 Media | 22 |
| US-134 | Sandbox Environment per Testing | 5 | 🟡 Media | 19 |
| US-135 | SDK per Sviluppatori | 8 | 🔴 Alta | 19-20 |
| US-136 | App Analytics Dashboard | 5 | 🟢 Bassa | 23 |
| US-137 | Template App di Esempio | 8 | 🟡 Media | 21 |
| **Totale** | | **89** | | |

---

## Task Breakdown

### Plugin System Core (US-128, US-129)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-0900 | Progettare schema manifest.json per plugin (versione, permessi, hooks, extension points) | 6 | Backend Architect | US-128 |
| T-0901 | Implementare parser e validatore manifest con JSON Schema | 8 | Backend Dev | US-128 |
| T-0902 | Creare modello dati Plugin in Prisma (stato, metadata, versione, tenant) | 4 | Backend Dev | US-128 |
| T-0903 | Implementare PluginLifecycleService (install, enable, disable, uninstall) | 12 | Backend Dev | US-128 |
| T-0904 | Implementare dependency resolver per plugin inter-dipendenti | 8 | Backend Dev | US-128 |
| T-0905 | Creare pannello admin UI per gestione plugin (lista, stato, azioni) | 10 | Frontend Dev | US-128 |
| T-0906 | Configurare `isolated-vm` (V8 isolates) con pool management | 12 | Backend Dev | US-129 |
| T-0907 | Implementare API bridge (interfaccia tra isolate e sistema host) | 16 | Backend Dev | US-129 |
| T-0908 | Implementare resource limiter (CPU timeout, memory cap, network throttle) | 10 | Backend Dev | US-129 |
| T-0909 | Implementare permission enforcement layer nel bridge | 8 | Backend Dev | US-129 |
| T-0910 | Scrivere test di sicurezza: escape attempts, resource exhaustion, privilege escalation | 12 | QA/Security | US-129 |
| T-0911 | Load test con 50+ plugin concorrenti per validare performance target | 8 | QA | US-129 |

### Certificazione e Developer Portal (US-130, US-131)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-0912 | Implementare pipeline di review automatica (lint, CVE scan, static analysis) | 12 | Backend Dev | US-130 |
| T-0913 | Creare interfaccia reviewer per review manuale (checklist, approve/reject) | 8 | Frontend Dev | US-130 |
| T-0914 | Implementare sistema di scoring (0-100) con pesi configurabili | 6 | Backend Dev | US-130 |
| T-0915 | Implementare notifiche email per stati certificazione (submitted, approved, rejected) | 4 | Backend Dev | US-130 |
| T-0916 | Progettare e implementare UI developer portal (registrazione, dashboard) | 12 | Frontend Dev | US-131 |
| T-0917 | Implementare API key generation, rotation, revocation service | 8 | Backend Dev | US-131 |
| T-0918 | Integrare documentazione OpenAPI con console interattiva (Swagger/Redoc) | 6 | Frontend Dev | US-131 |
| T-0919 | Implementare rate limiting per API key (per piano: Free 100/min, Pro 1000/min) | 6 | Backend Dev | US-131 |

### Marketplace e Billing (US-132, US-133)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-0920 | Progettare schema dati marketplace (listing, categorie, tag, rating) | 4 | Backend Architect | US-132 |
| T-0921 | Implementare full-text search con ranking (PostgreSQL tsvector) | 8 | Backend Dev | US-132 |
| T-0922 | Creare UI marketplace: home, categorie, ricerca, dettaglio app | 16 | Frontend Dev | US-132 |
| T-0923 | Implementare sistema rating e recensioni con moderazione | 8 | Backend Dev | US-132 |
| T-0924 | Integrare Stripe Connect per onboarding sviluppatori | 10 | Backend Dev | US-133 |
| T-0925 | Implementare checkout flow (one-time, subscription) con Stripe Elements | 12 | Full Stack | US-133 |
| T-0926 | Implementare calcolo revenue share e payout scheduling | 8 | Backend Dev | US-133 |
| T-0927 | Creare dashboard finanze per sviluppatori (revenue, payout, fatture) | 10 | Frontend Dev | US-133 |
| T-0928 | Implementare gestione refund (automatico entro 14gg, manuale dopo) | 6 | Backend Dev | US-133 |

### SDK, Sandbox e Templates (US-134, US-135, US-136, US-137)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-0929 | Implementare provisioning sandbox on-demand (container ephemeral) | 10 | DevOps | US-134 |
| T-0930 | Creare console di debug nel developer portal (log stream, request inspector) | 8 | Frontend Dev | US-134 |
| T-0931 | Implementare TTL management e cleanup automatico sandbox | 4 | Backend Dev | US-134 |
| T-0932 | Sviluppare @crmpro360/plugin-sdk: TypeScript types e API client | 12 | Backend Dev | US-135 |
| T-0933 | Implementare hook system nell'SDK (event emitter con type-safety) | 8 | Backend Dev | US-135 |
| T-0934 | Implementare UI extension points framework (slot system, component injection) | 12 | Frontend Dev | US-135 |
| T-0935 | Sviluppare CLI tool (init, build, test, package, publish) | 10 | Backend Dev | US-135 |
| T-0936 | Scrivere documentazione SDK con esempi (Getting Started, API Reference, Guides) | 8 | Tech Writer | US-135 |
| T-0937 | Implementare backend analytics: raccolta metriche per app (installazioni, errori, usage) | 8 | Backend Dev | US-136 |
| T-0938 | Creare dashboard analytics frontend con grafici (Recharts/Nivo) | 10 | Frontend Dev | US-136 |
| T-0939 | Implementare export CSV e alerting per soglie | 4 | Full Stack | US-136 |
| T-0940 | Sviluppare Widget Template completo con test e documentazione | 8 | Full Stack | US-137 |
| T-0941 | Sviluppare Integration Template (webhook-based) con test e documentazione | 8 | Full Stack | US-137 |
| T-0942 | Sviluppare Workflow Template (trigger + azioni) con test e documentazione | 10 | Full Stack | US-137 |
| T-0943 | Creare sezione "Templates" nel developer portal con preview e download | 6 | Frontend Dev | US-137 |

---

## Riepilogo Task

| Area | Task | Ore Totali |
|------|------|------------|
| Plugin System Core | T-0900 - T-0911 | 114 |
| Certificazione e Portal | T-0912 - T-0919 | 62 |
| Marketplace e Billing | T-0920 - T-0928 | 82 |
| SDK, Sandbox, Templates | T-0929 - T-0943 | 126 |
| **Totale** | **44 task** | **384 ore** |

---

## Technical Design Notes

### Plugin Security Model

```
┌─────────────────────────────────────────────┐
│                Host Process                  │
│  ┌─────────────────────────────────────────┐ │
│  │          Plugin Manager                  │ │
│  │  ┌──────────┐  ┌──────────┐            │ │
│  │  │ Lifecycle │  │Permission│            │ │
│  │  │ Service   │  │ Checker  │            │ │
│  │  └──────────┘  └──────────┘            │ │
│  │          │                              │ │
│  │  ┌──────────────────────┐              │ │
│  │  │     API Bridge       │              │ │
│  │  │  (serialized calls)  │              │ │
│  │  └──────────┬───────────┘              │ │
│  └─────────────┼───────────────────────────┘ │
│                │                              │
│  ┌─────────────▼───────────────────────────┐ │
│  │        V8 Isolate Pool                   │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐│ │
│  │  │ Plugin A │ │ Plugin B │ │ Plugin C ││ │
│  │  │ 128MB max│ │ 128MB max│ │ 128MB max││ │
│  │  │ 500ms CPU│ │ 500ms CPU│ │ 500ms CPU││ │
│  │  └──────────┘ └──────────┘ └──────────┘│ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Permessi dichiarativi nel manifest:**
```json
{
  "permissions": {
    "api": ["contacts.read", "contacts.write", "deals.read"],
    "events": ["contact.created", "contact.updated"],
    "ui": ["contact-detail-sidebar", "settings-page"],
    "network": ["https://api.external-service.com"]
  }
}
```

### Extension Points

**UI Slots** - Punti definiti nell'applicazione dove i plugin possono iniettare componenti:
- `main-sidebar` - Voce di menu nella sidebar principale
- `contact-detail-sidebar` - Widget nella sidebar del dettaglio contatto
- `deal-detail-tabs` - Tab aggiuntivi nel dettaglio deal
- `dashboard-widgets` - Widget nella dashboard principale
- `settings-page` - Pagina dedicata nelle impostazioni

**API Hooks** - Intercettori nel flusso delle operazioni:
- `before:*` - Pre-processing (puo' annullare l'operazione)
- `after:*` - Post-processing (side-effects)
- `transform:*` - Modifica dati in transito

**Event Listeners** - Notifiche asincrone su eventi di dominio:
- Entity CRUD events (`contact.created`, `deal.updated`, etc.)
- System events (`user.login`, `import.completed`, etc.)
- Custom events emessi da altri plugin

### Billing via Stripe Connect

- **Modello:** Stripe Connect Standard (sviluppatori con account Stripe proprio)
- **Revenue Share:** 70% sviluppatore / 30% piattaforma (application fee)
- **Payout:** Automatico, gestito da Stripe (T+2 per la maggior parte dei paesi EU)
- **Modelli di prezzo supportati:**
  - One-time purchase (Stripe Payment Intent)
  - Subscription mensile/annuale (Stripe Subscriptions)
  - Freemium (upgrade in-app via Stripe Checkout)
- **Refund policy:** Automatico entro 14 giorni, manuale con approvazione dopo

---

## Rischi

| ID | Rischio | Probabilita | Impatto | Mitigazione |
|----|---------|-------------|---------|-------------|
| R-11.1 | Escape dal sandbox V8 - un plugin riesce ad accedere a risorse non autorizzate | Bassa | Critico | Test di sicurezza dedicati, penetration test, bounty program. Aggiornamento costante di `isolated-vm`. |
| R-11.2 | Performance degradation con molti plugin attivi - il pool di isolate consuma troppe risorse | Media | Alto | Pool sizing dinamico, circuit breaker per plugin lenti, caching aggressivo dell'API bridge. Load test obbligatori. |
| R-11.3 | Bassa adozione da parte degli sviluppatori - l'ecosistema non decolla | Media | Alto | Investire nel developer experience (SDK, documentazione, template). Programma early-adopter con incentivi (revenue share 80/20 per i primi 6 mesi). |
| R-11.4 | Complessita' del billing e compliance fiscale (fatturazione EU, IVA, DAC7) | Alta | Medio | Delegare il piu' possibile a Stripe (Stripe Tax, Stripe Billing Portal). Consulenza fiscale dedicata. |
| R-11.5 | Plugin malevoli che passano la certificazione automatica | Bassa | Critico | Review manuale obbligatoria per tutti i plugin. Monitoring runtime dei comportamenti anomali. Kill-switch per disabilitare plugin a livello globale. |
| R-11.6 | Breaking changes nell'API che rompono plugin esistenti | Media | Alto | Versionamento API rigoroso (semver). Periodo di deprecation minimo 6 mesi. Compatibility layer per major version precedenti. |
| R-11.7 | Stripe Connect onboarding friction - sviluppatori abbandonano il processo | Media | Medio | Guidare step-by-step con UI dedicata. Supporto diretto per i primi 50 sviluppatori. Alternative: Stripe Express per onboarding semplificato. |

---

## Definition of Done

1. Il plugin system supporta il lifecycle completo: install, enable, disable, uninstall senza memory leak o side-effect.
2. Ogni plugin esegue in un V8 isolate dedicato con limiti di CPU (500ms), memoria (128MB) e network enforcement.
3. Il permission system blocca ogni accesso non dichiarato nel manifest con log nell'audit trail.
4. La pipeline di certificazione automatica produce un punteggio affidabile (< 5% falsi negativi su test set di riferimento).
5. Il developer portal permette registrazione, API key management e accesso alla documentazione completa.
6. Il marketplace mostra app con ricerca full-text, categorie e sistema di rating funzionante.
7. Il billing via Stripe Connect processa pagamenti, calcola revenue share 70/30 e gestisce refund.
8. L'SDK e' pubblicato su npm, installabile, e include TypeScript types, API client, hook system e CLI.
9. I 3 template sono funzionanti, testati e documentati.
10. La dashboard analytics mostra metriche reali (installazioni, errori, usage) con export CSV.
11. Il sandbox environment si provisiona in < 60 secondi e si auto-distrugge dopo TTL.
12. Load test: 50 plugin concorrenti con latenza API core < 100ms (p95).
13. Tutti i test unitari e di integrazione passano con coverage > 80%.
14. La documentazione copre: Getting Started, API Reference, Security Model, Billing, e FAQ.
15. Security audit completato senza vulnerabilita' critiche o alte aperte.
