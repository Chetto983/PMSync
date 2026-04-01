# Sistema Logico PMS --- Documento Integrato

## Obiettivo

Creare un sistema che **riconosce il contesto operativo** e collega
automaticamente mail, task, promemoria ed eventi, evitando duplicazioni
e mantenendo continuità operativa.

------------------------------------------------------------------------

# Principio di Semplificazione Operativa PMS

## Il problema da evitare

Se nella landing page o nell'interfaccia principale mostriamo:

-   sistema promemoria
-   sistema ticket
-   sistema CRM
-   sistema pipeline
-   sistema follow-up
-   sistema notifiche
-   sistema attività
-   sistema progetti

l'utente percepisce complessità.

Non importa se il sistema è potente.

Se sembra complesso, non verrà usato.

------------------------------------------------------------------------

## Il principio guida

L'utente non vuole gestire sistemi.

Vuole gestire il proprio lavoro.

Per questo motivo, l'interfaccia deve mostrare solo ciò che è naturale e
già familiare.

------------------------------------------------------------------------

# I quattro elementi fondamentali visibili all'utente

L'utente deve vedere solo questi elementi:

-   Calendario
-   Mail
-   Contatti
-   Task

Questi sono gli strumenti che ogni persona già conosce e utilizza.

Tutto il resto deve esistere nel sistema, ma non deve essere esposto
come modulo separato.

------------------------------------------------------------------------

# Tutto il resto deve autogestirsi

Questi elementi non devono essere strumenti manuali:

-   ticket
-   follow-up
-   promemoria automatici
-   pipeline
-   CRM
-   pratiche
-   notifiche operative
-   solleciti

Devono essere comportamenti automatici del sistema.

------------------------------------------------------------------------

# Regole automatiche complete di correlazione

## Regola madre

Due o più oggetti si correlano se condividono almeno uno tra:

-   Contatto
-   Azienda
-   Thread o conversazione
-   Tipo attività
-   Etichetta di contesto
-   Scadenza o finestra temporale
-   Intenzione operativa
-   Origine comune

------------------------------------------------------------------------

## Livelli di correlazione

### Livello 1 --- Correlazione forte

Condizioni:

-   stesso contatto
-   stessa conversazione
-   stesso progetto/pratica
-   stesso ticket

Effetto:

-   collegamento automatico diretto

------------------------------------------------------------------------

### Livello 2 --- Correlazione probabile

Condizioni:

-   stesso contatto + stessa attività
-   stessa azienda + stesso periodo
-   stesse etichette

Effetto:

-   collegamento automatico con verifica

------------------------------------------------------------------------

### Livello 3 --- Correlazione debole

Condizioni:

-   contesto simile
-   attività diverse ma correlate

Effetto:

-   suggerimento, non fusione

------------------------------------------------------------------------

# Diagramma architetturale PMS

CANALI INPUT

-   Email
-   Calendari
-   Telegram chatbot
-   Inserimento manuale
-   Rubrica / CSV

↓

LAYER DI ACQUISIZIONE

-   Parsing
-   Normalizzazione
-   Deduplicazione
-   Riconoscimento contatti

↓

MOTORE ETICHETTE

-   @ soggetto

-   \^ tipo attività

-   # stato

-   ! priorità

-   -   contesto

↓

MOTORE DI CORRELAZIONE

-   collega oggetti
-   evita duplicati
-   rileva conflitti

↓

MODELLO OPERATIVO CENTRALE

-   Contatti
-   Mail
-   Task
-   Promemoria
-   Eventi
-   Ticket
-   Pratiche

↓

INTERFACCIA PMS

-   Inbox
-   Agenda
-   Follow-up
-   Dashboard conflitti
-   Chatbot

------------------------------------------------------------------------

# Flusso reale dal primo giorno di utilizzo

## Fase 1 --- Collegamento strumenti

Utente:

-   collega email
-   collega calendario
-   importa contatti
-   collega Telegram

Sistema:

-   deduplica contatti
-   riconosce relazioni
-   crea base operativa

------------------------------------------------------------------------

## Fase 2 --- Definizione logica iniziale

Utente definisce poche regole essenziali:

-   domini clienti
-   parole chiave attività
-   tempi follow-up

Sistema memorizza la logica.

------------------------------------------------------------------------

## Fase 3 --- Uso reale

Arriva una mail.

Sistema:

-   riconosce contatto
-   assegna etichette
-   collega contesto
-   propone task
-   propone promemoria

------------------------------------------------------------------------

# Sintesi operativa finale

PMS non è un archivio.

È un sistema che:

-   capisce il contesto
-   collega informazioni
-   suggerisce azioni
-   mantiene continuità operativa
