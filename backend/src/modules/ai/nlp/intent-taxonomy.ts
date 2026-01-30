/**
 * Intent Taxonomy for MailAgent NLP
 *
 * Defines all possible user intents and their variations.
 * Used for synthetic dataset generation and intent classification.
 *
 * @see QueryAnalyzerService for pattern-based fallback
 */

export type PrimaryIntent =
  | 'email_search'
  | 'email_compose'
  | 'email_reply'
  | 'email_forward'
  | 'email_delete'
  | 'email_archive'
  | 'email_move'
  | 'email_read'
  | 'email_summarize'
  | 'calendar_view'
  | 'calendar_create'
  | 'calendar_update'
  | 'calendar_delete'
  | 'contact_search'
  | 'contact_create'
  | 'contact_update'
  | 'folder_list'
  | 'folder_create'
  | 'settings_view'
  | 'help'
  | 'greeting'
  | 'farewell'
  | 'thanks'
  | 'status_check'
  | 'unknown';

/** Array of all primary intents for validation */
export const PRIMARY_INTENTS: PrimaryIntent[] = [
  'email_search',
  'email_compose',
  'email_reply',
  'email_forward',
  'email_delete',
  'email_archive',
  'email_move',
  'email_read',
  'email_summarize',
  'calendar_view',
  'calendar_create',
  'calendar_update',
  'calendar_delete',
  'contact_search',
  'contact_create',
  'contact_update',
  'folder_list',
  'folder_create',
  'settings_view',
  'help',
  'greeting',
  'farewell',
  'thanks',
  'status_check',
  'unknown',
];

