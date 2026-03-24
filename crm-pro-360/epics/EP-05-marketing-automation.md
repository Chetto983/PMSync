# Epic EP-05: Marketing Automation

## Metadata

| Campo | Valore |
|-------|--------|
| **Epic ID** | EP-05 |
| **Titolo** | Marketing Automation |
| **Persona** | Laura (Marketing Manager) |
| **Fase** | 2 (Sprint 9-10) |
| **Story Points Totali** | ~92 SP |
| **Priorita Complessiva** | 🔴 Alta |
| **Dipendenze** | EP-01 (Contact Management), EP-03 (Lead Management) |

## Overview

Sistema completo di marketing automation che comprende: campaign builder drag-and-drop, workflow condizionali multi-step, email template engine con editor WYSIWYG, A/B testing per email e landing page, landing page builder, form tracking e progressive profiling, attribution modeling (first-touch, last-touch, multi-touch), integrazione con Google Ads, Meta Ads e LinkedIn Ads.

Laura, in qualita di Marketing Manager, necessita di uno strumento unificato per orchestrare campagne multi-canale, misurare l'efficacia di ogni touchpoint e ottimizzare il ROI pubblicitario senza dipendere dal team tecnico.

---

## User Stories

### US-054: Campaign Builder con Drag-and-Drop

**Come** Laura (Marketing Manager),
**voglio** creare campagne marketing tramite un'interfaccia drag-and-drop,
**in modo da** costruire flussi di comunicazione complessi senza competenze tecniche.

