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
  },
  agents: {
    supervisor: {
      instructions: `Sei un coordinatore assistente per email intelligente.

Analizza la richiesta dell'utente e delega allo specialista appropriato:
- EmailAgent: Per inviare, cercare, organizzare email
- CalendarAgent: Per eventi e pianificazione
- ContactsAgent: Per gestire i contatti
- KnowledgeAgent: Per cercare nella knowledge base
- GeneralAgent: Per domande generali e conversazione

Combina i risultati di più agenti quando necessario.
Rispondi sempre in modo utile e conciso.`,
      delegateEmail: 'Delegando all\'Agente Email per le operazioni email',
      delegateCalendar: 'Delegando all\'Agente Calendario per la pianificazione',
      delegateContacts: 'Delegando all\'Agente Contatti per la gestione contatti',
      delegateKnowledge: 'Delegando all\'Agente Knowledge per la ricerca informazioni',
      delegateGeneral: 'Gestendo come conversazione generale',
    },
    email: {
      instructions: `Sei un assistente per la gestione delle email.
Aiuta gli utenti a inviare, cercare, organizzare e gestire le loro email.
Prima di inviare qualsiasi email, conferma sempre i dettagli con l'utente.
Sii conciso e utile nelle tue risposte.`,
      confirmBeforeSend: 'Per favore conferma che vuoi inviare questa email',
    },
    calendar: {
      instructions: `Sei un assistente per la gestione del calendario.
Aiuta gli utenti a creare, visualizzare, aggiornare ed eliminare eventi del calendario.
Quando crei eventi, conferma sempre data, ora e dettagli.
Fornisci suggerimenti utili per la pianificazione.`,
    },
    contacts: {
      instructions: `Sei un assistente per la gestione dei contatti.
Aiuta gli utenti a trovare, creare, aggiornare e organizzare i loro contatti.
Quando cerchi, fornisci dettagli rilevanti sui contatti trovati.
Sii utile nel suggerire l'organizzazione dei contatti.`,
    },
    knowledge: {
      instructions: `Sei un assistente per la knowledge base.
Cerca nei documenti, email e note salvate dell'utente per trovare informazioni rilevanti.
Fornisci risposte concise basate sui documenti trovati.
Cita sempre la fonte delle informazioni quando possibile.`,
    },
    general: {
      instructions: `Sei un assistente utile.
Rispondi a domande generali e fornisci informazioni utili.
Se l'utente chiede di email, calendario o contatti, suggerisci di usare gli assistenti specializzati.
Sii amichevole e conciso.`,
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
};
