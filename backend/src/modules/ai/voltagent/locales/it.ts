/**
 * Italian translations for VoltAgent - UI strings only
 * Agent prompts use English (locale instruction appended for response language)
 */
import type { VoltAgentTranslations } from './index';
import { en } from './en';

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
      starred: (subject) => `Email "${subject}" contrassegnata`,
      unstarred: (subject) => `Rimossa stella da "${subject}"`,
      unreadCount: (count) => `${count} email non lette`,
      moved: (subject, folder) => `Email "${subject}" spostata in ${folder}`,
      labeled: (subject, label) => `Etichetta "${label}" aggiunta a "${subject}"`,
      unlabeled: (subject, label) => `Etichetta "${label}" rimossa da "${subject}"`,
      noSubject: '(Nessun oggetto)',
      serviceUnavailable: 'Servizio email temporaneamente non disponibile. Riprova tra un momento, oppure verifica la connessione al provider email in Impostazioni → Account collegati.',
      notFound: 'Email non trovata. Potrebbe essere stata eliminata o spostata. Prova a cercarla o aggiorna la posta in arrivo.',
      requiresApproval: 'Questa azione richiede la tua approvazione. Controlla il pannello Azioni in Sospeso per approvarla o rifiutarla.',
    },
    calendar: {
      eventsFound: (count) => `${count} eventi trovati`,
      eventCreated: (title, date) => `Evento "${title}" creato per ${date}`,
      eventUpdated: (title) => `Evento "${title}" aggiornato`,
      eventDeleted: (title) => `Evento "${title}" eliminato`,
      slotAvailable: 'Lo slot temporale è disponibile',
      slotConflict: (count) => `Ci sono ${count} eventi in conflitto`,
      serviceUnavailable: 'Servizio calendario temporaneamente non disponibile. Riprova tra un momento, oppure verifica la connessione al calendario in Impostazioni → Account collegati.',
      notFound: 'Evento non trovato. Potrebbe essere stato eliminato o spostato. Prova a cercarlo o aggiorna la vista del calendario.',
      requiresApproval: 'Questa azione richiede la tua approvazione. Controlla il pannello Azioni in Sospeso per approvarla o rifiutarla.',
    },
    contacts: {
      found: (count, query) => `Trovati ${count} contatti per "${query}"`,
      contact: 'Contatto',
      created: (name) => `Contatto "${name}" creato`,
      updated: (name) => `Contatto "${name}" aggiornato`,
      deleted: (name) => `Contatto "${name}" eliminato`,
      alreadyExists: (email) => `Un contatto con email ${email} esiste già. Cerca il contatto esistente oppure usa un indirizzo email diverso.`,
      notFound: 'Contatto non trovato. Potrebbe essere stato eliminato o unito con un altro. Prova a cercarlo per nome o email.',
      requiresApproval: 'Questa azione richiede la tua approvazione. Controlla il pannello Azioni in Sospeso per approvarla o rifiutarla.',
    },
    knowledge: {
      found: (count) => `Trovati ${count} documenti rilevanti`,
      noResults: 'Nessun documento rilevante trovato',
      instructions: en.tools.knowledge.instructions, // Use English prompts
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
      description: en.tools.webSearch.description,
      queryDescription: en.tools.webSearch.queryDescription,
      sources: 'Fonti:',
      searchFailed: (error) => `Ricerca web fallita: ${error}`,
      noResults: 'Nessun risultato trovato',
    },
    analytics: {
      description: en.tools.analytics.description,
      queryDescription: en.tools.analytics.queryDescription,
      analysisFailed: (error) => `Analisi fallita: ${error}`,
      noData: 'Nessun dato disponibile',
      insights: 'Insight:',
    },
    documentLibrary: {
      description: en.tools.documentLibrary.description,
      queryDescription: en.tools.documentLibrary.queryDescription,
      listDescription: en.tools.documentLibrary.listDescription,
      createDescription: en.tools.documentLibrary.createDescription,
      queryFailed: (error) => `Query documenti fallita: ${error}`,
      listFailed: (error) => `Impossibile elencare le librerie: ${error}`,
      noLibraries: 'Nessuna libreria documenti trovata.',
      noDocuments: 'Nessun documento disponibile.',
      sources: 'Fonti:',
    },
    folder: {
      created: (name) => `Cartella "${name}" creata`,
      renamed: (oldName, newName) => `Cartella rinominata da "${oldName}" a "${newName}"`,
      deleted: (name) => `Cartella "${name}" eliminata`,
      emailMoved: (subject, folder) => `Email "${subject}" spostata in "${folder}"`,
      notFound: 'Cartella non trovata',
      requiresApproval: 'Questa azione richiede approvazione',
    },
    common: {
      success: 'Successo',
      error: 'Errore',
      pending: 'In attesa',
      approved: 'Approvato',
      rejected: 'Rifiutato',
      executed: 'Eseguito',
    },
    insights: {
      // Override AI prompts to respond in Italian
      summarize: {
        description: "Riassumi il contenuto dell'email evidenziando intento, richieste e prossimi passi",
        systemPrompt:
          'Sei un assistente che riassume email aziendali. Rispondi con un breve riassunto in ITALIANO e in TESTO SEMPLICE (max 5 frasi). Evidenzia intento, richieste e prossimi passi. NON usare markdown.',
      },
      sentiment: {
        description: "Analizza il sentiment e il tono di un'email",
        systemPrompt:
          'Analizza il sentiment dell\'email. Rispondi in JSON: {"sentiment":"positive|negative|neutral", "tone":"formal|casual|urgent|friendly", "confidence":0.0-1.0, "reasoning":"..."}. Il campo reasoning deve essere in ITALIANO.',
      },
      sentimentDeep: {
        description: 'Analisi approfondita del sentiment con rilevamento emozioni, analisi per aspetti e rischio churn',
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
Il campo reasoning deve essere in ITALIANO. Considera: linguaggio usato, punteggiatura, contesto, sarcasmo/ironia, urgenza implicita.`,
      },
      priority: {
        description: "Calcola la priorità dell'email con punteggio multi-fattore",
        systemPrompt: `Calcola la priorità dell'email. Considera: urgenza, importanza, scadenza, sentiment. Rispondi in JSON:
{
  "urgencyScore": 1-10,
  "importanceScore": 1-10,
  "timeScore": 1-10,
  "sentimentImpact": -2 to +2,
  "urgency": "high|medium|low",
  "factors": ["..."],
  "recommendation": "handle_now|handle_today|handle_this_week|can_wait|archive"
}
Il campo factors deve contenere elementi in ITALIANO.`,
      },
      analyzeComprehensive: {
        description: "Analisi completa dell'email combinando sentiment, priorità e intento",
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
}
Il campo keyTopics deve contenere elementi in ITALIANO.`,
      },
      compose: {
        ...en.tools.insights.compose, // Keep compose structure (it handles language via parameter)
      },
      actionItems: {
        description: "Estrai attività e task da completare da un'email",
        systemPrompt:
          'Estrai le attività dall\'email. Rispondi in JSON: {"actionItems":[{"task":"...", "priority":"high|medium|low", "deadline":"...?", "assignee":"...?"}], "hasDeadlines":true|false}. I campi task e assignee devono essere in ITALIANO.',
      },
      categorize: {
        description: "Suggerisci etichette appropriate per categorizzare un'email",
        systemPrompt: (labels: string) => `Suggerisci fino a 3 etichette da [${labels}]. Rispondi in JSON: {"labels":["..."]}.`,
      },
      smartReplies: {
        description: "Genera 2-3 risposte rapide e concise a un'email",
        systemPrompt: (toneInstruction: string) =>
          `Genera 2-3 risposte concise all'email in ITALIANO. ${toneInstruction} Rispondi in JSON: {"replies":["..."]}.`,
      },
      // Enhanced 2025 tools
      analyze: {
        description: "Analisi completa dell'email: sentiment, urgenza, intento, priorità e rischio escalation",
      },
      detectIntent: {
        description: "Rileva l'intento dell'email (azione richiesta, informativa, domanda, richiesta riunione, escalation, ecc.)",
      },
      calculatePriority: {
        description: "Calcola il punteggio di priorità dell'email basato su urgenza, importanza del mittente e analisi del contenuto",
      },
      tones: {
        formal: 'Tono formale e professionale.',
        casual: 'Tono amichevole e colloquiale.',
        technical: 'Tono tecnico e preciso.',
      },
      emailBody: 'Testo email:',
      noSubject: '(senza oggetto)',
      contentUnavailable: '(contenuto non disponibile)',
      subject: 'Oggetto',
      from: 'Da',
      to: 'A',
    },
  },
  // Agent prompts: use English (locale instruction handles response language)
  agents: en.agents,
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
    labelsAddedAndRemoved: (added, removed) => `Aggiunte: ${added}. Rimosse: ${removed}.`,
    emailCategorized: (categories) => `Email categorizzata: ${categories}.`,
    unreadEmailsFound: (count) => count === 0 ? 'Nessuna email non letta.' : `${count} email non lette.`,
    eventCreated: (title, date) => `Evento "${title}" creato per ${date}.`,
    eventUpdated: (title) => `Evento "${title}" aggiornato.`,
    eventDeleted: (title) => `Evento "${title}" eliminato.`,
    eventsFound: (count) => count === 0 ? 'Nessun evento trovato.' : `${count} eventi trovati.`,
    availabilityFree: (count) => `Tempo libero. ${count} impegni presenti.`,
    availabilityBusy: (count) => `Giornata impegnata con ${count} eventi.`,
    eventRescheduled: (title, date) => `Evento "${title}" riprogrammato per ${date}.`,
    contactCreated: (name) => `Contatto "${name}" creato.`,
    contactUpdated: (name) => `Contatto "${name}" aggiornato.`,
    contactDeleted: (name) => `Contatto "${name}" eliminato.`,
    contactsSearchFound: (count, query) => `Trovati ${count} contatti per "${query}".`,
    contactsSearchNotFound: (query) => `Nessun contatto trovato per "${query}".`,
    contactsMerged: (count, name, removed) => `Uniti ${count} contatti in "${name}". ${removed} duplicati rimossi.`,
    contactFound: (name) => `Trovato: ${name}.`,
    contactNotFound: 'Contatto non trovato',
    folderCreated: (name) => `Cartella "${name}" creata.`,
    folderRenamed: (name) => `Cartella rinominata in "${name}".`,
    folderDeleted: (path) => `Cartella "${path}" eliminata.`,
    bulkDeleteQueued: (count, folder) => `Eliminazione di ${count} email da ${folder} in coda.`,
    bulkArchiveQueued: (count) => `Archiviazione di ${count} email in coda.`,
    bulkMarkReadQueued: (count) => `${count} email contrassegnate come lette.`,
    bulkMoveQueued: (count, folder) => `Spostamento di ${count} email in ${folder}.`,
    noSubject: 'Senza oggetto',
    unknownSender: 'Mittente sconosciuto',
    event: 'Evento',
    contact: 'Contatto',
  },
  observability: {
    agent: {
      operationStarted: 'Operazione avviata',
      operationCompleted: 'Operazione completata',
      operationFailed: 'Operazione fallita',
    },
    tool: {
      executionStarted: 'Esecuzione avviata',
      executionCompleted: 'Esecuzione completata',
      executionFailed: 'Esecuzione fallita',
    },
    hitl: {
      actionAutoApproved: 'Azione approvata automaticamente',
      actionSuspended: 'Azione sospesa per approvazione',
      actionApprovedByHuman: 'Azione approvata',
      actionRejectedByHuman: 'Azione rifiutata',
      actionExecuted: 'Azione eseguita',
      actionExecutionFailed: 'Esecuzione fallita',
      requiresApproval: (reason) => `Richiede approvazione: ${reason}`,
      highSeverityAction: 'Azione ad alta criticità',
      lowConfidenceAction: 'Azione con bassa confidenza',
    },
    learning: {
      feedbackRecorded: 'Feedback registrato',
      profileUpdated: 'Profilo aggiornato',
      confidenceAdjusted: 'Confidenza aggiustata',
      learningApplied: (boost) => `Apprendimento: ${boost > 0 ? '+' : ''}${(boost * 100).toFixed(1)}%`,
      noLearningData: 'Nessun dato disponibile',
      profileReset: 'Profilo resettato',
    },
  },
  mistral: {
    title: {
      system: en.mistral.title.system, // Use English for AI
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
      contextIntro: 'Informazioni rilevanti:',
    },
    errors: {
      emptyResponse: 'Risposta vuota dal servizio AI',
      notConfigured: 'Assistente AI non configurato.',
      unavailable: 'Servizio AI non disponibile. Riprova tra poco.',
      unauthorized: 'Richiesta AI rifiutata.',
      serverError: 'Errore API. Riprova tra poco.',
      tryAgain: 'Non sono riuscito a generare una risposta. Riprova.',
      toolExecution: (error) => `Strumento fallito: ${error}`,
      retryPrompt: (error) => `Errore: ${error}\n\nCorreggi e riprova.`,
    },
  },
  deadline: {
    deadlineKeywords: ['scadenza', 'termine', 'entro', 'prima di', 'non oltre', 'consegnare', 'scade'],
    urgencyKeywords: ['urgente', 'importante', 'critico', 'priorità', 'immediato'],
    recurringPatterns: [
      /ogni\s+(settimana|mese|giorno|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i,
      /settimanale|mensile|giornaliero|annuale/i,
    ],
  },
  followUp: {
    // Semantic query for RAG - Italian intent patterns
    ragQuery: 'in attesa di risposta, azione richiesta, per favore rispondi, follow up necessario, scadenza in avvicinamento, fammi sapere, conferma ricezione, ho bisogno del tuo input, risposta pendente, attendo conferma, richiesta di azione, aspetto riscontro',
    highConfidenceReason: 'Rilevato tramite ricerca semantica (alta confidenza)',
    verifiedReason: 'Verificato dall\'analisi AI',
  },
  briefing: {
    quotaExceeded: 'Briefing giornaliero non disponibile - limite AI raggiunto. Aggiorna il tuo piano.',
    emptyInbox: 'Nessuna nuova email non letta. La tua casella è vuota!',
    fallbackSummary: (unread, today) => `Hai ${unread} email non lette, ${today} ricevute oggi.`,
    emailFrom: 'Email da',
    aiPromptLanguage: 'IMPORTANT: Your response MUST be in Italian (italiano). All text in summary, highlights, and urgent arrays must be written in Italian.',
    followUps: {
      overdue: (count) => `⚠️ Hai ${count} follow-up scadut${count > 1 ? 'i' : 'o'} che richied${count > 1 ? 'ono' : 'e'} attenzione.`,
      dueToday: (count) => `📋 ${count} follow-up in scadenza oggi.`,
      pending: (count) => `✓ ${count} follow-up in sospeso, nessuno scaduto.`,
      none: '✓ Nessun follow-up in sospeso.',
      unavailable: 'Dati follow-up non disponibili.',
    },
    deadlines: {
      placeholder: '✓ Tracciamento scadenze disponibile in futuro aggiornamento.',
    },
    actionItems: {
      placeholder: '✓ Tracciamento attività disponibile in futuro aggiornamento.',
    },
    calendar: {
      available: '📆 Sincronizzazione calendario disponibile via /api/v1/calendar.',
      unavailable: 'Dati calendario non disponibili.',
    },
  },
  // Router patterns for intent classification (Italian)
  router: {
    // WRITE operations → ActionsAgent
    writeOps: [
      'scriv[aio]|invia|manda|spedisci', // write/send
      'rispondi|inoltra', // reply/forward
      'elimina|cancella|rimuovi|cestina|archivia|annulla', // delete/archive/cancel
      'crea|aggiungi|nuov[ao]', // create/add/new
      'modifica|aggiorna|cambia|rinomina', // update/edit
      'sposta|segna|contrassegna', // move/mark
      'fissa|pianifica|programma|metti|metter[eò]', // schedule/put (metti riunione = schedule meeting)
    ],
    // READ operations → IntelligenceAgent
    readOps: [
      'cerca|trova|mostra|elenca|leggi|vedi', // search/find/show/read
      'posta|casella|messaggi?|non lett[aio]', // mail/inbox/messages/unread
      'calendario|riunion[ei]|appuntament[oi]|event[oi]|disponibilità', // calendar/meeting/event
      'contatt[oi]|indirizzo|telefono|chi è|persona', // contact/address/phone/who is
      'analizza|riassumi|priorità', // analyze/summarize/priority
      'quant[ei]|conteggio', // how many/count
    ],
    // Simple queries → Supervisor direct response
    simple: [
      '^(ciao|salve|buongiorno|buonasera|grazie)\\b',
      "^(cos'?[eè]|cosa (è|sono)|quali? (è|sono))",
      '^come (si fa|faccio|posso)',
      '^traduci',
      '^definisci',
    ],
    // Complexity: simple
    complexitySimple: [
      '^(ciao|salve|grazie|ok|sì|no)\\b',
      "^(cos'?[eè]|cosa|quali?)",
      '^riassumi',
      '^(elenca|mostra|trova) (le? mie?|tutt[ei]|gli?)',
      'email non lett[eio]',
      'controlla (il )?calendario',
      'segna (come )?(lett[ao]|non lett[ao])',
      '^quant[ei]',
      '^quando',
    ],
    // Complexity: moderate
    complexityModerate: [
      'scriv[aio]|manda|invia|spedisci', // write/send email
      'rispondi|inoltra', // reply/forward
      'bozza|componi', // draft/compose
      'analizza|analisi',
      'confronta',
      'spiega|spiegazione',
      'suggerisci|raccomanda|consiglia',
      'pianifica|ripianifica|fissa',
      'organizza|categorizza',
      'traduci|traduzione',
      'priorità',
    ],
    // Complexity: complex
    complexityComplex: [
      'crea (un[ao]? )?(dettagliat[ao]|complet[ao])',
      'passo[- ]?per[- ]?passo',
      'implementa|implementazione',
      'piano|pianificazione',
      'strategia|strategic[ao]',
      'codice|programmazione',
      'integra|integrazione',
      'automatizza|automazione',
      'flusso di lavoro',
    ],
  },
  errors: {
    http: {
      forbidden: {
        admin: 'Privilegi di amministratore richiesti per questa operazione.',
        crossTenant: 'Non hai accesso a questa risorsa.',
      },
      notFound: {
        library: 'Libreria non trovata.',
        document: 'Documento non trovato.',
        file: 'File non trovato.',
        email: 'Email non trovata.',
        contact: 'Contatto non trovato.',
      },
      badRequest: {
        noFile: 'Nessun file fornito.',
        unsupportedFileType: (mimeType, supported) =>
          `Tipo di file non supportato: ${mimeType}. Tipi supportati: ${supported}`,
        fileTooLarge: (limitMb) => `Il file supera il limite di ${limitMb}MB.`,
        invalidInput: 'Input non valido.',
      },
    },
    validation: {
      embedding: {
        notArray: "L'embedding deve essere un array.",
        empty: "L'array di embedding non può essere vuoto.",
        tooLarge: (max) => `L'array di embedding supera la dimensione massima (${max}).`,
        invalidValue: (index) => `L'embedding contiene un valore non valido all'indice ${index}.`,
      },
    },
    ai: {
      quotaExceeded: 'Limite mensile di chiamate AI raggiunto. Aggiorna il tuo piano.',
      costLimitDaily: 'Limite giornaliero di costo AI raggiunto. Il limite si resetta a mezzanotte.',
      costLimitMonthly: 'Limite mensile di costo AI raggiunto. Aggiorna il tuo piano.',
      agentFailed: "L'agente non è riuscito a generare una risposta. Riprova.",
      providerNotConfigured: 'Provider AI non configurato.',
      approvalNotInitialized: 'Workflow di approvazione non inizializzato.',
    },
    subscription: {
      canceled: 'Il tuo abbonamento è stato cancellato. Riattivalo per continuare.',
      pastDue: 'Il tuo pagamento è in ritardo. Aggiorna il metodo di pagamento.',
      featureNotAvailable: (feature) => `Questa funzionalità richiede un piano superiore. Aggiorna per accedere a ${feature}.`,
      emailQuotaExceeded: (limit) => `Hai raggiunto il limite mensile di ${limit} email. Aggiorna per maggiore capacità.`,
    },
  },
};
