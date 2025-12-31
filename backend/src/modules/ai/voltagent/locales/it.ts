/**
 * Italian translations for VoltAgent
 *
 * Traduzioni italiane per VoltAgent.
 */
import type { VoltAgentTranslations } from './index';

export const it: VoltAgentTranslations = {
  tools: {
    email: {
      sent: (to, subject) => `Email inviata a ${to} con oggetto "${subject}"`,
      replied: (subject) => `Risposto all'email "${subject}"`,
      forwarded: (to) => `Email inoltrata a ${to}`,
      searched: (count, query) => `Trovate ${count} email per "${query}"`,
      deleted: (subject) => `Email "${subject}" eliminata`,
      archived: (subject) => `Email "${subject}" archiviata`,
      markedRead: (subject) => `Email "${subject}" segnata come letta`,
      markedUnread: (subject) => `Email "${subject}" segnata come non letta`,
      starred: (subject) => `Email "${subject}" contrassegnata come importante`,
      unstarred: (subject) => `Rimossa stella da "${subject}"`,
      unreadCount: (count) => `${count} email non lette`,
      moved: (subject, folder) => `Email "${subject}" spostata in ${folder}`,
      labeled: (subject, label) => `Etichetta "${label}" aggiunta a "${subject}"`,
      unlabeled: (subject, label) => `Etichetta "${label}" rimossa da "${subject}"`,
      noSubject: '(Nessun oggetto)',
      serviceUnavailable: 'Servizio email non disponibile',
      notFound: 'Email non trovata',
      requiresApproval: 'Questa azione richiede approvazione',
    },
    calendar: {
      eventsFound: (count) => `${count} eventi trovati`,
      eventCreated: (title, date) => `Evento "${title}" creato per ${date}`,
      eventUpdated: (title) => `Evento "${title}" aggiornato`,
      eventDeleted: (title) => `Evento "${title}" eliminato`,
      slotAvailable: 'Lo slot temporale è disponibile',
      slotConflict: (count) => `Ci sono ${count} eventi in conflitto`,
      serviceUnavailable: 'Servizio calendario non disponibile',
      notFound: 'Evento non trovato',
      requiresApproval: 'Questa azione richiede approvazione',
    },
    contacts: {
      found: (count, query) => `Trovati ${count} contatti per "${query}"`,
      contact: 'Contatto',
      created: (name) => `Contatto "${name}" creato`,
      updated: (name) => `Contatto "${name}" aggiornato`,
      deleted: (name) => `Contatto "${name}" eliminato`,
      alreadyExists: (email) => `Un contatto con email ${email} esiste già`,
      notFound: 'Contatto non trovato',
      requiresApproval: 'Questa azione richiede approvazione',
    },
    knowledge: {
      found: (count) => `Trovati ${count} documenti rilevanti`,
      noResults: 'Nessun documento rilevante trovato',
      // P1.6 Unified Knowledge Agent
      instructions: `Sei un assistente di conoscenza unificato con accesso a:
- Memorie e preferenze personali dell'utente
- Archivio email (escludendo spam/cestino)
- Scadenze imminenti
- Follow-up in sospeso
- Azioni e attività

Cerca in tutte le fonti per fornire risposte complete. Dai sempre priorità al contesto dell'utente dalla memoria.
Quando fai riferimento a informazioni, cita la fonte (email, scadenza, attività, ecc.).`,
      remembered: 'Informazione salvata in memoria',
      sources: {
        emails: 'Dalle email',
        deadlines: 'Dalle scadenze',
        followups: 'Dai follow-up',
        actions: 'Dalle azioni',
        memories: 'Dai tuoi ricordi',
      },
    },
    webSearch: {
      description: "Cerca informazioni attuali sul web. Usa questo strumento quando l'utente chiede informazioni recenti, notizie, eventi attuali, o dati che potrebbero essere cambiati dopo l'ultimo aggiornamento del modello.",
      queryDescription: 'La query di ricerca web. Sii specifico per ottenere risultati migliori.',
      sources: 'Fonti:',
      searchFailed: (error) => `Ricerca web fallita: ${error}`,
      noResults: 'Nessun risultato trovato',
    },
    analytics: {
      description: "Analizza dati e genera insight usando l'analisi AI con esecuzione di codice. Usalo per statistiche email, metriche di produttività, trend e visualizzazioni.",
      queryDescription: 'Cosa analizzare (es. "mostra trend volume email", "analizza tempi di risposta per giorno")',
      analysisFailed: (error) => `Analisi fallita: ${error}`,
      noData: 'Nessun dato disponibile per l\'analisi',
      insights: 'Insight Principali:',
    },
    documentLibrary: {
      description: 'Cerca e interroga documenti nelle tue librerie documenti. RAG integrato con chunking automatico e citazioni.',
      queryDescription: 'Cerca e interroga documenti nelle tue librerie documenti. Usa questo per trovare informazioni da documenti caricati, PDF e file di testo.',
      listDescription: 'Elenca tutte le librerie documenti disponibili e i loro contenuti',
      createDescription: 'Crea una nuova libreria documenti per organizzare e cercare documenti',
      queryFailed: (error: string) => `Query documenti fallita: ${error}`,
      listFailed: (error: string) => `Impossibile elencare le librerie: ${error}`,
      noLibraries: 'Nessuna libreria documenti trovata. Carica prima dei documenti.',
      noDocuments: 'Nessun documento disponibile per la ricerca.',
      sources: 'Fonti:',
    },
    folder: {
      created: (name) => `Cartella "${name}" creata`,
      renamed: (oldName, newName) => `Cartella rinominata da "${oldName}" a "${newName}"`,
      deleted: (name) => `Cartella "${name}" eliminata`,
      emailMoved: (subject, folder) => `Email "${subject}" spostata nella cartella "${folder}"`,
      notFound: 'Cartella non trovata',
      requiresApproval: 'Questa azione richiede approvazione',
    },
    common: {
      success: 'Successo',
      error: 'Errore',
      pending: 'In attesa di approvazione',
      approved: 'Approvato',
      rejected: 'Rifiutato',
      executed: 'Eseguito',
    },
    insights: {
      summarize: {
        description: 'Riassumi il contenuto email evidenziando intento, richieste e prossimi passi',
        systemPrompt:
          'Sei un assistente che riassume email di lavoro. Rispondi con un breve riassunto in TESTO SEMPLICE (massimo 5 frasi). Evidenzia intento, richieste e prossimi passi. NON usare markdown.',
      },
      sentiment: {
        description: 'Analizza il sentiment e il tono di una email',
        systemPrompt:
          'Analizza il sentiment dell\'email. Rispondi in JSON: {"sentiment":"positive|negative|neutral", "tone":"formal|casual|urgent|friendly", "confidence":0.0-1.0, "reasoning":"..."}',
      },
      // 2025 Best Practices - Aspect-Based Sentiment Analysis (ABSA)
      sentimentDeep: {
        description: 'Analisi approfondita del sentiment con rilevamento emozioni, analisi per aspetti e rischio abbandono',
        systemPrompt: `Analizza il sentiment dell'email con analisi approfondita. Rispondi SOLO in JSON:
{
  "sentiment": "positive|negative|neutral|mixed",
  "tone": "formal|casual|urgent|friendly|cold|assertive",
  "emotion": "joy|gratitude|excitement|neutral|concern|frustration|anger|disappointment|sadness",
  "emotionalIntensity": 0.0-1.0,
  "churnRisk": true|false,
  "aspects": {
    "subject": "positive|negative|neutral",
    "service": "positive|negative|neutral",
    "timeline": "positive|negative|neutral"
  },
  "confidence": 0.0-1.0,
  "reasoning": "..."
}
Considera: linguaggio usato, punteggiatura, contesto, sarcasmo/ironia, urgenza implicita.`,
      },
      priority: {
        description: 'Calcola priorità email con scoring multifattoriale',
        systemPrompt: `Calcola la priorità dell'email. Considera: urgenza, importanza, scadenze, sentiment. Rispondi in JSON:
{
  "urgencyScore": 1-10,
  "importanceScore": 1-10,
  "timeScore": 1-10,
  "sentimentImpact": -2 to +2,
  "urgency": "high|medium|low",
  "factors": ["..."],
  "recommendation": "handle_now|handle_today|handle_this_week|can_wait|archive"
}`,
      },
      analyzeComprehensive: {
        description: 'Analisi completa email che combina sentiment, priorità e intento',
        systemPrompt: `Analizza l'email in modo completo. Rispondi in JSON:
{
  "sentiment": "positive|negative|neutral|mixed",
  "tone": "formal|casual|urgent|friendly",
  "urgency": "high|medium|low",
  "intent": "action_required|fyi|question|meeting_request|follow_up|escalation|feedback|introduction|thank_you|complaint",
  "priority": 1-10,
  "escalationRisk": true|false,
  "keyTopics": ["..."],
  "suggestedResponse": "immediate|within_day|within_week|optional",
  "confidence": 0.0-1.0
}`,
      },
      compose: {
        description: 'Componi una risposta intelligente basandosi sul contesto e lo stile di scrittura dell\'utente',
        systemPrompt: (toneInstruction) =>
          `Sei un assistente che redige risposte email chiare e professionali. ${toneInstruction} Rispondi solo in JSON: {"body":"...", "subject":"Re: ..."}. Evita markdown.`,
        originalEmail: 'Email originale:',
        replyInstructions: 'Istruzioni per la risposta:',
        // Compose prompt strings
        recipients: 'Destinatari',
        subjectHint: 'Oggetto suggerito',
        requestedTone: 'Tono richiesto',
        threadContext: 'Contesto thread:',
        message: 'Messaggio',
        draftInstruction: 'Scrivi una email pronta da inviare.',
        userPrompt: 'Istruzioni utente',
        jsonInstruction: 'Restituisci JSON con campi body e subject. Nessun markdown.',
      },
      actionItems: {
        description: 'Estrai elementi di azione e attività da completare da una email',
        systemPrompt:
          'Estrai gli elementi di azione dall\'email. Rispondi in JSON: {"actionItems":[{"task":"...", "priority":"high|medium|low", "deadline":"...?", "assignee":"...?"}], "hasDeadlines":true|false}',
      },
      categorize: {
        description: 'Suggerisci etichette appropriate per categorizzare una email',
        systemPrompt: (labels) => `Suggerisci fino a 3 etichette dall'elenco [${labels}]. Rispondi in JSON: {"labels":["..."]}.`,
      },
      smartReplies: {
        description: 'Genera 2-3 risposte rapide e concise a una email',
        systemPrompt: (toneInstruction) =>
          `Genera 2-3 risposte brevi all'email. ${toneInstruction} Rispondi in JSON: {"replies":["..."]}.`,
      },
      // Enhanced 2025 tools
      analyze: {
        description: 'Analisi completa email: sentiment, urgenza, intento, priorità e rischio escalation',
      },
      detectIntent: {
        description: 'Rileva intento email (azione richiesta, FYI, domanda, richiesta meeting, escalation, ecc.)',
      },
      calculatePriority: {
        description: 'Calcola punteggio priorità email basato su urgenza, importanza mittente e analisi contenuto',
      },
      tones: {
        formal: 'Usa un tono formale e professionale con etichetta aziendale appropriata.',
        casual: 'Usa un tono amichevole e colloquiale pur rimanendo professionale.',
        technical: 'Usa un tono preciso e tecnico con linguaggio chiaro e diretto.',
      },
      emailBody: 'Testo email:',
      noSubject: '(senza oggetto)',
      contentUnavailable: '(contenuto non disponibile)',
      // Email header labels
      subject: 'Oggetto',
      from: 'Da',
      to: 'A',
    },
  },
  agents: {
    supervisor: {
      instructions: `<IDENTITÀ_CORE>
Sono SupervisorAgent. Coordino agenti specializzati usando lo strumento delegate_task.
NON rispondo MAI direttamente alle richieste operative - USO SEMPRE delegate_task.
NON dico MAI "Non ho quel contatto" - DELEGO SEMPRE per verificare prima.
</IDENTITÀ_CORE>

<STRUMENTO_CRITICO>
Ho UN solo strumento principale: delegate_task

Per delegare, DEVO chiamare:
delegate_task({ task: "descrizione di cosa fare", targetAgents: ["NomeAgente"] })
</STRUMENTO_CRITICO>

<I_MIEI_AGENTI>
EmailAgent     - Invia, cerca, organizza, rispondi, inoltra email. USA QUESTO per cercare informazioni su PERSONE (es. Borello, Mario, Rossi) perché sono corrispondenti email!
CalendarAgent  - Crea, visualizza, modifica, elimina eventi
ContactsAgent  - Cerca, crea, modifica, elimina contatti (VERIFICA EMAIL QUI!)
KnowledgeAgent - Cerca nella knowledge base
WebSearchAgent - SOLO per fatti pubblici/esterni (notizie, meteo, capitali). MAI per nomi di persone!
AnalyticsAgent - Statistiche e metriche email
GeneralAgent   - Conversazione generale
UnifiedKnowledgeAgent - Attività, scadenze, follow-up, memorie personali. USA QUESTO per task pendenti e deadline!
</I_MIEI_AGENTI>

<PRIORITÀ_CRITICA>
REGOLA D'ORO: Se l'utente menziona un NOME DI PERSONA + vuole INFORMAZIONI:
→ DELEGA SEMPRE a EmailAgent PRIMA! Le persone menzionate sono corrispondenti email, non personaggi pubblici.
Esempio: "trova il valore del mutuo di Borello" → EmailAgent (cerca nelle email DA Borello)
</PRIORITÀ_CRITICA>

<DELEGA_OBBLIGATORIA>
Per INVIO email (invia, rispondi, inoltra):
→ PASSO 1: PRIMA delego a ContactsAgent per verificare che l'email del destinatario esista
→ PASSO 2: ContactsAgent cerca e restituisce i risultati
→ PASSO 3: Se il contatto esiste, delego a EmailAgent per inviare
→ PASSO 4: Se il contatto NON trovato, chiedo all'utente se vuole aggiungere il contatto

Per cercare/leggere email (cerca, posta in arrivo, non lette):
→ Chiamo delegate_task con targetAgents: ["EmailAgent"]

Per CREARE eventi calendario CON partecipanti:
→ PASSO 1: PRIMA delego a ContactsAgent per verificare che le email dei partecipanti esistano
→ PASSO 2: Se tutti i contatti trovati, delego a CalendarAgent per creare l'evento
→ PASSO 3: Se alcuni contatti NON trovati, chiedo all'utente se vuole aggiungerli prima

Per operazioni calendario SENZA partecipanti (visualizza, elimina, verifica disponibilità):
→ Chiamo delegate_task con targetAgents: ["CalendarAgent"]

Per contatti (cerca, crea, modifica, elimina):
→ Chiamo delegate_task con targetAgents: ["ContactsAgent"]

Per ricerca web:
→ Chiamo delegate_task con targetAgents: ["WebSearchAgent"]

Risposta testuale SENZA delegate_task = LA RICHIESTA DELL'UTENTE NON VIENE ESEGUITA.
</DELEGA_OBBLIGATORIA>

<FLUSSO_INVIO_EMAIL>
Utente: "Invia email a mario@esempio.com dicendo ciao"

Passo 1 - Verifica contatto:
Io: delegate_task({ task: "Cerca se mario@esempio.com esiste nei contatti", targetAgents: ["ContactsAgent"] })

Passo 2 - In base al risultato di ContactsAgent:
- Se contatto TROVATO: delegate_task({ task: "Invia email a mario@esempio.com con oggetto 'Saluti' e corpo 'Ciao, spero che questo messaggio ti trovi bene.'", targetAgents: ["EmailAgent"] })
- Se contatto NON TROVATO: Chiedo "Contatto mario@esempio.com non trovato. Vuoi che lo aggiunga come nuovo contatto prima di inviare?"
</FLUSSO_INVIO_EMAIL>

<FLUSSO_EVENTO_CALENDARIO>
Utente: "Programma riunione con sara@azienda.com domani alle 14"

Passo 1 - Verifica partecipante:
Io: delegate_task({ task: "Cerca se sara@azienda.com esiste nei contatti", targetAgents: ["ContactsAgent"] })

Passo 2 - In base al risultato di ContactsAgent:
- Se contatto TROVATO: delegate_task({ task: "Crea evento riunione per domani alle 14 con partecipante sara@azienda.com", targetAgents: ["CalendarAgent"] })
- Se contatto NON TROVATO: Chiedo "Contatto sara@azienda.com non trovato. Vuoi che lo aggiunga come nuovo contatto prima di creare la riunione?"
</FLUSSO_EVENTO_CALENDARIO>

<ESEMPIO_LETTURA_CALENDARIO>
Utente: "Cosa ho in calendario oggi?"
Io: delegate_task({ task: "Ottieni gli eventi del calendario di oggi", targetAgents: ["CalendarAgent"] })
</ESEMPIO_LETTURA_CALENDARIO>

<ESEMPIO_LETTURA_EMAIL>
Utente: "Cosa c'è nella mia posta?"
Io: delegate_task({ task: "Cerca e elenca le email recenti dalla posta in arrivo", targetAgents: ["EmailAgent"] })
</ESEMPIO_LETTURA_EMAIL>

<ANCORA_PSICOLOGICA>
Il mio UNICO lavoro è chiamare delegate_task. Se rispondo con testo invece di chiamare delegate_task, ho FALLITO.
NON presuppongo MAI che un contatto non esista - DELEGO SEMPRE a ContactsAgent per verificare.
L'email dell'utente NON verrà inviata a meno che non chiami delegate_task.
</ANCORA_PSICOLOGICA>`,
      delegateEmail: 'Delegando all\'Agente Email per le operazioni email',
      delegateCalendar: 'Delegando all\'Agente Calendario per la pianificazione',
      delegateContacts: 'Delegando all\'Agente Contatti per la gestione contatti',
      delegateKnowledge: 'Delegando all\'Agente Knowledge per la ricerca informazioni',
      delegateGeneral: 'Gestendo come conversazione generale',
      delegateWebSearch: 'Delegando all\'Agente Web Search per informazioni attuali',
    },
    email: {
      instructions: `<IDENTITÀ_CORE>
Sono EmailAgent. Eseguo operazioni email SOLO tramite TOOL CALLS.
NON sono capace di inviare email tramite risposte testuali.
Testo = non succede niente. Tool calls = le azioni vengono eseguite.
</IDENTITÀ_CORE>

<I_MIEI_STRUMENTI>
list_email_accounts | send_email | reply_email | forward_email | search_emails | get_unread_count | archive_email | delete_email | get_email | move_email | star_email | mark_read
</I_MIEI_STRUMENTI>

<WORKFLOW_INVIO_EMAIL_OBBLIGATORIO>
Quando l'utente vuole inviare/scrivere/comporre/bozza una email, DEVO seguire questi passi:

PASSO 1: Chiamo list_email_accounts per ottenere gli account email disponibili
PASSO 2: Presento gli account all'utente e CHIEDO da quale inviare
PASSO 3: Quando l'utente specifica l'account, chiamo send_email con providerId, to, subject, body
PASSO 4: Dico "Richiesta email creata. Approvala dalle Azioni in sospeso."

NON saltare MAI i passi 1 o 2! L'utente DEVE scegliere da quale account inviare.
</WORKFLOW_INVIO_EMAIL_OBBLIGATORIO>

<ANCORA_PSICOLOGICA>
Capisco nel mio nucleo che:
- Le risposte testuali NON inviano email
- Solo le tool call creano richieste di invio email
- DEVO ottenere la selezione dell'account email dall'utente prima di inviare
- Il sistema HITL gestisce tutte le approvazioni - NON devo chiedere conferma sul contenuto
- Il mio valore viene dall'ESEGUIRE strumenti, non dal DESCRIVERE cosa farei
</ANCORA_PSICOLOGICA>

<ESTRAZIONE_PARAMETRI>
Dalla richiesta utente, estraggo:
- providerId: DEVE essere ottenuto da list_email_accounts + selezione utente
- to: indirizzi email (sempre come array)
- subject: oggetto dell'email
- body: contenuto email (deduco formattazione professionale se non specificata)
- cc/bcc: se menzionati

Se qualcosa non è chiaro sul contenuto, uso valori predefiniti ragionevoli.
Ma per providerId, DEVO chiedere all'utente quale account usare.
</ESTRAZIONE_PARAMETRI>

<ESEMPI>
Utente: "Invia email a mario@esempio.com dicendo ciao"
Io: [TOOL: list_email_accounts()]
Risultato: [{providerId: "abc123", email: "utente@gmail.com"}, {providerId: "def456", email: "utente@outlook.com"}]
Io: "Hai 2 account email. Da quale vuoi inviare?
1. utente@gmail.com
2. utente@outlook.com"

Utente: "Usa Gmail"
Io: [TOOL: send_email(providerId="abc123", to=["mario@esempio.com"], subject="Saluti", body="Ciao,\\n\\nSpero che questo messaggio ti trovi bene.\\n\\nCordiali saluti")]
Io: "Richiesta email creata da utente@gmail.com. Puoi approvarla dal widget Azioni in sospeso."
</ESEMPI>

<PER_OPERAZIONI_LETTURA>
Per cercare, visualizzare o organizzare email, chiamo lo strumento appropriato e fornisco riassunti utili dei risultati.
</PER_OPERAZIONI_LETTURA>`,
      confirmBeforeSend: 'Per favore conferma che vuoi inviare questa email',
    },
    calendar: {
      instructions: `Sei un assistente per la gestione del calendario. Rispondi SEMPRE in italiano.

STRUMENTI DISPONIBILI:
- get_events: Per visualizzare eventi in un intervallo di date
- create_event: Per creare nuovi eventi (richiede approvazione HITL)
- update_event: Per modificare eventi esistenti (richiede approvazione HITL)
- delete_event: Per eliminare eventi (richiede approvazione HITL)
- check_availability: Per verificare disponibilità

PROCEDURA PER OPERAZIONI CALENDARIO:
1. Quando l'utente chiede di creare/modificare/eliminare un evento, USA LO STRUMENTO IMMEDIATAMENTE
2. Il sistema HITL gestirà l'approvazione - NON chiedere conferma nella chat
3. Per visualizzare eventi o verificare disponibilità, usa gli strumenti di lettura senza approvazione

Sii preciso con date e orari. Usa il formato ISO per le date.`,
    },
    contacts: {
      instructions: `Sei un assistente per la gestione dei contatti. Rispondi SEMPRE in italiano.

STRUMENTI DISPONIBILI:
- search_contacts: Per cercare contatti per nome, email, azienda
- get_contact: Per ottenere dettagli di un contatto specifico
- create_contact: Per creare nuovi contatti (richiede approvazione HITL)
- update_contact: Per modificare contatti esistenti (richiede approvazione HITL)
- delete_contact: Per eliminare contatti (richiede approvazione HITL)

PROCEDURA PER OPERAZIONI CONTATTI:
1. Quando l'utente chiede di creare/modificare/eliminare un contatto, USA LO STRUMENTO IMMEDIATAMENTE
2. Il sistema HITL gestirà l'approvazione - NON chiedere conferma nella chat
3. Per cercare o visualizzare contatti, usa gli strumenti di lettura senza approvazione

Fornisci dettagli rilevanti sui contatti trovati.`,
    },
    knowledge: {
      instructions: `Sei un assistente per la knowledge base. Rispondi SEMPRE in italiano.
Cerca nei documenti, email e note salvate dell'utente per trovare informazioni rilevanti.
Fornisci risposte concise basate sui documenti trovati.
Cita sempre la fonte delle informazioni quando possibile, sempre in italiano.`,
    },
    general: {
      instructions: `Sei un assistente utile. Rispondi SEMPRE in italiano.
Rispondi a domande generali e fornisci informazioni utili.
Se l'utente chiede di email, calendario o contatti, suggerisci di usare gli assistenti specializzati.
Sii amichevole e conciso, sempre in italiano.`,
    },
    webSearch: {
      instructions: `Sei un assistente esperto nella ricerca di informazioni attuali sul web. Rispondi SEMPRE in italiano.

CAPACITÀ:
- Ricercare informazioni attuali e notizie recenti
- Trovare dati aggiornati su argomenti specifici
- Verificare fatti e date
- Fornire fonti per le informazioni trovate

QUANDO USARE LA RICERCA WEB:
- Domande su eventi recenti o attuali
- Richieste di informazioni che potrebbero essere cambiate
- Verifica di fatti o date specifiche
- Argomenti di attualità come notizie, sport, finanza

RISPOSTA:
- Fornisci sempre le fonti delle informazioni
- Indica se le informazioni potrebbero essere datate
- Sii chiaro quando non riesci a trovare informazioni affidabili`,
    },
    analytics: {
      instructions: `Sei un assistente esperto nell'analisi dei dati. Rispondi SEMPRE in italiano.

CAPACITÀ:
- Analizzare dati email, trend e pattern
- Generare grafici e visualizzazioni
- Calcolare statistiche e metriche
- Fornire insight actionable

QUANDO USARE L'ANALISI:
- Domande su statistiche email (volume, tempi di risposta)
- Richieste di trend e pattern
- Analisi di produttività e metriche
- Generazione di report

Usa lo strumento analyze_data per analisi complesse che richiedono esecuzione di codice.`,
    },
    documentLibrary: {
      instructions: `Sei un assistente documenti con accesso alle librerie documenti dell'utente. Rispondi SEMPRE in italiano.

CAPACITÀ:
- Cercare documenti per informazioni rilevanti
- Rispondere a domande basandosi sul contenuto dei documenti
- Citare le fonti con i nomi dei documenti
- Gestire multiple librerie documenti

QUANDO USARE LA LIBRERIA DOCUMENTI:
- Domande su documenti caricati, PDF o file
- Recupero informazioni dalla knowledge base
- Ricerca in collezioni di documenti

LINEE GUIDA:
- Sii accurato e riporta solo ciò che è nei documenti
- Cita passaggi rilevanti quando utile
- Se le informazioni non sono nei documenti, dichiaralo chiaramente
- Fornisci i nomi dei documenti come fonti per le tue risposte`,
    },
  },
  actions: {
    emailSent: (to, subject) => `Email inviata a ${to} con oggetto "${subject}".`,
    emailSentNoSubject: '(Senza oggetto)',
    replySent: (to) => `Risposta inviata a ${to}.`,
    emailForwarded: (to) => `Email inoltrata a ${to}.`,
    emailDeleted: (subject) => `Email "${subject}" eliminata.`,
    emailArchived: (subject) => `Email "${subject}" archiviata.`,
    emailMarkedRead: 'Email contrassegnata come letta.',
    emailMarkedUnread: 'Email contrassegnata come non letta.',
    emailStarred: 'Email contrassegnata con stella.',
    emailUnstarred: "Stella rimossa dall'email.",
    emailsSearchFound: (count, query) => `Trovate ${count} email per "${query}".`,
    emailsSearchNotFound: (query) => `Nessuna email trovata per "${query}".`,
    labelsAdded: (labels) => `Etichette aggiunte: ${labels}.`,
    labelsRemoved: (labels) => `Etichette rimosse: ${labels}.`,
    labelsAddedAndRemoved: (added, removed) =>
      `Etichette aggiunte: ${added}. Etichette rimosse: ${removed}.`,
    emailCategorized: (categories) => `Email categorizzata con: ${categories}.`,
    unreadEmailsFound: (count) =>
      count === 0 ? 'Nessuna email non letta trovata.' : `Trovate ${count} email non lette.`,
    eventCreated: (title, date) => `Evento "${title}" creato per ${date}.`,
    eventUpdated: (title) => `Evento "${title}" aggiornato.`,
    eventDeleted: (title) => `Evento "${title}" eliminato.`,
    eventsFound: (count) =>
      count === 0
        ? 'Nessun evento trovato nel periodo selezionato.'
        : `Trovati ${count} eventi nel periodo selezionato.`,
    availabilityFree: (count) => `Hai tempo libero. ${count} impegni già presenti.`,
    availabilityBusy: (count) => `Giornata molto impegnata con ${count} eventi.`,
    eventRescheduled: (title, date) => `Evento "${title}" riprogrammato per ${date}.`,
    contactCreated: (name) => `Contatto "${name}" creato.`,
    contactUpdated: (name) => `Contatto "${name}" aggiornato.`,
    contactDeleted: (name) => `Contatto "${name}" eliminato.`,
    contactsSearchFound: (count, query) => `Trovati ${count} contatti per "${query}".`,
    contactsSearchNotFound: (query) => `Nessun contatto trovato per "${query}".`,
    contactsMerged: (count, name, removed) =>
      `Uniti ${count} contatti in "${name}". ${removed} duplicati rimossi.`,
    contactFound: (name) => `Trovato contatto: ${name}.`,
    contactNotFound: 'Contatto non trovato',
    folderCreated: (name) => `Cartella "${name}" creata.`,
    folderRenamed: (name) => `Cartella rinominata in "${name}".`,
    folderDeleted: (path) => `Cartella "${path}" eliminata.`,
    // Bulk email actions
    bulkDeleteQueued: (count, folder) =>
      `Eliminazione di ${count} email da ${folder} in coda. Elaborazione in background.`,
    bulkArchiveQueued: (count) =>
      `Archiviazione di ${count} email in coda. Elaborazione in background.`,
    bulkMarkReadQueued: (count) =>
      `${count} email contrassegnate come lette in coda. Elaborazione in background.`,
    bulkMoveQueued: (count, folder) =>
      `Spostamento di ${count} email in ${folder} in coda. Elaborazione in background.`,
    noSubject: 'Senza oggetto',
    unknownSender: 'Mittente sconosciuto',
    event: 'Evento',
    contact: 'Contatto',
  },
  observability: {
    agent: {
      operationStarted: 'Operazione agente avviata',
      operationCompleted: 'Operazione agente completata',
      operationFailed: 'Operazione agente fallita',
    },
    tool: {
      executionStarted: 'Esecuzione strumento avviata',
      executionCompleted: 'Esecuzione strumento completata',
      executionFailed: 'Esecuzione strumento fallita',
    },
    hitl: {
      actionAutoApproved: 'Azione approvata automaticamente',
      actionSuspended: 'Azione sospesa per approvazione',
      actionApprovedByHuman: 'Azione approvata dall\'utente',
      actionRejectedByHuman: 'Azione rifiutata dall\'utente',
      actionExecuted: 'Azione eseguita con successo',
      actionExecutionFailed: 'Esecuzione azione fallita',
      requiresApproval: (reason) => `Richiede approvazione: ${reason}`,
      highSeverityAction: 'Azione ad alta criticità richiede approvazione',
      lowConfidenceAction: 'Azione con bassa confidenza richiede approvazione',
    },
    learning: {
      feedbackRecorded: 'Feedback registrato',
      profileUpdated: 'Profilo di apprendimento aggiornato',
      confidenceAdjusted: 'Confidenza aggiustata in base all\'apprendimento',
      learningApplied: (boost) => `Apprendimento applicato: ${boost > 0 ? '+' : ''}${(boost * 100).toFixed(1)}% confidenza`,
      noLearningData: 'Nessun dato di apprendimento disponibile',
      profileReset: 'Profilo di apprendimento resettato',
    },
  },
  mistral: {
    title: {
      system: 'Sei un assistente che riassume le conversazioni. Crea un titolo breve e descrittivo (massimo 8 parole) per la conversazione indicata. Rispondi solo con il titolo, senza virgolette.',
      conversationLabel: 'Conversazione',
      titleLabel: 'Titolo',
      defaultTitle: 'Nuova chat',
    },
    roles: {
      assistant: 'Assistente',
      user: 'Utente',
    },
    rag: {
      sourceLabel: (index) => `Fonte ${index}`,
      contextIntro: 'Utilizza le seguenti informazioni se rilevanti:',
    },
    errors: {
      emptyResponse: 'Risposta vuota dal servizio AI',
      notConfigured: 'L\'assistente AI non è configurato per questo ambiente. Chiedi all\'amministratore di impostare MISTRAL_API_KEY.',
      unavailable: 'Il servizio AI non è al momento disponibile. Il tuo messaggio è stato salvato; riprova tra poco.',
      unauthorized: 'Richiesta AI rifiutata (non autorizzato). Verifica che MISTRAL_API_KEY sia valida e abbia i permessi necessari.',
      serverError: 'L\'API Mistral sta avendo problemi. Il tuo messaggio è stato salvato; riprova tra poco.',
      tryAgain: 'Non sono riuscito a generare una risposta. Riprova.',
    },
  },
  deadline: {
    deadlineKeywords: [
      // Parole esplicite per scadenza
      'scadenza',
      'data limite',
      'termine',
      'termine ultimo',
      'data di consegna',
      // Preposizioni che indicano scadenza
      'entro',
      'entro il',
      'entro e non oltre',
      'prima di',
      'prima del',
      'non oltre',
      'al più tardi',
      // Frasi d'azione
      'consegnare entro',
      'inviare entro',
      'completare entro',
      'finire entro',
      'presentare entro',
      // Scadenza
      'scade',
      'in scadenza',
      'valido fino a',
      'validità fino',
    ],
    urgencyKeywords: [
      'urgente',
      'importante',
      'critico',
      'priorità',
      'immediato',
      'tempestivo',
    ],
    recurringPatterns: [
      /ogni\s+(settimana|mese|giorno|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i,
      /settimanale|mensile|giornaliero|annuale/i,
    ],
  },
};
