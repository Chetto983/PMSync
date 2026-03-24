# Epic EP-06: Customer Service & Ticketing

## Metadata

| Campo | Valore |
|-------|--------|
| **Epic ID** | EP-06 |
| **Titolo** | Customer Service & Ticketing |
| **Persona** | Paolo (Customer Service Lead) |
| **Fase** | 2 (Sprint 11-12) |
| **Story Points Totali** | ~89 SP |
| **Priorita Complessiva** | 🔴 Alta |
| **Dipendenze** | EP-01 (Contact Management), EP-05 (Marketing Automation - per knowledge base linking) |

## Overview

Sistema di ticketing multi-canale completo che comprende: gestione ticket da email, chat, telefono e social media; routing intelligente basato su regole e competenze degli agenti; SLA management con escalation automatica a tempo; knowledge base con editor rich-text e ricerca full-text; customer portal self-service per apertura e monitoraggio ticket; survey CSAT/NPS post-risoluzione automatici; chatbot handoff con escalation fluida da bot a agente umano.

Paolo, in qualita di Customer Service Lead, necessita di uno strumento centralizzato per gestire tutte le richieste dei clienti, monitorare le performance del team e garantire il rispetto degli SLA contrattuali.

---

## User Stories

### US-066: Creazione Ticket da Email (Auto-Parsing)

