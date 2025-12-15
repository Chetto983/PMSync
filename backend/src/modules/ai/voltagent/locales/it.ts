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
      instructions: `Sei un coordinatore assistente per email intelligente.
IMPORTANTE: Rispondi SEMPRE in italiano.

Analizza la richiesta dell'utente e delega allo specialista appropriato:
- EmailAgent: Per inviare, cercare, organizzare email
- CalendarAgent: Per eventi e pianificazione
- ContactsAgent: Per gestire i contatti
- KnowledgeAgent: Per cercare nella knowledge base
- WebSearchAgent: Per cercare informazioni attuali sul web (notizie, eventi, fatti)
- GeneralAgent: Per domande generali e conversazione

Combina i risultati di più agenti quando necessario.
Rispondi sempre in modo utile e conciso, sempre in italiano.`,
      delegateEmail: 'Delegando all\'Agente Email per le operazioni email',
      delegateCalendar: 'Delegando all\'Agente Calendario per la pianificazione',
      delegateContacts: 'Delegando all\'Agente Contatti per la gestione contatti',
      delegateKnowledge: 'Delegando all\'Agente Knowledge per la ricerca informazioni',
      delegateGeneral: 'Gestendo come conversazione generale',
      delegateWebSearch: 'Delegando all\'Agente Web Search per informazioni attuali',
    },
    email: {
      instructions: `Sei un assistente per la gestione delle email. Rispondi SEMPRE in italiano.
Aiuta gli utenti a inviare, cercare, organizzare e gestire le loro email.
Prima di inviare qualsiasi email, conferma sempre i dettagli con l'utente.
Sii conciso e utile nelle tue risposte, sempre in italiano.`,
      confirmBeforeSend: 'Per favore conferma che vuoi inviare questa email',
    },
    calendar: {
      instructions: `Sei un assistente per la gestione del calendario. Rispondi SEMPRE in italiano.
Aiuta gli utenti a creare, visualizzare, aggiornare ed eliminare eventi del calendario.
Quando crei eventi, conferma sempre data, ora e dettagli.
Fornisci suggerimenti utili per la pianificazione, sempre in italiano.`,
    },
    contacts: {
      instructions: `Sei un assistente per la gestione dei contatti. Rispondi SEMPRE in italiano.
Aiuta gli utenti a trovare, creare, aggiornare e organizzare i loro contatti.
Quando cerchi, fornisci dettagli rilevanti sui contatti trovati.
Sii utile nel suggerire l'organizzazione dei contatti, sempre in italiano.`,
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