**Story Points:** 13
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 9
**Dipendenze:** Nessuna (story fondante dell'epic)

**Criteri di Accettazione:**

```gherkin
Scenario: Creazione di una nuova campagna
  Given Laura si trova nella sezione "Marketing > Campagne"
  When clicca su "Nuova Campagna"
  Then viene visualizzato il canvas drag-and-drop con la toolbar laterale dei componenti
  And i componenti disponibili includono: Email, SMS, Wait, Condition, Action, Goal

Scenario: Aggiunta di un nodo al flusso
  Given Laura ha il canvas della campagna aperto
  When trascina un componente "Email" dalla toolbar al canvas
  Then il nodo viene posizionato nel canvas con un connettore automatico al nodo precedente
  And il pannello di configurazione del nodo si apre sulla destra

Scenario: Collegamento tra nodi
  Given Laura ha almeno due nodi nel canvas
  When trascina una connessione dall'output di un nodo all'input di un altro
  Then viene creato un collegamento visivo con una freccia direzionale
  And il flusso viene validato in tempo reale mostrando eventuali errori

Scenario: Salvataggio bozza campagna
  Given Laura ha configurato almeno un nodo nel canvas
  When clicca "Salva Bozza"
  Then la campagna viene salvata con stato "draft"
  And un messaggio di conferma viene mostrato con timestamp dell'ultimo salvataggio

Scenario: Attivazione campagna
  Given Laura ha una campagna con tutti i nodi configurati e validati
  When clicca "Attiva Campagna"
  Then il sistema verifica che tutti i nodi abbiano configurazione completa
  And la campagna passa allo stato "active"
  And i contatti nell'audience iniziano a ricevere i messaggi secondo il flusso definito
```

---

### US-055: Workflow Condizionali Multi-Step

**Come** Laura (Marketing Manager),
**voglio** definire workflow con condizioni if/else, attese temporali e azioni automatiche,
**in modo da** personalizzare il percorso di ogni contatto in base al suo comportamento.

**Story Points:** 13
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 9
**Dipendenze:** US-054 (Campaign Builder)

**Criteri di Accettazione:**

```gherkin
Scenario: Aggiunta di una condizione if/else
  Given Laura sta modificando un flusso campagna nel canvas
  When trascina un nodo "Condition" nel flusso
  Then il nodo mostra due rami: "Si" e "No"
  And il pannello di configurazione permette di scegliere la condizione tra:
    | Tipo Condizione          | Esempio                        |
    | Email aperta             | "Ha aperto email X"            |
    | Link cliccato            | "Ha cliccato link Y"           |
    | Proprieta contatto       | "Settore = Technology"         |
    | Score lead               | "Score > 50"                   |
    | Tag presente             | "Ha tag 'VIP'"                 |

Scenario: Configurazione nodo Wait
  Given Laura ha aggiunto un nodo "Wait" al flusso
  When configura il nodo con "Attendi 3 giorni"
  Then il nodo mostra l'icona di attesa con il timer "3g"
  And i contatti che raggiungono quel nodo vengono messi in pausa per 72 ore

Scenario: Azione automatica su condizione soddisfatta
  Given un contatto raggiunge un nodo condizione "Ha aperto email precedente"
  When il contatto ha effettivamente aperto l'email
  Then il contatto procede lungo il ramo "Si"
  And viene eseguita l'azione configurata (es. invio email follow-up)

Scenario: Contatto che non soddisfa la condizione
  Given un contatto raggiunge un nodo condizione "Ha cliccato link CTA"
  When il contatto NON ha cliccato il link entro il periodo di valutazione
  Then il contatto procede lungo il ramo "No"
  And viene eseguita l'azione alternativa (es. invio reminder)

Scenario: Workflow con nodi annidati
  Given Laura ha un flusso con una condizione che porta a un'altra condizione
  When salva il flusso con 3 livelli di profondita
  Then il sistema accetta il flusso senza errori
  And il rendering visivo mantiene la leggibilita con auto-layout
```

---

### US-056: Email Template Editor WYSIWYG

**Come** Laura (Marketing Manager),
**voglio** creare e modificare template email con un editor visuale WYSIWYG,
**in modo da** produrre email professionali senza scrivere codice HTML.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 9
**Dipendenze:** Nessuna

**Criteri di Accettazione:**

```gherkin
Scenario: Apertura editor con template vuoto
  Given Laura accede alla sezione "Marketing > Template Email"
  When clicca "Nuovo Template"
  Then viene aperto l'editor WYSIWYG con un canvas vuoto
  And la toolbar include: testo, immagine, bottone, divisore, colonne, HTML custom, social links

Scenario: Drag-and-drop blocchi nel template
  Given Laura ha l'editor WYSIWYG aperto
  When trascina un blocco "Testo" nel canvas
  Then il blocco viene inserito nella posizione indicata
  And il testo e modificabile inline con formattazione rich-text (grassetto, corsivo, link, colore)

Scenario: Inserimento variabili di personalizzazione
  Given Laura sta modificando un blocco di testo
  When digita "{{" nel campo di testo
  Then appare un dropdown con le variabili disponibili:
    | Variabile            | Esempio Output     |
    | {{contact.firstName}}| "Laura"            |
    | {{contact.company}}  | "Acme Corp"        |
    | {{contact.email}}    | "laura@acme.com"   |
    | {{unsubscribe_link}} | "[link]"           |

Scenario: Anteprima responsive
  Given Laura ha completato il design del template
  When clicca "Anteprima"
  Then viene mostrata la preview del template in tre modalita: Desktop, Tablet, Mobile
  And le dimensioni del canvas si adattano al dispositivo selezionato

Scenario: Salvataggio template riutilizzabile
  Given Laura ha completato un template
  When inserisce nome "Newsletter Q1 2026" e clicca "Salva"
  Then il template viene salvato nella libreria con thumbnail automatica
  And il template e disponibile per la selezione nelle campagne email
```

---

### US-057: A/B Testing per Campagne Email

**Come** Laura (Marketing Manager),
**voglio** eseguire A/B test sulle email delle campagne (oggetto, contenuto, CTA),
**in modo da** identificare la variante piu performante e massimizzare i tassi di apertura e click.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 10
**Dipendenze:** US-054, US-056

**Criteri di Accettazione:**

```gherkin
Scenario: Creazione test A/B sull'oggetto email
  Given Laura sta configurando un nodo Email nel campaign builder
  When attiva l'opzione "A/B Test"
  Then viene mostrato il pannello di configurazione A/B con campi per Variante A e Variante B
  And Laura puo inserire due oggetti diversi per l'email

Scenario: Configurazione split e durata del test
  Given Laura ha configurato le varianti A e B
  When imposta la distribuzione al 20% del pubblico (10% A, 10% B)
  And imposta la durata del test a 24 ore
  Then il sistema mostra un riepilogo: "Il test verra eseguito su 20% dell'audience per 24h"
  And il restante 80% ricevera la variante vincente

Scenario: Determinazione variante vincente
  Given un test A/B e in corso da 24 ore
  When il periodo di test termina
  Then il sistema calcola la significativita statistica (p-value < 0.05)
  And la variante con il tasso di apertura/click piu alto viene selezionata come vincente
  And il restante 80% dell'audience riceve la variante vincente

Scenario: Test senza significativita statistica
  Given un test A/B e terminato
  When la differenza tra le varianti non raggiunge significativita statistica (p-value >= 0.05)
  Then il sistema notifica Laura con "Risultati non conclusivi"
  And Laura puo scegliere manualmente quale variante inviare o estendere il test

Scenario: Report risultati A/B test
  Given un test A/B e completato
  When Laura accede ai risultati del test
  Then viene mostrata una tabella comparativa con:
    | Metrica        | Variante A | Variante B | Vincente |
    | Tasso apertura | 22.3%      | 28.1%      | B        |
    | Tasso click    | 3.2%       | 4.7%       | B        |
    | Conversioni    | 12         | 18         | B        |
  And viene mostrato il livello di confidenza statistica
```

---

### US-058: Landing Page Builder Drag-and-Drop

**Come** Laura (Marketing Manager),
**voglio** creare landing page tramite un builder visuale drag-and-drop,
**in modo da** pubblicare pagine di atterraggio per le campagne senza intervento degli sviluppatori.

**Story Points:** 13
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 10
**Dipendenze:** US-054

**Criteri di Accettazione:**

```gherkin
Scenario: Creazione landing page da template
  Given Laura accede a "Marketing > Landing Pages"
  When clicca "Nuova Landing Page"
  Then viene mostrata una galleria di template predefiniti categorizzati per tipo:
    | Categoria     | Esempi                    |
    | Lead Capture  | Webinar signup, Ebook     |
    | Prodotto      | Product launch, Feature   |
    | Evento        | Conference, Workshop      |
    | Thank You     | Post-download, Post-signup|

Scenario: Personalizzazione sezioni della pagina
  Given Laura ha selezionato un template
  When modifica una sezione tramite l'editor inline
  Then puo cambiare testo, immagini, colori e layout
  And ogni modifica viene riflessa in tempo reale nel canvas

Scenario: Aggiunta form alla landing page
  Given Laura sta costruendo una landing page
  When trascina un componente "Form" nel canvas
  Then viene mostrato il form builder con campi configurabili (nome, email, telefono, custom fields)
  And il form e collegabile a una lista contatti o campagna esistente

Scenario: Pubblicazione landing page
  Given Laura ha completato il design della landing page
  When clicca "Pubblica" e inserisce lo slug URL "webinar-q1-2026"
  Then la pagina viene pubblicata all'URL configurato
  And viene generato un certificato SSL automatico
  And la pagina e accessibile pubblicamente entro 60 secondi

Scenario: Anteprima e test form
  Given Laura ha una landing page con un form
  When clicca "Anteprima e Test"
  Then la pagina viene aperta in una nuova tab in modalita preview
  And Laura puo compilare il form in modalita test senza creare contatti reali
```

---

### US-059: Form Tracking con Progressive Profiling

**Come** Laura (Marketing Manager),
**voglio** tracciare le compilazioni dei form e raccogliere dati progressivamente ad ogni interazione,
**in modo da** arricchire il profilo dei contatti senza chiedere troppe informazioni in una sola volta.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 10
**Dipendenze:** US-058 (Landing Page Builder), EP-01 (Contact Management)

**Criteri di Accettazione:**

```gherkin
Scenario: Prima compilazione form - campi base
  Given un visitatore anonimo arriva sulla landing page
  When compila il form con nome, cognome e email
  Then viene creato un nuovo contatto nel CRM con i dati inseriti
  And viene registrato l'evento "form_submission" con timestamp e URL sorgente

Scenario: Compilazione successiva - campi progressivi
  Given un contatto gia registrato (riconosciuto tramite cookie o email) arriva su un'altra landing page
  When il form viene renderizzato
  Then i campi gia noti (nome, email) sono pre-compilati e nascosti
  And vengono mostrati nuovi campi non ancora raccolti: azienda, ruolo, telefono
  And il contatto vede massimo 3-4 campi per compilazione

Scenario: Configurazione regole progressive profiling
  Given Laura sta configurando un form nel builder
  When accede alle "Impostazioni Progressive Profiling"
  Then puo definire l'ordine di priorita dei campi da raccogliere
  And puo impostare il numero massimo di campi visibili per sessione (default: 4)
  And puo escludere campi specifici dal profiling progressivo

Scenario: Tracciamento eventi form
  Given un form e pubblicato su una landing page
  When un visitatore interagisce con il form
  Then vengono tracciati gli eventi: form_view, form_start, field_focus, form_submit, form_abandon
  And ogni evento include timestamp, dispositivo e referrer

Scenario: Dashboard form analytics
  Given Laura accede alla sezione "Form Analytics" di una landing page
  When visualizza le metriche
  Then vengono mostrati: tasso di conversione, tempo medio di compilazione, campo con maggior abbandono
  And i dati sono filtrabili per periodo temporale
```

---

### US-060: Attribution Modeling

**Come** Laura (Marketing Manager),
**voglio** analizzare l'attribuzione delle conversioni con modelli first-touch, last-touch e multi-touch,
**in modo da** capire quali canali e campagne contribuiscono maggiormente alle vendite.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 10
**Dipendenze:** US-054, US-061

**Criteri di Accettazione:**

```gherkin
Scenario: Visualizzazione modello first-touch
  Given Laura accede a "Marketing > Attribution"
  When seleziona il modello "First Touch"
  Then il 100% del credito di conversione viene assegnato al primo touchpoint
  And viene mostrata una tabella con canali ordinati per numero di conversioni attribuite

Scenario: Visualizzazione modello last-touch
  Given Laura seleziona il modello "Last Touch"
  When visualizza i risultati
  Then il 100% del credito viene assegnato all'ultimo touchpoint prima della conversione
  And i dati sono confrontabili side-by-side con il modello first-touch

Scenario: Modello multi-touch lineare
  Given Laura seleziona il modello "Multi-Touch Lineare"
  When un contatto ha avuto 4 touchpoints prima della conversione
  Then ogni touchpoint riceve il 25% del credito
  And il report mostra la distribuzione del credito per canale

Scenario: Modello multi-touch time-decay
  Given Laura seleziona il modello "Multi-Touch Time Decay"
  When un contatto ha avuto touchpoints distribuiti su 30 giorni
  Then i touchpoints piu recenti ricevono una percentuale di credito maggiore
  And viene applicato un decadimento esponenziale con half-life di 7 giorni

Scenario: Confronto modelli di attribuzione
  Given Laura ha dati di conversione sufficienti (almeno 100 conversioni)
  When accede alla vista "Confronto Modelli"
  Then viene mostrata una tabella comparativa con tutti i modelli per ogni canale
  And un grafico a barre sovrapposto evidenzia le differenze di attribuzione tra modelli
```

---

### US-061: Campaign Analytics Dashboard

**Come** Laura (Marketing Manager),
**voglio** una dashboard con metriche dettagliate sulle campagne (open rate, click rate, conversioni),
**in modo da** monitorare le performance in tempo reale e prendere decisioni data-driven.

**Story Points:** 5
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 9
**Dipendenze:** US-054

**Criteri di Accettazione:**

```gherkin
Scenario: Visualizzazione metriche campagna attiva
  Given Laura accede alla dashboard di una campagna attiva
  When la pagina viene caricata
  Then vengono mostrate le metriche principali in card riassuntive:
    | Metrica             | Esempio   |
    | Email Inviate       | 12,450    |
    | Tasso Apertura      | 24.3%     |
    | Tasso Click         | 3.8%      |
    | Tasso Conversione   | 1.2%      |
    | Tasso Disiscrizione | 0.3%      |
    | Bounce Rate         | 1.1%      |

Scenario: Grafico andamento temporale
  Given Laura sta visualizzando la dashboard di una campagna
  When seleziona il tab "Andamento"
  Then viene mostrato un grafico a linee con aperture e click nel tempo
  And Laura puo selezionare il range temporale: 7g, 30g, 90g, custom

Scenario: Heatmap click nell'email
  Given una campagna email ha ricevuto almeno 100 click
  When Laura clicca su "Mappa Click"
  Then viene mostrata l'anteprima dell'email con overlay heatmap sui link cliccati
  And ogni link mostra il numero di click e la percentuale sul totale

Scenario: Filtro per segmento
  Given Laura sta analizzando i risultati di una campagna
  When applica un filtro per segmento (es. "Settore = Technology")
  Then tutte le metriche vengono ricalcolate per il segmento selezionato
  And Laura puo confrontare le performance tra segmenti diversi

Scenario: Export report campagna
  Given Laura sta visualizzando la dashboard
  When clicca "Esporta Report"
  Then viene generato un file PDF con tutte le metriche, grafici e tabelle
  And il file viene scaricato automaticamente
```

---

### US-062: Audience Segmentation per Campagne

**Come** Laura (Marketing Manager),
**voglio** creare segmenti di audience basati su criteri demografici, comportamentali e di engagement,
**in modo da** targetizzare le campagne verso i contatti piu rilevanti.

**Story Points:** 5
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 9
**Dipendenze:** EP-01 (Contact Management)

**Criteri di Accettazione:**

```gherkin
Scenario: Creazione segmento con criteri multipli
  Given Laura accede a "Marketing > Segmenti"
  When clicca "Nuovo Segmento" e configura i criteri:
    | Criterio         | Operatore      | Valore        |
    | Settore          | uguale a       | Technology    |
    | Lead Score       | maggiore di    | 50            |
    | Ultima attivita  | negli ultimi   | 30 giorni     |
  Then il sistema calcola in tempo reale il numero di contatti che soddisfano i criteri
  And il conteggio viene aggiornato ad ogni modifica dei criteri

Scenario: Segmento dinamico vs statico
  Given Laura sta creando un segmento
  When seleziona il tipo "Dinamico"
  Then il segmento viene ricalcolato automaticamente ogni 6 ore
  And i nuovi contatti che soddisfano i criteri vengono inclusi automaticamente

Scenario: Utilizzo segmento in campagna
  Given Laura sta configurando l'audience di una campagna
  When seleziona il segmento "Enterprise Tech > 50 score"
  Then il sistema mostra il numero di contatti nel segmento
  And la campagna viene inviata solo ai contatti del segmento selezionato

Scenario: Esclusione segmento
  Given Laura sta configurando l'audience
  When aggiunge un segmento di esclusione "Gia clienti"
  Then i contatti presenti nel segmento di esclusione vengono rimossi dall'audience finale
  And il conteggio finale riflette la sottrazione

Scenario: Preview contatti nel segmento
  Given Laura ha definito i criteri di un segmento
  When clicca "Anteprima Contatti"
  Then viene mostrata una tabella con i primi 50 contatti che soddisfano i criteri
  And la tabella mostra nome, email, azienda e lead score
```

---

### US-063: Email Scheduling e Throttling

**Come** Laura (Marketing Manager),
**voglio** programmare l'invio delle email in orari specifici e gestire il throttling,
**in modo da** massimizzare i tassi di apertura e proteggere la reputazione del dominio.

**Story Points:** 5
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 10
**Dipendenze:** US-054, US-056

**Criteri di Accettazione:**

```gherkin
Scenario: Programmazione invio in data e ora specifiche
  Given Laura sta attivando una campagna email
  When seleziona "Programma Invio" e imposta data 15/04/2026 ore 09:00 CET
  Then la campagna viene schedulata per la data e ora specificate
  And viene mostrato un countdown all'invio nella dashboard

Scenario: Invio ottimizzato per timezone
  Given Laura attiva l'opzione "Ottimizza per timezone del contatto"
  When la campagna viene eseguita
  Then ogni contatto riceve l'email alle 09:00 nel proprio fuso orario
  And l'invio viene distribuito su un arco di 24 ore per coprire tutti i fusi

Scenario: Configurazione throttling
  Given Laura configura il throttling della campagna
  When imposta il limite a 500 email/ora
  Then il sistema invia massimo 500 email ogni ora
  And una barra di progresso mostra l'avanzamento dell'invio nella dashboard

Scenario: Pausa e ripresa invio
  Given una campagna e in fase di invio con throttling attivo
  When Laura clicca "Pausa Invio"
  Then l'invio viene sospeso immediatamente
  And Laura puo riprendere l'invio cliccando "Riprendi"
  And i contatti gia serviti non ricevono duplicati

Scenario: Smart Send Time
  Given Laura attiva l'opzione "Smart Send Time"
  When il sistema analizza lo storico di aperture del contatto
  Then ogni email viene inviata nell'orario in cui il contatto apre piu frequentemente le email
  And se non ci sono dati storici, viene usato l'orario di default (09:00 locale)
```

---

### US-064: Integrazione Google/Meta/LinkedIn Ads

**Come** Laura (Marketing Manager),
**voglio** integrare le piattaforme pubblicitarie Google Ads, Meta Ads e LinkedIn Ads,
**in modo da** sincronizzare le audience e tracciare le conversioni cross-canale.

**Story Points:** 8
**Priorita:** 🟢 Bassa
**Sprint Target:** Sprint 10
**Dipendenze:** US-060, US-062

**Criteri di Accettazione:**

```gherkin
Scenario: Connessione account Google Ads
  Given Laura accede a "Impostazioni > Integrazioni > Google Ads"
  When clicca "Connetti" e completa il flusso OAuth2
  Then l'account Google Ads viene collegato con status "Connesso"
  And viene mostrato il nome dell'account e l'ID cliente

Scenario: Sincronizzazione audience verso Google Ads
  Given Laura ha un segmento "High Value Leads" con 5.000 contatti
  When seleziona "Sincronizza con Google Ads" e sceglie il tipo "Customer Match"
  Then gli indirizzi email del segmento vengono caricati come audience su Google Ads
  And la sincronizzazione viene schedulata ogni 24 ore per mantenere l'allineamento

Scenario: Connessione Meta Ads
  Given Laura accede a "Impostazioni > Integrazioni > Meta Ads"
  When completa il flusso OAuth2 con Facebook Business Manager
  Then l'account Meta Ads viene collegato
  And Laura puo selezionare il Pixel ID per il tracking delle conversioni

Scenario: Importazione lead da LinkedIn Lead Gen Forms
  Given Laura ha collegato il proprio account LinkedIn Ads
  When un utente compila un Lead Gen Form su LinkedIn
  Then il lead viene automaticamente importato nel CRM entro 15 minuti
  And viene creato un contatto con source "LinkedIn Ads" e campaign ID associato

Scenario: Dashboard cross-canale
  Given Laura ha almeno due piattaforme ads collegate
  When accede a "Marketing > Ads Performance"
  Then viene mostrata una tabella unificata con metriche per canale:
    | Canale       | Spesa   | Impression | Click | CPC   | Conversioni | CPA    |
    | Google Ads   | €2,500  | 150K       | 3,200 | €0.78 | 45          | €55.56 |
    | Meta Ads     | €1,800  | 200K       | 2,100 | €0.86 | 32          | €56.25 |
    | LinkedIn Ads | €3,200  | 80K        | 1,500 | €2.13 | 28          | €114.29|
```

---

### US-065: Unsubscribe Management GDPR-Compliant

**Come** Laura (Marketing Manager),
**voglio** gestire le disiscrizioni in modo conforme al GDPR con preference center,
**in modo da** rispettare la normativa e mantenere la fiducia dei contatti.

**Story Points:** 5
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 9
**Dipendenze:** US-056

**Criteri di Accettazione:**

```gherkin
Scenario: Link di disiscrizione in ogni email
  Given una email di campagna viene generata
  When il template viene renderizzato
  Then il link di disiscrizione viene automaticamente inserito nel footer
  And il link include il header List-Unsubscribe conforme a RFC 8058
  And il link e unico per ogni destinatario (token firmato)

Scenario: One-click unsubscribe
  Given un destinatario riceve un'email di campagna
  When clicca il link "Disiscriviti"
  Then viene reindirizzato alla pagina di conferma disiscrizione
  And con un singolo click viene rimosso da tutte le comunicazioni marketing
  And la disiscrizione viene processata entro 10 secondi

Scenario: Preference Center
  Given un contatto accede al preference center tramite il link nell'email
  When la pagina viene caricata
  Then il contatto puo gestire le proprie preferenze per categoria:
    | Categoria           | Stato      |
    | Newsletter          | Iscritto   |
    | Promozioni          | Iscritto   |
    | Aggiornamenti prod. | Discritto  |
    | Eventi              | Iscritto   |
  And il contatto puo disiscriversi da categorie specifiche senza rimuoversi da tutte

Scenario: Suppression list globale
  Given un contatto si e disiscritto da tutte le comunicazioni
  When Laura crea una nuova campagna
  Then il contatto NON viene incluso nell'audience, indipendentemente dai criteri di segmento
  And il sistema mostra il conteggio dei contatti esclusi per disiscrizione

Scenario: Audit trail disiscrizioni
  Given un contatto ha modificato le proprie preferenze
  When Laura accede al profilo del contatto > "Storico Consensi"
  Then viene mostrato l'elenco completo delle azioni con timestamp, IP, metodo e preferenza modificata
  And i dati sono conservati per almeno 5 anni come richiesto dal GDPR
```

---

## Task Breakdown

### Campaign Builder (US-054, US-055)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0300 | Progettare schema DB per campagne (campaigns, campaign_nodes, campaign_edges, campaign_executions) | 6 | Backend Dev | US-054 |
| T-0301 | Implementare API CRUD campagne (POST, GET, PUT, DELETE /campaigns) | 8 | Backend Dev | US-054 |
| T-0302 | Implementare engine di esecuzione workflow con state machine | 12 | Backend Dev | US-055 |
| T-0303 | Implementare nodi condizionali (if/else evaluator con expression parser) | 8 | Backend Dev | US-055 |
| T-0304 | Implementare nodo Wait con scheduler (BullMQ delayed jobs) | 6 | Backend Dev | US-055 |
| T-0305 | Implementare nodo Action (update contact, add tag, notify) | 6 | Backend Dev | US-055 |
| T-0306 | Sviluppare componente canvas React con react-flow | 12 | Frontend Dev | US-054 |
| T-0307 | Sviluppare toolbar componenti drag-and-drop | 6 | Frontend Dev | US-054 |
| T-0308 | Sviluppare pannello configurazione nodo (sidebar destra) | 8 | Frontend Dev | US-054 |
| T-0309 | Implementare validazione flusso in tempo reale (frontend) | 4 | Frontend Dev | US-054 |
| T-0310 | Implementare auto-layout per flussi complessi (dagre algorithm) | 4 | Frontend Dev | US-055 |

### Email Template Editor (US-056)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0311 | Integrare editor WYSIWYG (GrapeJS o Unlayer React) | 10 | Frontend Dev | US-056 |
| T-0312 | Sviluppare libreria blocchi predefiniti (testo, immagine, bottone, colonne) | 8 | Frontend Dev | US-056 |
| T-0313 | Implementare sistema variabili personalizzazione con autocomplete | 4 | Frontend Dev | US-056 |
| T-0314 | Implementare rendering template server-side (MJML -> HTML) | 6 | Backend Dev | US-056 |
| T-0315 | Implementare anteprima responsive (desktop, tablet, mobile) | 4 | Frontend Dev | US-056 |
| T-0316 | Implementare API template CRUD e libreria template | 4 | Backend Dev | US-056 |

### A/B Testing (US-057)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0317 | Progettare schema DB per A/B test (ab_tests, ab_variants, ab_results) | 3 | Backend Dev | US-057 |
| T-0318 | Implementare logica di split audience e random assignment | 4 | Backend Dev | US-057 |
| T-0319 | Implementare calcolo significativita statistica (chi-squared test) | 6 | Backend Dev | US-057 |
| T-0320 | Implementare auto-selection variante vincente con job schedulato | 4 | Backend Dev | US-057 |
| T-0321 | Sviluppare UI configurazione A/B test nel campaign builder | 6 | Frontend Dev | US-057 |
| T-0322 | Sviluppare UI report risultati A/B con grafici comparativi | 6 | Frontend Dev | US-057 |

### Landing Page Builder (US-058, US-059)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0323 | Progettare schema DB per landing pages (landing_pages, page_sections, form_submissions) | 4 | Backend Dev | US-058 |
| T-0324 | Implementare API CRUD landing pages e pubblicazione | 6 | Backend Dev | US-058 |
| T-0325 | Implementare serving landing pages con SSL automatico (reverse proxy config) | 8 | DevOps | US-058 |
| T-0326 | Sviluppare landing page builder React (GrapeJS page mode) | 12 | Frontend Dev | US-058 |
| T-0327 | Sviluppare galleria template landing page (6 template base) | 8 | Frontend Dev + Designer | US-058 |
| T-0328 | Implementare form builder con campi configurabili | 6 | Frontend Dev | US-059 |
| T-0329 | Implementare logica progressive profiling (campo priorita + contact matching) | 8 | Backend Dev | US-059 |
| T-0330 | Implementare tracking eventi form (view, start, focus, submit, abandon) | 4 | Backend Dev | US-059 |
| T-0331 | Sviluppare dashboard form analytics | 6 | Frontend Dev | US-059 |

### Attribution & Analytics (US-060, US-061, US-062)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0332 | Progettare schema tracking touchpoints (touchpoints table con contact_id, channel, campaign_id, timestamp) | 4 | Backend Dev | US-060 |
| T-0333 | Implementare modelli di attribuzione (first-touch, last-touch, linear, time-decay) | 10 | Backend Dev | US-060 |
| T-0334 | Sviluppare UI attribution report con confronto modelli | 8 | Frontend Dev | US-060 |
| T-0335 | Sviluppare campaign analytics dashboard (metriche, grafici, heatmap) | 10 | Frontend Dev | US-061 |
| T-0336 | Implementare API metriche campagna con aggregazioni real-time | 6 | Backend Dev | US-061 |
| T-0337 | Implementare click heatmap overlay su template email | 6 | Frontend Dev | US-061 |
| T-0338 | Implementare export report PDF (Puppeteer/html-pdf) | 4 | Backend Dev | US-061 |
| T-0339 | Implementare motore segmentazione audience con query builder | 8 | Backend Dev | US-062 |
| T-0340 | Implementare segmenti dinamici con refresh schedulato (cron ogni 6h) | 4 | Backend Dev | US-062 |
| T-0341 | Sviluppare UI segment builder con conteggio real-time | 8 | Frontend Dev | US-062 |

### Scheduling, Ads, GDPR (US-063, US-064, US-065)

| ID | Task | Ore | Ruolo | Story |
|----|------|-----|-------|-------|
| T-0342 | Implementare email scheduler con timezone awareness | 6 | Backend Dev | US-063 |
| T-0343 | Implementare throttling engine (rate limiter con BullMQ) | 4 | Backend Dev | US-063 |
| T-0344 | Implementare Smart Send Time (analisi storico aperture per contatto) | 6 | Backend Dev | US-063 |
| T-0345 | Sviluppare UI scheduling e throttling nel campaign builder | 4 | Frontend Dev | US-063 |
| T-0346 | Implementare integrazione Google Ads API (OAuth2, Customer Match, conversions) | 10 | Backend Dev | US-064 |
| T-0347 | Implementare integrazione Meta Marketing API (audiences, pixel, conversions) | 10 | Backend Dev | US-064 |
| T-0348 | Implementare integrazione LinkedIn Marketing API (Lead Gen Forms, audiences) | 8 | Backend Dev | US-064 |
| T-0349 | Sviluppare UI connessione ads e dashboard cross-canale | 8 | Frontend Dev | US-064 |
| T-0350 | Implementare preference center (pagina pubblica con token firmato) | 6 | Backend Dev | US-065 |
| T-0351 | Implementare one-click unsubscribe con RFC 8058 List-Unsubscribe header | 4 | Backend Dev | US-065 |
| T-0352 | Implementare suppression list globale e filtro audience | 3 | Backend Dev | US-065 |
| T-0353 | Implementare audit trail consensi (GDPR retention 5 anni) | 4 | Backend Dev | US-065 |
| T-0354 | Sviluppare UI preference center e pagina disiscrizione | 6 | Frontend Dev | US-065 |

**Totale Task:** 53
**Totale Ore Stimate:** ~368 ore

---

## Technical Design Notes

### Email Delivery

- **Provider primario:** SendGrid HTTP API (non SMTP, per compatibilita con ambienti cloud che bloccano porta 25)
- **Provider fallback:** Amazon SES come failover automatico
- **Bounce handling:** Webhook SendGrid per bounce, complaint e unsubscribe. Aggiornamento automatico stato contatto
- **Warm-up dominio:** Throttling automatico progressivo per nuovi domini (100/giorno -> 1000/giorno -> 10000/giorno su 4 settimane)
- **SPF/DKIM/DMARC:** Configurazione guidata con verifica DNS automatica

### Template Rendering

- **Editor frontend:** GrapeJS (open-source) o Unlayer React SDK (commercial) per l'editor WYSIWYG
- **Formato sorgente:** MJML per la definizione dei template (responsive by design)
- **Rendering pipeline:** MJML -> HTML -> Variabili sostituite -> Inlining CSS -> HTML finale
- **Personalizzazione:** Handlebars-like syntax `{{contact.firstName}}` con fallback values
- **Anteprima:** Server-side rendering con Puppeteer per generare screenshot responsive

### A/B Testing - Significativita Statistica

- **Test utilizzato:** Chi-squared test per confronto proporzioni (open rate, click rate)
- **Soglia significativita:** p-value < 0.05 (95% di confidenza)
- **Sample size minimo:** Calcolato con formula di Cochran, minimo 200 contatti per variante
- **Early stopping:** Nessun early stopping per evitare false positive (peeking problem). Si attende la durata configurata
- **Power analysis:** Minimo 80% statistical power. Se l'audience e troppo piccola, il sistema avvisa Laura

### Campaign Execution Engine

- **State machine:** Ogni contatto ha uno stato nel workflow (node_id, status, entered_at)
- **Processamento:** BullMQ workers con concurrency configurabile per tenant
- **Retry policy:** 3 tentativi con exponential backoff per errori transitori (es. SendGrid timeout)
- **Rate limiting:** Per-tenant e per-campaign per proteggere la reputazione del dominio
- **Idempotenza:** Ogni esecuzione ha un idempotency_key per prevenire invii duplicati

---

## Rischi

| ID | Rischio | Probabilita | Impatto | Mitigazione |
|----|---------|-------------|---------|-------------|
| R-05-01 | **Deliverability email scarsa** - Le email finiscono in spam a causa di configurazione DNS errata o reputazione dominio bassa | Media | 🔴 Alto | Implementare warm-up graduale del dominio, verifica SPF/DKIM/DMARC guidata, monitoraggio reputazione con Google Postmaster Tools |
| R-05-02 | **Complessita editor WYSIWYG** - L'integrazione di GrapeJS/Unlayer potrebbe richiedere piu tempo del previsto per customizzazione e bug fixing | Alta | 🟡 Medio | Valutare POC con entrambi gli editor nella prima settimana di sprint. Scegliere quello con miglior DX e documentazione |
| R-05-03 | **Limiti API piattaforme Ads** - Rate limiting aggressivo e cambiamenti breaking nelle API Google/Meta/LinkedIn | Media | 🟡 Medio | Implementare caching delle risposte, retry con backoff, monitoraggio changelog API. Disaccoppiare integrazione ads dal core |
| R-05-04 | **Conformita GDPR insufficiente** - Rischio di sanzioni se il preference center o l'audit trail non sono implementati correttamente | Bassa | 🔴 Alto | Review legale del flusso di disiscrizione prima del go-live. Audit trail immutabile con retention policy. Test con DPO |
| R-05-05 | **Performance A/B testing** - Calcolo significativita statistica in real-time su grandi dataset potrebbe causare lentezza | Bassa | 🟡 Medio | Pre-calcolare aggregazioni con materialized views o tabella di aggregazione aggiornata via trigger. Limiti campione ragionevoli |
| R-05-06 | **Costi SendGrid elevati** - Volume di email alto puo generare costi imprevisti | Media | 🟡 Medio | Monitoraggio budget mensile con alert automatici. Implementare fallback su Amazon SES per volumi elevati. Throttling per tenant |

---

## Definition of Done (DoD)

1. Tutti i criteri di accettazione delle user story sono soddisfatti e verificabili
2. Test unitari per la logica di business (coverage >= 80% per moduli core: workflow engine, A/B testing, attribution)
3. Test di integrazione per le API REST di campagne, template e segmenti
4. Test E2E per il flusso completo: creazione campagna -> configurazione -> attivazione -> ricezione email
5. Email template renderizzati correttamente su client principali: Gmail, Outlook, Apple Mail (verificato con Litmus/Email on Acid)
6. Performance: campaign builder carica in < 2s con 50 nodi, dashboard analytics carica in < 3s
7. GDPR compliance verificata: link disiscrizione presente, preference center funzionante, audit trail completo
8. Throttling e rate limiting testati sotto carico (simulazione 10.000 email/ora)
9. Documentazione API aggiornata su Swagger per tutti gli endpoint marketing
10. Review di sicurezza: token di disiscrizione firmati (HMAC), nessun dato sensibile esposto nelle landing page pubbliche
11. Integrazioni Ads testate con account sandbox (Google Ads test account, Meta test app)
12. Code review completata da almeno un senior developer
13. Nessun warning TypeScript (`tsc --noEmit` passa senza errori su frontend e backend)
14. Traduzioni complete in italiano e inglese per tutte le stringhe UI