**Come** Paolo (Customer Service Lead),
**voglio** che le email inviate all'indirizzo di supporto vengano automaticamente convertite in ticket,
**in modo da** non perdere nessuna richiesta e ridurre il lavoro manuale di data entry.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 11
**Dipendenze:** Nessuna (story fondante dell'epic)

**Criteri di Accettazione:**

```gherkin
Scenario: Ricezione email e creazione ticket automatica
  Given un cliente invia un'email a supporto@azienda.com
  When il sistema riceve l'email tramite webhook (SendGrid Inbound Parse)
  Then viene creato un ticket con:
    | Campo       | Valore                              |
    | Oggetto     | Subject dell'email                  |
    | Descrizione | Body dell'email (HTML sanitizzato)  |
    | Richiedente | Contatto CRM (match per email)      |
    | Canale      | "email"                             |
    | Stato       | "new"                               |
    | Priorita    | "normal" (default)                  |

Scenario: Riconoscimento contatto esistente
  Given un'email arriva da laura@acme.com
  When il sistema cerca il contatto nel CRM
  Then il ticket viene associato al contatto "Laura Rossi" di "Acme Corp"
  And la timeline del contatto viene aggiornata con l'evento "ticket_created"

Scenario: Email da mittente sconosciuto
  Given un'email arriva da un indirizzo non presente nel CRM
  When il sistema non trova corrispondenza
  Then viene creato un nuovo contatto con i dati estratti dall'email (nome dal campo From, email)
  And il ticket viene associato al nuovo contatto
  And il ticket viene etichettato con tag "nuovo_contatto"

Scenario: Reply su thread esistente
  Given un cliente risponde a un'email di notifica di un ticket esistente #1234
  When il sistema riceve l'email con header In-Reply-To o References corrispondente
  Then il messaggio viene aggiunto come commento al ticket #1234 (non crea un nuovo ticket)
  And lo stato del ticket torna a "open" se era in "waiting_for_customer"

Scenario: Gestione allegati email
  Given un cliente invia un'email con 3 allegati (PDF, PNG, DOCX)
  When il ticket viene creato
  Then gli allegati vengono salvati nello storage e collegati al ticket
  And ogni allegato mostra nome, dimensione e tipo MIME
  And gli allegati superiori a 25MB vengono rifiutati con notifica al mittente
```

---

### US-067: Creazione Ticket da Chat Widget

**Come** Paolo (Customer Service Lead),
**voglio** che le conversazioni dal chat widget sul sito vengano convertite in ticket,
**in modo da** gestire le richieste da chat nello stesso flusso dei ticket email.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 11
**Dipendenze:** Nessuna

**Criteri di Accettazione:**

```gherkin
Scenario: Apertura chat widget da sito web
  Given un visitatore si trova sul sito aziendale
  When clicca sull'icona chat nell'angolo in basso a destra
  Then si apre il widget chat con messaggio di benvenuto configurabile
  And viene mostrato lo stato di disponibilita degli agenti (online/offline)

Scenario: Conversazione chat e creazione ticket
  Given un visitatore sta chattando con un agente
  When la conversazione contiene una richiesta di supporto
  Then l'agente puo cliccare "Crea Ticket da Chat"
  And viene creato un ticket con l'intera trascrizione della chat come descrizione
  And il canale viene impostato a "chat"

Scenario: Chat offline - form di contatto
  Given nessun agente e disponibile (fuori orario lavorativo)
  When il visitatore apre il widget chat
  Then viene mostrato un form: nome, email, messaggio
  And alla sottomissione viene creato un ticket con stato "new" e canale "chat_offline"

Scenario: Identificazione visitatore autenticato
  Given un cliente autenticato sul portale apre il widget chat
  When la sessione viene inizializzata
  Then il sistema riconosce il cliente tramite il JWT/cookie di sessione
  And l'agente vede il profilo completo del cliente con storico ticket nella sidebar

Scenario: Trasferimento chat tra agenti
  Given un agente sta gestendo una chat
  When l'agente clicca "Trasferisci" e seleziona un altro agente
  Then la chat viene trasferita con l'intera cronologia
  And il visitatore vede un messaggio "Sei stato trasferito a [Nome Agente]"
  And il nuovo agente riceve una notifica con contesto della conversazione
```

---

### US-068: Routing Intelligente Ticket Basato su Regole e Skill

**Come** Paolo (Customer Service Lead),
**voglio** che i ticket vengano automaticamente assegnati all'agente piu appropriato in base a regole e competenze,
**in modo da** ridurre i tempi di risposta e migliorare la qualita del supporto.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 11
**Dipendenze:** US-066, US-067

**Criteri di Accettazione:**

```gherkin
Scenario: Routing basato su categoria
  Given Paolo ha configurato le regole di routing:
    | Categoria      | Agente/Team          |
    | Fatturazione   | Team Amministrazione |
    | Bug tecnico    | Team Sviluppo        |
    | Informazioni   | Team Vendite         |
  When arriva un ticket con categoria "Bug tecnico"
  Then il ticket viene assegnato automaticamente al Team Sviluppo
  And viene selezionato l'agente con meno ticket aperti nel team (round-robin pesato)

Scenario: Routing basato su skill
  Given ogni agente ha un profilo di competenze:
    | Agente   | Skill                  | Livello |
    | Marco    | API, Backend           | Expert  |
    | Sara     | UI, Mobile             | Expert  |
    | Giulia   | Fatturazione, Contratti| Expert  |
  When arriva un ticket con tag "api_error"
  Then il ticket viene assegnato a Marco (skill match "API" con livello Expert)

Scenario: Routing con priorita cliente
  Given un ticket arriva da un cliente con piano "Enterprise"
  When il sistema valuta le regole di routing
  Then il ticket viene assegnato con priorita "high" automaticamente
  And il ticket viene instradato verso agenti senior (livello >= 3)

Scenario: Fallback quando nessun agente e disponibile
  Given tutti gli agenti del team target sono offline o al massimo della capacita
  When arriva un ticket che matcha le regole del team
  Then il ticket viene messo nella coda "unassigned" con un alert al team lead
  And viene inviata una risposta automatica al cliente con tempo stimato di presa in carico

Scenario: Override manuale dell'assegnazione
  Given un ticket e stato assegnato automaticamente a Marco
  When Paolo reassegna manualmente il ticket a Sara
  Then l'assegnazione viene aggiornata
  And viene registrato l'evento di reassegnazione con motivo (opzionale)
  And Sara riceve una notifica del nuovo ticket assegnato
```

---

### US-069: SLA Management con Timer e Escalation Automatica

**Come** Paolo (Customer Service Lead),
**voglio** definire SLA per ogni piano cliente con timer di risposta/risoluzione e escalation automatica,
**in modo da** garantire il rispetto degli impegni contrattuali e intervenire tempestivamente su ritardi.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 11
**Dipendenze:** US-068

**Criteri di Accettazione:**

```gherkin
Scenario: Configurazione policy SLA
  Given Paolo accede a "Impostazioni > SLA Policies"
  When crea una nuova policy per il piano "Enterprise":
    | Priorita | Tempo Prima Risposta | Tempo Risoluzione |
    | Critica  | 1 ora                | 4 ore             |
    | Alta     | 2 ore                | 8 ore             |
    | Normale  | 4 ore                | 24 ore            |
    | Bassa    | 8 ore                | 48 ore            |
  Then la policy viene salvata e applicata automaticamente ai ticket dei clienti Enterprise

Scenario: Timer SLA su ticket
  Given un ticket con priorita "Alta" viene creato per un cliente Enterprise
  When il ticket appare nella dashboard
  Then il timer "Prima Risposta" parte dal momento della creazione
  And il countdown mostra "1h 58m rimanenti" in verde
  And il timer "Risoluzione" mostra "7h 58m rimanenti" in verde

Scenario: Warning SLA in scadenza
  Given un ticket ha il timer di prima risposta a meno del 25% del tempo totale
  When restano 30 minuti su un SLA di 2 ore
  Then il timer diventa giallo
  And viene inviata una notifica all'agente assegnato con "SLA first response in scadenza"

Scenario: Escalation automatica per SLA violato
  Given il timer di prima risposta di un ticket scade
  When il ticket non ha ancora ricevuto risposta
  Then il timer diventa rosso con indicazione "SLA VIOLATED"
  And il ticket viene escalato al team lead (Paolo) con notifica push e email
  And se dopo 30 minuti non c'e risposta, viene escalato al manager di livello superiore

Scenario: Orari lavorativi e pause SLA
  Given la policy SLA e configurata con business hours "Lun-Ven 09:00-18:00 CET"
  When un ticket viene creato venerdi alle 17:30 con SLA 4 ore
  Then il timer conta solo 30 minuti il venerdi
  And riprende lunedi alle 09:00 con 3h 30m rimanenti
  And il weekend non viene conteggiato nel timer
```

---

### US-070: Dashboard Agente con Coda Ticket Assegnati

**Come** agente di customer service,
**voglio** una dashboard con la mia coda di ticket assegnati, ordinati per priorita e SLA,
**in modo da** gestire il carico di lavoro in modo efficiente e rispettare le scadenze.

**Story Points:** 5
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 11
**Dipendenze:** US-066, US-068, US-069

**Criteri di Accettazione:**

```gherkin
Scenario: Visualizzazione coda personale
  Given un agente accede alla dashboard di supporto
  When la pagina viene caricata
  Then viene mostrata la lista dei ticket assegnati all'agente, ordinati per:
    1. SLA piu vicino alla scadenza (urgenza)
    2. Priorita (critica > alta > normale > bassa)
    3. Data creazione (FIFO a parita di priorita)

Scenario: Indicatori SLA nella lista
  Given l'agente visualizza la coda ticket
  When un ticket ha SLA attivo
  Then viene mostrato un badge colorato accanto al ticket:
    | Colore  | Significato                   |
    | Verde   | SLA rispettato, tempo OK      |
    | Giallo  | SLA < 25% tempo rimanente     |
    | Rosso   | SLA violato                   |
    | Grigio  | Nessun SLA applicato          |

Scenario: Quick actions sulla lista
  Given l'agente visualizza un ticket nella coda
  When passa il mouse sopra un ticket
  Then appaiono le azioni rapide: "Rispondi", "Assegna", "Chiudi", "Metti in attesa"
  And ogni azione e eseguibile con un singolo click senza aprire il ticket

Scenario: Filtri e viste personalizzate
  Given l'agente vuole filtrare la propria coda
  When applica i filtri:
    | Filtro     | Valore            |
    | Stato      | open, in_progress |
    | Canale     | email             |
    | Priorita   | alta, critica     |
  Then la lista mostra solo i ticket che soddisfano tutti i criteri
  And l'agente puo salvare la vista come "Vista personalizzata"

Scenario: Contatori real-time nella sidebar
  Given l'agente e nella dashboard
  When nuovi ticket arrivano nella coda
  Then i contatori nella sidebar si aggiornano in tempo reale via WebSocket:
    | Contatore         | Esempio |
    | I miei ticket     | 12      |
    | Non assegnati     | 5       |
    | SLA in scadenza   | 3       |
    | In attesa cliente | 7       |
```

---

### US-071: Knowledge Base con Editor e Ricerca Full-Text

**Come** Paolo (Customer Service Lead),
**voglio** una knowledge base interna con editor rich-text e ricerca full-text,
**in modo da** permettere agli agenti di trovare rapidamente le risposte e ai clienti di consultare l'help center.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 12
**Dipendenze:** Nessuna

**Criteri di Accettazione:**

```gherkin
Scenario: Creazione articolo nella knowledge base
  Given Paolo accede a "Knowledge Base > Nuovo Articolo"
  When compila il form:
    | Campo      | Valore                                    |
    | Titolo     | "Come configurare le notifiche email"     |
    | Categoria  | "Impostazioni"                            |
    | Visibilita | "Pubblica" (visibile anche nel portale)   |
  And scrive il contenuto nell'editor rich-text con immagini, video e blocchi di codice
  Then l'articolo viene salvato come bozza

Scenario: Pubblicazione e versioning
  Given Paolo ha un articolo in bozza
  When clicca "Pubblica"
  Then l'articolo diventa visibile (internamente o anche nel portale, in base alla visibilita)
  And viene creata la versione 1.0 dell'articolo
  And le modifiche successive creano nuove versioni (1.1, 1.2, ...) con diff visualizzabile

Scenario: Ricerca full-text articoli
  Given un agente sta gestendo un ticket su "notifiche non funzionanti"
  When digita "configurare notifiche" nella barra di ricerca della KB
  Then vengono mostrati gli articoli rilevanti ordinati per pertinenza
  And il termine di ricerca viene evidenziato nei risultati (highlight)
  And la ricerca copre titolo, contenuto e tag

Scenario: Suggerimento articoli in contesto
  Given un agente sta rispondendo a un ticket
  When il sistema analizza il contenuto del ticket
  Then nella sidebar destra vengono suggeriti automaticamente 3-5 articoli KB correlati
  And l'agente puo inserire il link all'articolo nella risposta con un click

Scenario: Organizzazione per categorie e navigazione
  Given la knowledge base contiene 50+ articoli
  When un utente accede alla KB
  Then gli articoli sono organizzati in categorie e sottocategorie con struttura ad albero
  And ogni categoria mostra il numero di articoli contenuti
  And e disponibile una breadcrumb per la navigazione gerarchica
```

---

### US-072: Customer Portal Self-Service

**Come** cliente,
**voglio** un portale self-service dove posso aprire ticket, controllare lo stato e consultare la knowledge base,
**in modo da** risolvere i problemi autonomamente o monitorare le richieste senza dover chiamare il supporto.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 12
**Dipendenze:** US-066, US-071

**Criteri di Accettazione:**

```gherkin
Scenario: Accesso al portale clienti
  Given un cliente ha ricevuto un invito al portale via email
  When accede con le credenziali (email + password) o magic link
  Then viene mostrata la homepage del portale con:
    | Sezione            | Descrizione                  |
    | I miei ticket      | Lista ticket aperti/chiusi   |
    | Nuovo ticket       | Form di apertura ticket      |
    | Knowledge Base     | Articoli pubblici ricercabili|
    | Profilo            | Dati account e preferenze    |

Scenario: Apertura nuovo ticket dal portale
  Given il cliente e autenticato nel portale
  When clicca "Nuovo Ticket" e compila:
    | Campo       | Valore                              |
    | Categoria   | "Problema tecnico" (dropdown)       |
    | Oggetto     | "Errore nel caricamento dashboard"  |
    | Descrizione | Testo libero con allegati           |
  Then il ticket viene creato nel sistema con canale "portal"
  And il cliente riceve una email di conferma con il numero ticket

Scenario: Monitoraggio stato ticket
  Given il cliente ha ticket aperti
  When accede a "I miei ticket"
  Then vede la lista dei propri ticket con stato, data, ultimo aggiornamento
  And puo cliccare su un ticket per vedere la timeline completa delle risposte
  And puo aggiungere commenti/informazioni aggiuntive al ticket

Scenario: Ricerca nella knowledge base dal portale
  Given il cliente e nel portale
  When digita "come resettare la password" nella barra di ricerca
  Then vengono mostrati gli articoli KB pubblici pertinenti
  And se trova la risposta, puo chiudere il ticket con "Risolto tramite KB"

Scenario: Notifiche email su aggiornamenti ticket
  Given un agente risponde a un ticket del cliente
  When la risposta viene salvata
  Then il cliente riceve un'email con la risposta
  And l'email contiene un link diretto al ticket nel portale
  And il cliente puo rispondere direttamente via email (reply threading)
```

---

### US-073: Survey CSAT/NPS Automatico Post-Risoluzione

**Come** Paolo (Customer Service Lead),
**voglio** inviare automaticamente survey CSAT e NPS dopo la risoluzione di un ticket,
**in modo da** misurare la soddisfazione dei clienti e identificare aree di miglioramento.

**Story Points:** 5
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 12
**Dipendenze:** US-066

**Criteri di Accettazione:**

```gherkin
Scenario: Invio automatico survey CSAT post-risoluzione
  Given un ticket viene chiuso con stato "resolved"
  When trascorrono 2 ore dalla chiusura (tempo configurabile)
  Then il sistema invia un'email al cliente con survey CSAT embedded
  And il survey contiene una scala da 1 a 5 stelle cliccabile direttamente dall'email
  And include un campo commento opzionale

Scenario: Compilazione survey con un click
  Given il cliente riceve l'email di survey
  When clicca su una stella (es. 4/5)
  Then viene reindirizzato a una pagina di conferma con campo commento opzionale
  And il voto viene registrato e associato al ticket
  And il rating CSAT viene salvato nel profilo del contatto

Scenario: Survey NPS periodico
  Given Paolo ha configurato il survey NPS con frequenza trimestrale
  When un cliente non ha ricevuto un NPS negli ultimi 90 giorni
  Then il sistema invia un'email NPS: "Su una scala da 0 a 10, quanto consiglieresti il nostro servizio?"
  And il risultato viene classificato: Detractor (0-6), Passive (7-8), Promoter (9-10)

Scenario: Throttling survey
  Given un cliente ha chiuso 3 ticket nell'ultima settimana
  When il sistema valuta l'invio di survey CSAT
  Then viene inviato il survey solo per l'ultimo ticket
  And i ticket precedenti vengono marcati come "survey_skipped" per evitare spam

Scenario: Dashboard CSAT/NPS
  Given Paolo accede a "Supporto > Metriche Soddisfazione"
  When visualizza la dashboard
  Then vengono mostrate le metriche aggregate:
    | Metrica       | Valore  |
    | CSAT medio    | 4.2/5   |
    | NPS score     | +42     |
    | Tasso risposta| 34%     |
    | Trend mensile | +0.3    |
  And i dati sono filtrabili per agente, team, categoria e periodo
```

---

### US-074: Timeline Conversazione Ticket (Tutti i Canali)

**Come** agente di customer service,
**voglio** visualizzare l'intera timeline di un ticket con tutti i messaggi da ogni canale in ordine cronologico,
**in modo da** avere il contesto completo della conversazione senza dover cercare in piu sistemi.

**Story Points:** 5
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 11
**Dipendenze:** US-066, US-067

**Criteri di Accettazione:**

```gherkin
Scenario: Visualizzazione timeline unificata
  Given un agente apre un ticket che ha ricevuto messaggi via email e chat
  When la pagina del ticket viene caricata
  Then la timeline mostra tutti i messaggi in ordine cronologico con indicatore del canale:
    | Timestamp        | Canale | Autore        | Messaggio                    |
    | 10:30 24/03/2026 | Email  | Laura (cliente)| "Ho un problema con..."     |
    | 10:45 24/03/2026 | Note   | Marco (agente) | [nota interna] "Verifico"  |
    | 11:00 24/03/2026 | Chat   | Laura (cliente)| "Aggiungo che il problema.."|
    | 11:15 24/03/2026 | Email  | Marco (agente) | "Abbiamo risolto..."        |

Scenario: Note interne non visibili al cliente
  Given un agente aggiunge una nota interna al ticket
  When il messaggio viene salvato con tipo "internal_note"
  Then la nota appare nella timeline con sfondo diverso (giallo) e icona lucchetto
  And la nota NON e visibile al cliente nel portale o nelle notifiche email

Scenario: Allegati nella timeline
  Given un messaggio nella timeline contiene allegati
  When l'agente visualizza il messaggio
  Then gli allegati sono mostrati inline (preview per immagini) o come link scaricabili
  And il tipo di file e indicato con icona corrispondente

Scenario: Cambio stato nella timeline
  Given il ticket ha subito cambiamenti di stato
  When l'agente scorre la timeline
  Then i cambi di stato appaiono come eventi nella timeline:
    | Evento                                    | Stile        |
    | "Ticket creato"                           | Grigio       |
    | "Assegnato a Marco"                       | Blu          |
    | "Stato cambiato da 'new' a 'in_progress'" | Arancione    |
    | "SLA prima risposta soddisfatto"          | Verde        |
    | "Escalazione a Paolo"                     | Rosso        |

Scenario: Risposta rapida dalla timeline
  Given l'agente sta leggendo la timeline
  When scorre fino in fondo
  Then trova il campo di risposta con tabs: "Risposta Pubblica", "Nota Interna"
  And puo inserire testo formattato, allegati e articoli KB
  And puo selezionare il canale di invio (email, portale)
```

---

### US-075: Risposte Predefinite (Canned Responses)

**Come** agente di customer service,
**voglio** utilizzare risposte predefinite personalizzabili con variabili,
**in modo da** rispondere piu velocemente alle domande frequenti mantenendo la qualita.

**Story Points:** 3
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 12
**Dipendenze:** US-074

**Criteri di Accettazione:**

```gherkin
Scenario: Inserimento canned response nella risposta
  Given un agente sta scrivendo la risposta a un ticket
  When digita "/" nel campo di risposta
  Then appare un menu di ricerca con le risposte predefinite disponibili
  And l'agente puo cercare per titolo o contenuto

Scenario: Variabili automatiche nelle canned responses
  Given una canned response contiene "Gentile {{contact.firstName}}, il tuo ticket #{{ticket.number}}"
  When l'agente seleziona la risposta
  Then le variabili vengono sostituite con i valori reali: "Gentile Laura, il tuo ticket #1234"
  And l'agente puo modificare il testo prima di inviare

Scenario: Gestione libreria canned responses
  Given Paolo accede a "Impostazioni > Risposte Predefinite"
  When crea una nuova risposta con categoria "Rimborso" e contenuto template
  Then la risposta viene salvata e disponibile per tutti gli agenti del team
  And puo impostare la visibilita: "Tutti", "Solo il mio team", "Solo io"

Scenario: Risposte predefinite per categoria ticket
  Given un agente apre un ticket con categoria "Fatturazione"
  When digita "/" per cercare una canned response
  Then le risposte della categoria "Fatturazione" appaiono per prime
  And le altre risposte sono comunque accessibili scorrendo o cercando

Scenario: Statistiche utilizzo canned responses
  Given Paolo vuole analizzare l'utilizzo delle risposte predefinite
  When accede alla sezione analytics delle canned responses
  Then vede: numero di utilizzi, ultima modifica, rating medio dei ticket che le hanno usate
  And puo identificare risposte obsolete (non usate da 90+ giorni)
```

---

### US-076: Merge Ticket Duplicati

**Come** agente di customer service,
**voglio** unire ticket duplicati in un unico ticket,
**in modo da** evitare lavoro doppio e mantenere un'unica conversazione con il cliente.

**Story Points:** 3
**Priorita:** 🟢 Bassa
**Sprint Target:** Sprint 12
**Dipendenze:** US-074

**Criteri di Accettazione:**

```gherkin
Scenario: Identificazione ticket potenzialmente duplicati
  Given un nuovo ticket viene creato dallo stesso contatto
  When il sistema rileva un ticket aperto con oggetto simile (similarity > 70%) negli ultimi 7 giorni
  Then viene mostrato un banner "Possibile duplicato di #1230" con link al ticket correlato
  And l'agente puo scegliere di unire o ignorare la segnalazione

Scenario: Merge di due ticket
  Given un agente ha identificato due ticket duplicati (#1234 e #1230)
  When seleziona "Unisci Ticket" e sceglie #1230 come ticket primario
  Then tutti i messaggi di #1234 vengono copiati nella timeline di #1230 in ordine cronologico
  And il ticket #1234 viene chiuso con stato "merged" e riferimento a #1230
  And gli allegati vengono trasferiti al ticket primario

Scenario: Notifica al cliente post-merge
  Given due ticket sono stati uniti
  When il merge viene completato
  Then il cliente riceve una notifica: "I tuoi ticket #1234 e #1230 sono stati unificati. Continua a seguire il ticket #1230"
  And tutte le risposte successive al vecchio ticket vengono reindirizzate al ticket primario

Scenario: Undo merge entro 10 minuti
  Given un agente ha appena eseguito un merge di ticket
  When clicca "Annulla Merge" entro 10 minuti
  Then il ticket secondario viene ripristinato con tutti i suoi messaggi originali
  And il ticket primario torna allo stato precedente al merge

Scenario: Merge multi-ticket
  Given un agente ha individuato 3 ticket duplicati (#1230, #1234, #1237)
  When seleziona tutti e tre e sceglie #1230 come primario
  Then tutti i messaggi dei ticket secondari vengono uniti nella timeline di #1230
  And i ticket #1234 e #1237 vengono chiusi come "merged"
```

---

### US-077: Report SLA e Performance Agenti

**Come** Paolo (Customer Service Lead),
**voglio** report dettagliati su SLA compliance e performance degli agenti,
**in modo da** identificare colli di bottiglia e migliorare continuamente il servizio.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 12
**Dipendenze:** US-069, US-073

**Criteri di Accettazione:**

```gherkin
Scenario: Dashboard SLA compliance
  Given Paolo accede a "Supporto > Report > SLA"
  When seleziona il periodo "Ultimo mese"
  Then viene mostrata una dashboard con:
    | Metrica                  | Valore |
    | SLA First Response Met   | 94.2%  |
    | SLA Resolution Met       | 87.5%  |
    | Tempo Medio Prima Risp.  | 1h 23m |
    | Tempo Medio Risoluzione  | 6h 45m |
    | Ticket Escalati          | 12     |

Scenario: Performance per agente
  Given Paolo seleziona il tab "Performance Agenti"
  When la tabella viene caricata
  Then viene mostrata una tabella con metriche per agente:
    | Agente | Ticket Chiusi | Tempo Medio Risp. | CSAT Medio | SLA Met % |
    | Marco  | 45            | 0h 55m             | 4.5/5      | 96%       |
    | Sara   | 38            | 1h 12m             | 4.3/5      | 92%       |
    | Giulia | 42            | 1h 30m             | 4.1/5      | 88%       |

Scenario: Trend nel tempo
  Given Paolo vuole analizzare l'andamento delle metriche
  When seleziona la vista "Trend"
  Then viene mostrato un grafico a linee con l'andamento mensile di:
    - Volume ticket (creati vs chiusi)
    - SLA compliance %
    - CSAT medio
    - Tempo medio di risoluzione
  And Paolo puo selezionare il range: 3 mesi, 6 mesi, 12 mesi

Scenario: Report per canale
  Given Paolo seleziona il filtro "Per Canale"
  When i dati vengono aggregati
  Then viene mostrato il breakdown per canale di ingresso:
    | Canale       | Volume | % Totale | Tempo Medio Ris. | CSAT  |
    | Email        | 320    | 55%      | 8h 12m           | 4.0   |
    | Chat         | 180    | 31%      | 2h 30m           | 4.4   |
    | Portale      | 65     | 11%     | 12h 05m          | 3.8   |
    | Telefono     | 18     | 3%      | 0h 45m           | 4.6   |

Scenario: Export e scheduled report
  Given Paolo vuole ricevere il report settimanalmente
  When configura "Report Schedulato" con frequenza settimanale (lunedi alle 08:00)
  Then ogni lunedi riceve un'email con il report PDF allegato
  And il report include tutte le metriche della dashboard con confronto settimana precedente
```

---

## Task Breakdown

### Ticket Creation & Multi-Channel (US-066, US-067)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0400 | Progettare schema DB per ticketing (tickets, ticket_messages, ticket_attachments, ticket_events) | 6 | Backend Dev | US-066 |
| T-0401 | Implementare API CRUD ticket (POST, GET, PUT /tickets, POST /tickets/:id/messages) | 8 | Backend Dev | US-066 |
| T-0402 | Implementare webhook inbound email (SendGrid Inbound Parse) con parsing MIME | 8 | Backend Dev | US-066 |
| T-0403 | Implementare logica reply threading (header In-Reply-To / References matching) | 4 | Backend Dev | US-066 |
| T-0404 | Implementare contact matching per email con creazione contatto fallback | 3 | Backend Dev | US-066 |
| T-0405 | Implementare gestione allegati (upload S3/MinIO, validazione tipo e dimensione) | 6 | Backend Dev | US-066 |
| T-0406 | Sviluppare chat widget embeddabile (Web Component con Shadow DOM) | 12 | Frontend Dev | US-067 |
| T-0407 | Implementare backend chat real-time con Socket.IO (room per conversazione) | 8 | Backend Dev | US-067 |
| T-0408 | Implementare logica chat-to-ticket conversion | 3 | Backend Dev | US-067 |
| T-0409 | Implementare form offline mode nel widget chat | 3 | Frontend Dev | US-067 |
| T-0410 | Implementare trasferimento chat tra agenti con context handoff | 4 | Backend Dev | US-067 |

### Routing & SLA (US-068, US-069)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0411 | Progettare schema DB per routing rules (routing_rules, agent_skills, agent_capacity) | 4 | Backend Dev | US-068 |
| T-0412 | Implementare routing engine con rule evaluator (categoria, skill match, priorita cliente) | 10 | Backend Dev | US-068 |
| T-0413 | Implementare algoritmo round-robin pesato per distribuzione ticket | 4 | Backend Dev | US-068 |
| T-0414 | Implementare UI configurazione regole routing | 6 | Frontend Dev | US-068 |
| T-0415 | Progettare schema DB per SLA (sla_policies, sla_timers, escalation_rules) | 4 | Backend Dev | US-069 |
| T-0416 | Implementare SLA timer engine con business hours calculator | 10 | Backend Dev | US-069 |
| T-0417 | Implementare escalation automatica (BullMQ scheduled jobs per ogni SLA timer) | 6 | Backend Dev | US-069 |
| T-0418 | Implementare notifiche escalation (email + push + in-app) | 4 | Backend Dev | US-069 |
| T-0419 | Sviluppare UI configurazione SLA policies con business hours | 6 | Frontend Dev | US-069 |

### Agent Dashboard & Timeline (US-070, US-074)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0420 | Sviluppare dashboard agente con lista ticket ordinata per SLA/priorita | 8 | Frontend Dev | US-070 |
| T-0421 | Implementare contatori real-time via WebSocket (Socket.IO room per agente) | 4 | Backend Dev + Frontend Dev | US-070 |
| T-0422 | Implementare quick actions (rispondi, assegna, chiudi) con API batch | 4 | Backend Dev | US-070 |
| T-0423 | Implementare filtri avanzati e viste salvabili per l'agente | 4 | Frontend Dev | US-070 |
| T-0424 | Sviluppare componente timeline unificata con channel indicators | 8 | Frontend Dev | US-074 |
| T-0425 | Implementare note interne con visibility control (internal vs public) | 3 | Backend Dev | US-074 |
| T-0426 | Implementare campo risposta con tabs (pubblica/interna) e rich-text editor | 6 | Frontend Dev | US-074 |
| T-0427 | Implementare eventi di stato change nella timeline (audit log visuale) | 4 | Backend Dev | US-074 |

### Knowledge Base (US-071)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0428 | Progettare schema DB per KB (kb_articles, kb_categories, kb_versions) | 4 | Backend Dev | US-071 |
| T-0429 | Implementare API CRUD articoli con versioning (diff tra versioni) | 6 | Backend Dev | US-071 |
| T-0430 | Configurare Elasticsearch per ricerca full-text articoli (indice dedicato con analyzer italiano + inglese) | 8 | Backend Dev | US-071 |
| T-0431 | Implementare suggerimento articoli contestuale (query per similarita con contenuto ticket) | 6 | Backend Dev | US-071 |
| T-0432 | Sviluppare editor articoli rich-text con upload immagini e blocchi codice | 8 | Frontend Dev | US-071 |
| T-0433 | Sviluppare UI navigazione KB con categorie, breadcrumb e ricerca | 6 | Frontend Dev | US-071 |

### Customer Portal (US-072)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0434 | Implementare autenticazione portale clienti (magic link + password) | 6 | Backend Dev | US-072 |
| T-0435 | Implementare API portale (lista ticket, dettaglio ticket, crea ticket - scope limitato al contatto) | 6 | Backend Dev | US-072 |
| T-0436 | Sviluppare frontend portale clienti (pagine: home, ticket list, ticket detail, KB, profilo) | 12 | Frontend Dev | US-072 |
| T-0437 | Implementare notifiche email per aggiornamenti ticket con deep link al portale | 4 | Backend Dev | US-072 |

### Survey, Canned Responses, Merge, Reports (US-073, US-075, US-076, US-077)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0438 | Progettare schema DB per survey (surveys, survey_responses) e canned responses | 3 | Backend Dev | US-073 |
| T-0439 | Implementare invio automatico survey CSAT post-risoluzione con delay configurabile | 6 | Backend Dev | US-073 |
| T-0440 | Implementare survey NPS periodico con throttling (max 1 per contatto ogni 90 giorni) | 4 | Backend Dev | US-073 |
| T-0441 | Sviluppare pagina compilazione survey (one-click rating da email) | 4 | Frontend Dev | US-073 |
| T-0442 | Implementare API canned responses CRUD con variabili e categorie | 4 | Backend Dev | US-075 |
| T-0443 | Sviluppare UI inserimento canned response (slash command "/" nel campo risposta) | 4 | Frontend Dev | US-075 |
| T-0444 | Implementare rilevamento ticket duplicati (similarity scoring su oggetto con trigram matching) | 6 | Backend Dev | US-076 |
| T-0445 | Implementare logica merge ticket (copia messaggi, redirect risposte, undo temporizzato) | 6 | Backend Dev | US-076 |
| T-0446 | Sviluppare UI merge ticket con preview e conferma | 4 | Frontend Dev | US-076 |
| T-0447 | Implementare API report SLA e performance con aggregazioni (materialized views) | 8 | Backend Dev | US-077 |
| T-0448 | Sviluppare dashboard report SLA (grafici trend, tabelle agenti, breakdown canale) | 10 | Frontend Dev | US-077 |
| T-0449 | Implementare export PDF report e scheduled email con job BullMQ | 4 | Backend Dev | US-077 |
| T-0450 | Sviluppare dashboard CSAT/NPS con filtri e trend | 6 | Frontend Dev | US-073/US-077 |

**Totale Task:** 51
**Totale Ore Stimate:** ~308 ore

---

## Technical Design Notes

### Multi-Channel Ingestion

- **Email:** SendGrid Inbound Parse webhook. L'email viene ricevuta come POST multipart con headers, body (HTML + plain text) e allegati. Parsing MIME con `mailparser` (Node.js). Reply detection tramite header `In-Reply-To` e `References` con fallback su regex per estrarre il ticket ID dal subject (`[Ticket #1234]`)
- **Chat:** Socket.IO con namespace `/support-chat`. Ogni conversazione ha una room dedicata. Il widget e un Web Component isolato con Shadow DOM per evitare conflitti CSS con il sito ospitante. Distribuzione via CDN con script tag `<script src="https://cdn.crmpro360.com/chat-widget.js" data-tenant="TENANT_ID"></script>`
- **Portale:** API REST dedicata con scope limitato al contatto autenticato. Autenticazione via magic link (token JWT con TTL 30 giorni) o password tradizionale

### SLA Engine

- **Timer implementation:** Ogni ticket con SLA attivo genera un delayed job su BullMQ con il timestamp di scadenza. Il job, una volta eseguito, verifica se lo SLA e stato soddisfatto; in caso negativo, avvia la procedura di escalation
- **Business hours calculator:** Libreria `busi-hours` per calcolare il tempo lavorativo netto escludendo weekend, festivita (configurabili per tenant) e orari non lavorativi. Il timer viene ricalcolato a ogni cambio di stato del ticket (es. pausa quando il ticket passa a "waiting_for_customer")
- **Escalation chain:** Configurabile per tenant con N livelli. Ogni livello ha un destinatario (agente, team, ruolo) e un delay aggiuntivo. Notifiche via email, push notification (Web Push API) e in-app (Socket.IO)

### Elasticsearch per Knowledge Base

- **Indice:** `kb_articles_{tenantId}` con mapping dedicato per titolo (boost 2.0), contenuto (boost 1.0), tag (boost 1.5)
- **Analyzer:** Custom analyzer con filtro italiano (stemmer, stop words) + inglese. Supporto per sinonimi configurabili
- **Suggerimento contestuale:** Query `more_like_this` con il contenuto del ticket come input. Top 5 risultati con score > 0.3
- **Sincronizzazione:** Aggiornamento indice Elasticsearch sincrono alla creazione/modifica articolo. Reindex completo schedulato settimanalmente per consistenza
- **Fallback:** Se Elasticsearch non e disponibile, fallback su `tsvector` PostgreSQL per ricerca full-text base

### Chat Widget Architecture

- **Tecnologia:** Web Component (Custom Element + Shadow DOM) per isolamento completo
- **Comunicazione:** Socket.IO client con reconnection automatica e offline queue
- **Stato:** Persistenza conversazione in localStorage del dominio ospitante
- **Sizing:** Bundle < 50KB gzipped. Lazy loading delle dipendenze pesanti (emoji picker, file upload)
- **Accessibility:** WCAG 2.1 AA compliant. Navigazione da tastiera, screen reader support, contrasto colori

---

## Rischi

| ID | Rischio | Probabilita | Impatto | Mitigazione |
|----|---------|-------------|---------|-------------|
| R-06-01 | **Complessita SLA engine con business hours** - Il calcolo del tempo lavorativo con festivita, fusi orari e pause ticket e intrinsecamente complesso e soggetto a edge case | Alta | 🔴 Alto | Utilizzare libreria testata per business hours. Test unitari estensivi con casi limite (cambio ora legale, festivita mobili, ticket creato a cavallo di weekend). Logging dettagliato per debug |
| R-06-02 | **Performance Elasticsearch in produzione** - L'indicizzazione e la ricerca full-text potrebbero non scalare con volumi elevati di articoli e query | Media | 🟡 Medio | Dimensionamento corretto del cluster ES. Implementare caching delle query frequenti con Redis (TTL 5 min). Fallback su PostgreSQL tsvector se ES non disponibile |
| R-06-03 | **Widget chat - compatibilita cross-browser** - Shadow DOM e Web Components hanno supporto variabile su browser datati | Media | 🟡 Medio | Polyfill per browser legacy (IE11 escluso). Test automatizzati su Chrome, Firefox, Safari, Edge. Graceful degradation: se Web Components non supportati, mostra link al portale |
| R-06-04 | **Email threading non affidabile** - Alcuni client email non preservano gli header In-Reply-To/References, causando creazione di ticket duplicati invece di reply | Alta | 🟡 Medio | Implementare fallback: regex su subject per estrarre ticket ID (pattern `[Ticket #XXXX]`). Se nessun match, usare similarity check su contatto + oggetto per suggerire merge |
| R-06-05 | **Carico real-time su Socket.IO** - Con molti agenti e chat simultanee, il server Socket.IO potrebbe diventare un bottleneck | Media | 🔴 Alto | Architettura Socket.IO con adapter Redis per distribuzione su piu nodi. Sticky sessions su load balancer. Monitoraggio connessioni attive con alerting su soglia (> 1000 connessioni/nodo) |
| R-06-06 | **Survey fatigue** - Invio eccessivo di survey puo causare irritazione nei clienti e basso tasso di risposta | Bassa | 🟡 Medio | Throttling rigoroso: max 1 CSAT per settimana per contatto, max 1 NPS per trimestre. Opzione "Non chiedermelo piu" nel survey. Monitoraggio tasso di risposta con alert se scende sotto il 15% |

---

## Definition of Done (DoD)

1. Tutti i criteri di accettazione delle user story sono soddisfatti e verificabili con test manuali o automatizzati
2. Test unitari per la logica di business core (coverage >= 80% per: routing engine, SLA timer, business hours calculator, survey throttling)
3. Test di integrazione per le API REST di ticket, messaggi, KB e portale
4. Test E2E per i flussi critici: email -> ticket -> assegnazione -> risposta -> risoluzione -> survey
5. Widget chat testato su Chrome, Firefox, Safari e Edge (ultime 2 versioni)
6. SLA timer verificato con casi limite: weekend, festivita, cambio ora legale, ticket creato fuori orario
7. Elasticsearch indicizzazione e ricerca verificata con dataset di almeno 500 articoli
8. Performance: dashboard agente carica in < 2s con 100 ticket, ricerca KB restituisce risultati in < 500ms
9. Customer portal accessibile senza autenticazione CRM (autenticazione separata con magic link)
10. Notifiche email di aggiornamento ticket conformi a email threading standards (In-Reply-To, References headers)
11. Audit trail completo per ogni azione su ticket (creazione, assegnazione, cambio stato, merge, escalation)
12. Documentazione API Swagger aggiornata per tutti gli endpoint di supporto e portale
13. Code review completata da almeno un senior developer
14. Nessun warning TypeScript (`tsc --noEmit` passa senza errori su frontend e backend)
15. Traduzioni complete in italiano e inglese per tutte le stringhe UI (dashboard agente, portale, widget, survey)