export interface IntentDefinition {
  intent: PrimaryIntent;
  description: string;
  examples: {
    en: string[];
    it: string[];
  };
  slots?: string[]; // Named entities to extract
  requiresAuth: boolean;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Complete intent taxonomy with bilingual examples.
 * These serve as seeds for synthetic data generation.
 */
export const INTENT_TAXONOMY: IntentDefinition[] = [
  // === EMAIL INTENTS ===
  {
    intent: 'email_search',
    description: 'User wants to find specific emails',
    examples: {
      en: [
        'find emails from {person}',
        'search for emails about {topic}',
        'show me emails from last week',
        'find messages containing {keyword}',
        'where is the email from {person}',
        'look for emails with attachments',
        'find unread emails',
        'search inbox for {topic}',
        'show emails from {company}',
        'find emails sent to {person}',
      ],
      it: [
        'trova email da {person}',
        'cerca email su {topic}',
        'mostra email della settimana scorsa',
        'trova messaggi con {keyword}',
        'dov\'è l\'email di {person}',
        'cerca email con allegati',
        'trova email non lette',
        'cerca nella posta {topic}',
        'mostra email da {company}',
        'trova email inviate a {person}',
      ],
    },
    slots: ['person', 'topic', 'keyword', 'company', 'date_range'],
    requiresAuth: true,
    priority: 'high',
  },
  {
    intent: 'email_compose',
    description: 'User wants to write a new email',
    examples: {
      en: [
        'write an email to {person}',
        'compose a message to {person}',
        'draft an email about {topic}',
        'help me write to {person}',
        'create a new email',
        'I need to send an email to {person}',
        'write a professional email to {person}',
        'compose email regarding {topic}',
        'draft message for {person}',
        'new email to {person} about {topic}',
      ],
      it: [
        'scrivi un\'email a {person}',
        'componi un messaggio per {person}',
        'scrivi una bozza su {topic}',
        'aiutami a scrivere a {person}',
        'crea una nuova email',
        'devo inviare un\'email a {person}',
        'scrivi un\'email professionale a {person}',
        'componi email riguardo {topic}',
        'bozza per {person}',
        'nuova email a {person} su {topic}',
      ],
    },
    slots: ['person', 'topic'],
    requiresAuth: true,
    priority: 'high',
  },
  {
    intent: 'email_reply',
    description: 'User wants to reply to an email',
    examples: {
      en: [
        'reply to {person}',
        'respond to this email',
        'write a reply to {person}',
        'answer {person}\'s email',
        'help me reply to {person}',
        'draft a response to {person}',
        'reply to the email about {topic}',
        'respond to {person} about {topic}',
        'answer this message',
        'send a reply',
      ],
      it: [
        'rispondi a {person}',
        'rispondi a questa email',
        'scrivi una risposta a {person}',
        'rispondi all\'email di {person}',
        'aiutami a rispondere a {person}',
        'bozza risposta per {person}',
        'rispondi all\'email su {topic}',
        'rispondi a {person} riguardo {topic}',
        'rispondi a questo messaggio',
        'invia una risposta',
      ],
    },
    slots: ['person', 'topic'],
    requiresAuth: true,
    priority: 'high',
  },
  {
    intent: 'email_forward',
    description: 'User wants to forward an email',
    examples: {
      en: [
        'forward this to {person}',
        'forward email to {person}',
        'send this to {person}',
        'forward the message from {person} to {person2}',
        'can you forward this',
        'forward to my team',
        'share this email with {person}',
      ],
      it: [
        'inoltra questo a {person}',
        'inoltra email a {person}',
        'manda questo a {person}',
        'inoltra il messaggio di {person} a {person2}',
        'puoi inoltrare questo',
        'inoltra al mio team',
        'condividi questa email con {person}',
      ],
    },
    slots: ['person', 'person2'],
    requiresAuth: true,
    priority: 'medium',
  },
  {
    intent: 'email_delete',
    description: 'User wants to delete emails',
    examples: {
      en: [
        'delete this email',
        'remove this message',
        'trash this',
        'delete emails from {person}',
        'remove all spam',
        'delete selected emails',
        'move to trash',
      ],
      it: [
        'elimina questa email',
        'rimuovi questo messaggio',
        'cestina questo',
        'elimina email da {person}',
        'rimuovi tutto lo spam',
        'elimina email selezionate',
        'sposta nel cestino',
      ],
    },
    slots: ['person'],
    requiresAuth: true,
    priority: 'medium',
  },
  {
    intent: 'email_archive',
    description: 'User wants to archive emails',
    examples: {
      en: [
        'archive this email',
        'archive messages from {person}',
        'move to archive',
        'archive selected',
        'archive all read emails',
      ],
      it: [
        'archivia questa email',
        'archivia messaggi da {person}',
        'sposta in archivio',
        'archivia selezionati',
        'archivia tutte le email lette',
      ],
    },
    slots: ['person'],
    requiresAuth: true,
    priority: 'low',
  },
  {
    intent: 'email_move',
    description: 'User wants to move emails to a folder',
    examples: {
      en: [
        'move this to {folder}',
        'put this in {folder}',
        'move email to {folder}',
        'organize into {folder}',
        'label as {folder}',
      ],
      it: [
        'sposta questo in {folder}',
        'metti in {folder}',
        'sposta email in {folder}',
        'organizza in {folder}',
        'etichetta come {folder}',
      ],
    },
    slots: ['folder'],
    requiresAuth: true,
    priority: 'medium',
  },
  {
    intent: 'email_read',
    description: 'User wants to read/open an email',
    examples: {
      en: [
        'open email from {person}',
        'read the message from {person}',
        'show me the email about {topic}',
        'what did {person} say',
        'open the latest email',
        'read unread messages',
      ],
      it: [
        'apri email da {person}',
        'leggi il messaggio di {person}',
        'mostrami l\'email su {topic}',
        'cosa ha detto {person}',
        'apri l\'ultima email',
        'leggi messaggi non letti',
      ],
    },
    slots: ['person', 'topic'],
    requiresAuth: true,
    priority: 'high',
  },
  {
    intent: 'email_summarize',
    description: 'User wants a summary of emails',
    examples: {
      en: [
        'summarize this email',
        'give me a summary of emails from {person}',
        'what\'s the gist of this',
        'tldr this email',
        'summarize my inbox',
        'what are the key points',
        'brief me on recent emails',
      ],
      it: [
        'riassumi questa email',
        'dammi un riassunto delle email di {person}',
        'qual è il succo',
        'riassunto di questa email',
        'riassumi la mia posta',
        'quali sono i punti chiave',
        'briefing sulle email recenti',
      ],
    },
    slots: ['person'],
    requiresAuth: true,
    priority: 'medium',
  },

  // === CALENDAR INTENTS ===
  {
    intent: 'calendar_view',
    description: 'User wants to see calendar/events',
    examples: {
      en: [
        'show my calendar',
        'what\'s on my schedule today',
        'show events for this week',
        'what meetings do I have',
        'check my calendar for {date}',
        'any appointments tomorrow',
        'show schedule for {date}',
      ],
      it: [
        'mostra il mio calendario',
        'cosa c\'è in programma oggi',
        'mostra eventi di questa settimana',
        'che riunioni ho',
        'controlla calendario per {date}',
        'appuntamenti domani',
        'mostra programma per {date}',
      ],
    },
    slots: ['date'],
    requiresAuth: true,
    priority: 'high',
  },
  {
    intent: 'calendar_create',
    description: 'User wants to create an event',
    examples: {
      en: [
        'schedule a meeting with {person}',
        'create an event for {date}',
        'book a meeting about {topic}',
        'add appointment with {person}',
        'schedule call with {person}',
        'create reminder for {date}',
        'set up meeting with {person} on {date}',
      ],
      it: [
        'programma una riunione con {person}',
        'crea un evento per {date}',
        'prenota un meeting su {topic}',
        'aggiungi appuntamento con {person}',
        'programma chiamata con {person}',
        'crea promemoria per {date}',
        'organizza meeting con {person} il {date}',
      ],
    },
    slots: ['person', 'date', 'topic'],
    requiresAuth: true,
    priority: 'high',
  },
  {
    intent: 'calendar_update',
    description: 'User wants to update an event',
    examples: {
      en: [
        'reschedule meeting with {person}',
        'move the event to {date}',
        'change meeting time',
        'update appointment with {person}',
        'postpone the meeting',
      ],
      it: [
        'riprogramma riunione con {person}',
        'sposta l\'evento a {date}',
        'cambia orario meeting',
        'aggiorna appuntamento con {person}',
        'posticipa la riunione',
      ],
    },
    slots: ['person', 'date'],
    requiresAuth: true,
    priority: 'medium',
  },
  {
    intent: 'calendar_delete',
    description: 'User wants to delete an event',
    examples: {
      en: [
        'cancel meeting with {person}',
        'delete the event on {date}',
        'remove appointment',
        'cancel tomorrow\'s meeting',
      ],
      it: [
        'cancella riunione con {person}',
        'elimina l\'evento del {date}',
        'rimuovi appuntamento',
        'cancella la riunione di domani',
      ],
    },
    slots: ['person', 'date'],
    requiresAuth: true,
    priority: 'medium',
  },

  // === CONTACT INTENTS ===
  {
    intent: 'contact_search',
    description: 'User wants to find contact information',
    examples: {
      en: [
        'find contact for {person}',
        'what\'s {person}\'s email',
        'show contact info for {person}',
        'look up {person}',
        'find {person} from {company}',
        'who is {person}',
        'get phone number for {person}',
      ],
      it: [
        'trova contatto di {person}',
        'qual è l\'email di {person}',
        'mostra info contatto per {person}',
        'cerca {person}',
        'trova {person} di {company}',
        'chi è {person}',
        'trova numero di {person}',
      ],
    },
    slots: ['person', 'company'],
    requiresAuth: true,
    priority: 'high',
  },
  {
    intent: 'contact_create',
    description: 'User wants to add a contact',
    examples: {
      en: [
        'add {person} to contacts',
        'save this contact',
        'create contact for {person}',
        'add new contact',
        'save {person}\'s email',
      ],
      it: [
        'aggiungi {person} ai contatti',
        'salva questo contatto',
        'crea contatto per {person}',
        'aggiungi nuovo contatto',
        'salva email di {person}',
      ],
    },
    slots: ['person'],
    requiresAuth: true,
    priority: 'medium',
  },
  {
    intent: 'contact_update',
    description: 'User wants to update a contact',
    examples: {
      en: [
        'update {person}\'s contact',
        'change {person}\'s email',
        'edit contact for {person}',
        'update phone for {person}',
      ],
      it: [
        'aggiorna contatto di {person}',
        'cambia email di {person}',
        'modifica contatto per {person}',
        'aggiorna telefono di {person}',
      ],
    },
    slots: ['person'],
    requiresAuth: true,
    priority: 'low',
  },

  // === FOLDER INTENTS ===
  {
    intent: 'folder_list',
    description: 'User wants to see folders/labels',
    examples: {
      en: [
        'show my folders',
        'list all labels',
        'what folders do I have',
        'show email categories',
      ],
      it: [
        'mostra le mie cartelle',
        'elenca tutte le etichette',
        'che cartelle ho',
        'mostra categorie email',
      ],
    },
    slots: [],
    requiresAuth: true,
    priority: 'low',
  },
  {
    intent: 'folder_create',
    description: 'User wants to create a folder',
    examples: {
      en: [
        'create folder {folder}',
        'add new label {folder}',
        'make a folder called {folder}',
        'new folder for {topic}',
      ],
      it: [
        'crea cartella {folder}',
        'aggiungi etichetta {folder}',
        'crea una cartella chiamata {folder}',
        'nuova cartella per {topic}',
      ],
    },
    slots: ['folder', 'topic'],
    requiresAuth: true,
    priority: 'low',
  },

  // === UTILITY INTENTS ===
  {
    intent: 'settings_view',
    description: 'User wants to access settings',
    examples: {
      en: [
        'open settings',
        'go to preferences',
        'change my settings',
        'account settings',
        'configure email',
      ],
      it: [
        'apri impostazioni',
        'vai alle preferenze',
        'cambia impostazioni',
        'impostazioni account',
        'configura email',
      ],
    },
    slots: [],
    requiresAuth: true,
    priority: 'low',
  },
  {
    intent: 'help',
    description: 'User needs help',
    examples: {
      en: [
        'help',
        'help me',
        'what can you do',
        'how does this work',
        'I need help',
        'show commands',
        'what are my options',
      ],
      it: [
        'aiuto',
        'aiutami',
        'cosa puoi fare',
        'come funziona',
        'ho bisogno di aiuto',
        'mostra comandi',
        'quali sono le opzioni',
      ],
    },
    slots: [],
    requiresAuth: false,
    priority: 'medium',
  },
  {
    intent: 'greeting',
    description: 'User greets the assistant',
    examples: {
      en: [
        'hello',
        'hi',
        'hey',
        'good morning',
        'good afternoon',
        'good evening',
        'hi there',
        'hey there',
      ],
      it: [
        'ciao',
        'salve',
        'buongiorno',
        'buonasera',
        'buon pomeriggio',
        'ehi',
        'saluti',
      ],
    },
    slots: [],
    requiresAuth: false,
    priority: 'low',
  },
  {
    intent: 'farewell',
    description: 'User says goodbye',
    examples: {
      en: [
        'bye',
        'goodbye',
        'see you',
        'talk later',
        'gotta go',
        'bye bye',
      ],
      it: [
        'ciao',
        'arrivederci',
        'a dopo',
        'ci vediamo',
        'devo andare',
        'alla prossima',
      ],
    },
    slots: [],
    requiresAuth: false,
    priority: 'low',
  },
  {
    intent: 'thanks',
    description: 'User expresses gratitude',
    examples: {
      en: [
        'thanks',
        'thank you',
        'thanks a lot',
        'much appreciated',
        'that helps',
        'perfect thanks',
      ],
      it: [
        'grazie',
        'ti ringrazio',
        'grazie mille',
        'molto gentile',
        'perfetto grazie',
        'grazie tante',
      ],
    },
    slots: [],
    requiresAuth: false,
    priority: 'low',
  },
  {
    intent: 'status_check',
    description: 'User wants status/summary',
    examples: {
      en: [
        'what\'s new',
        'any updates',
        'inbox status',
        'how many unread',
        'give me a briefing',
        'what did I miss',
        'summary please',
      ],
      it: [
        'novità',
        'aggiornamenti',
        'stato posta',
        'quante non lette',
        'dammi un briefing',
        'cosa mi sono perso',
        'riassunto per favore',
      ],
    },
    slots: [],
    requiresAuth: true,
    priority: 'high',
  },
  {
    intent: 'unknown',
    description: 'Unrecognized intent',
    examples: {
      en: [
        'asdfghjkl',
        'random gibberish',
        '12345',
        '...',
      ],
      it: [
        'qwertyuiop',
        'nonsense',
        '67890',
        '???',
      ],
    },
    slots: [],
    requiresAuth: false,
    priority: 'low',
  },
];

/**
 * Slot fillers for synthetic data generation
 */
export const SLOT_FILLERS = {
  person: {
    en: [
      'John', 'Sarah', 'Mike', 'Emma', 'David', 'Lisa', 'James', 'Anna',
      'John Smith', 'Sarah Johnson', 'Michael Brown', 'Emily Davis',
      'the boss', 'my manager', 'the client', 'the team', 'HR', 'IT support',
      'Dr. Smith', 'Mr. Johnson', 'Mrs. Williams',
    ],
    it: [
      'Marco', 'Giulia', 'Luca', 'Anna', 'Francesco', 'Maria', 'Alessandro', 'Sofia',
      'Marco Rossi', 'Giulia Bianchi', 'Luca Ferrari', 'Anna Russo',
      'il capo', 'il mio manager', 'il cliente', 'il team', 'le risorse umane',
      'Dott. Rossi', 'Sig. Bianchi', 'Sig.ra Ferrari',
    ],
  },
  topic: {
    en: [
      'the project', 'the meeting', 'the budget', 'Q4 results', 'the proposal',
      'vacation request', 'invoice', 'contract', 'deadline', 'presentation',
      'sales report', 'marketing plan', 'customer feedback', 'product launch',
    ],
    it: [
      'il progetto', 'la riunione', 'il budget', 'risultati Q4', 'la proposta',
      'richiesta ferie', 'fattura', 'contratto', 'scadenza', 'presentazione',
      'report vendite', 'piano marketing', 'feedback cliente', 'lancio prodotto',
    ],
  },
  keyword: {
    en: [
      'urgent', 'important', 'ASAP', 'review', 'approval', 'question',
      'follow up', 'reminder', 'action required', 'FYI',
    ],
    it: [
      'urgente', 'importante', 'subito', 'revisione', 'approvazione', 'domanda',
      'follow up', 'promemoria', 'azione richiesta', 'per conoscenza',
    ],
  },
  company: {
    en: [
      'Google', 'Microsoft', 'Apple', 'Amazon', 'Acme Corp', 'Tech Solutions',
      'Global Industries', 'the client company', 'our partner',
    ],
    it: [
      'Google', 'Microsoft', 'Apple', 'Amazon', 'Acme Srl', 'Tech Solutions',
      'Industrie Globali', 'l\'azienda cliente', 'il nostro partner',
    ],
  },
  date: {
    en: [
      'today', 'tomorrow', 'Monday', 'Tuesday', 'next week', 'this Friday',
      'January 15', 'next month', 'the 20th', 'end of month',
    ],
    it: [
      'oggi', 'domani', 'lunedì', 'martedì', 'settimana prossima', 'questo venerdì',
      '15 gennaio', 'il mese prossimo', 'il 20', 'fine mese',
    ],
  },
  folder: {
    en: [
      'Work', 'Personal', 'Important', 'Archive', 'Projects', 'Clients',
      'Receipts', 'Travel', 'Finance', 'Marketing',
    ],
    it: [
      'Lavoro', 'Personale', 'Importante', 'Archivio', 'Progetti', 'Clienti',
      'Ricevute', 'Viaggi', 'Finanza', 'Marketing',
    ],
  },
};

export type SlotType = keyof typeof SLOT_FILLERS;
