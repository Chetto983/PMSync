/**
 * English (US) translations for VoltAgent
 *
 * To add a new language, copy this file and translate all strings.
 */
import type { VoltAgentTranslations } from './index';

export const en: VoltAgentTranslations = {
  tools: {
    email: {
      sent: (to, subject) => `Email sent to ${to} with subject "${subject}"`,
      replied: (subject) => `Replied to email "${subject}"`,
      forwarded: (to) => `Email forwarded to ${to}`,
      searched: (count, query) => `Found ${count} emails for "${query}"`,
      deleted: (subject) => `Email "${subject}" deleted`,
      archived: (subject) => `Email "${subject}" archived`,
      markedRead: (subject) => `Email "${subject}" marked as read`,
      markedUnread: (subject) => `Email "${subject}" marked as unread`,
      starred: (subject) => `Email "${subject}" starred`,
      unstarred: (subject) => `Email "${subject}" unstarred`,
      unreadCount: (count) => `${count} unread emails`,
      moved: (subject, folder) => `Email "${subject}" moved to ${folder}`,
      labeled: (subject, label) => `Label "${label}" added to "${subject}"`,
      unlabeled: (subject, label) => `Label "${label}" removed from "${subject}"`,
      noSubject: '(No subject)',
      serviceUnavailable: 'Email service is not available',
      notFound: 'Email not found',
      requiresApproval: 'This action requires approval',
    },
    calendar: {
      eventsFound: (count) => `${count} events found`,
      eventCreated: (title, date) => `Event "${title}" created for ${date}`,
      eventUpdated: (title) => `Event "${title}" updated`,
      eventDeleted: (title) => `Event "${title}" deleted`,
      slotAvailable: 'The time slot is available',
      slotConflict: (count) => `There are ${count} conflicting events`,
      serviceUnavailable: 'Calendar service is not available',
      notFound: 'Event not found',
      requiresApproval: 'This action requires approval',
    },
    contacts: {
      found: (count, query) => `Found ${count} contacts for "${query}"`,
      contact: 'Contact',
      created: (name) => `Contact "${name}" created`,
      updated: (name) => `Contact "${name}" updated`,
      deleted: (name) => `Contact "${name}" deleted`,
      alreadyExists: (email) => `Contact with email ${email} already exists`,
      notFound: 'Contact not found',
      requiresApproval: 'This action requires approval',
    },
    knowledge: {
      found: (count) => `Found ${count} relevant documents`,
      noResults: 'No relevant documents found',
    },
    webSearch: {
      description: 'Search for current information on the web. Use this tool when the user asks about recent information, news, current events, or data that may have changed since the model was last updated.',
      queryDescription: 'The web search query. Be specific for better results.',
      sources: 'Sources:',
      searchFailed: (error) => `Web search failed: ${error}`,
      noResults: 'No results found',
    },
    folder: {
      created: (name) => `Folder "${name}" created`,
      renamed: (oldName, newName) => `Folder renamed from "${oldName}" to "${newName}"`,
      deleted: (name) => `Folder "${name}" deleted`,
      emailMoved: (subject, folder) => `Email "${subject}" moved to folder "${folder}"`,
      notFound: 'Folder not found',
      requiresApproval: 'This action requires approval',
    },
    common: {
      success: 'Success',
      error: 'Error',
      pending: 'Pending approval',
      approved: 'Approved',
      rejected: 'Rejected',
      executed: 'Executed',
    },
    insights: {
      summarize: {
        description: 'Summarize email content highlighting intent, requests, and next steps',
        systemPrompt:
          'You are an assistant who summarizes business emails. Reply with a short summary in PLAIN TEXT (max 5 sentences). Highlight intent, requests, and next steps. DO NOT use markdown.',
      },
      sentiment: {
        description: 'Analyze the sentiment and tone of an email',
        systemPrompt:
          'Analyze the email sentiment. Reply in JSON: {"sentiment":"positive|negative|neutral", "tone":"formal|casual|urgent|friendly", "confidence":0.0-1.0, "reasoning":"..."}',
      },
      // 2025 Best Practices - Aspect-Based Sentiment Analysis (ABSA)
      sentimentDeep: {
        description: 'Deep sentiment analysis with emotion detection, aspect-based analysis, and churn risk',
        systemPrompt: `Analyze email sentiment with deep analysis. Reply ONLY in JSON:
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
Consider: language used, punctuation, context, sarcasm/irony, implicit urgency.`,
      },
      priority: {
        description: 'Calculate email priority with multi-factor scoring',
        systemPrompt: `Calculate email priority. Consider: urgency, importance, deadline, sentiment. Reply in JSON:
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
        description: 'Comprehensive email analysis combining sentiment, priority, and intent',
        systemPrompt: `Analyze the email comprehensively. Reply in JSON:
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
        description: "Compose an intelligent reply to an email based on context and user writing style",
        systemPrompt: (toneInstruction) =>
          `You are an assistant that drafts clear, professional email replies. ${toneInstruction} Reply ONLY in JSON: {"body":"...", "subject":"Re: ..."}. Avoid markdown.`,
        originalEmail: 'Original email:',
        replyInstructions: 'Reply instructions:',
        // Compose prompt strings
        recipients: 'Recipients',
        subjectHint: 'Subject hint',
        requestedTone: 'Requested tone',
        threadContext: 'Thread context:',
        message: 'Message',
        draftInstruction: 'Draft a ready-to-send email.',
        userPrompt: 'User prompt',
        jsonInstruction: 'Return JSON with body and subject fields. No markdown.',
      },
      actionItems: {
        description: 'Extract action items and tasks to complete from an email',
        systemPrompt:
          'Extract action items from the email. Reply in JSON: {"actionItems":[{"task":"...", "priority":"high|medium|low", "deadline":"...?", "assignee":"...?"}], "hasDeadlines":true|false}',
      },
      categorize: {
        description: 'Suggest appropriate labels to categorize an email',
        systemPrompt: (labels) => `Suggest up to 3 labels from [${labels}]. Respond in JSON: {"labels":["..."]}.`,
      },
      smartReplies: {
        description: 'Generate 2-3 quick, concise replies to an email',
        systemPrompt: (toneInstruction) =>
          `Generate 2-3 concise replies to the email. ${toneInstruction} Respond in JSON: {"replies":["..."]}.`,
      },
      // Enhanced 2025 tools
      analyze: {
        description: 'Comprehensive email analysis: sentiment, urgency, intent, priority, and escalation risk',
      },
      detectIntent: {
        description: 'Detect email intent (action required, FYI, question, meeting request, escalation, etc.)',
      },
      calculatePriority: {
        description: 'Calculate email priority score based on urgency, sender importance, and content analysis',
      },
      tones: {
        formal: 'Use a formal, professional tone with proper business etiquette.',
        casual: 'Use a friendly, conversational tone while remaining professional.',
        technical: 'Use a precise, technical tone with clear and direct language.',
      },
      emailBody: 'Email body:',
      noSubject: '(no subject)',
      contentUnavailable: '(content unavailable)',
      // Email header labels
      subject: 'Subject',
      from: 'From',
      to: 'To',
    },
  },
  agents: {
    supervisor: {
      instructions: `You are a helpful email assistant coordinator.
IMPORTANT: ALWAYS respond in English.

Analyze the user's request and delegate to the appropriate specialist:
- EmailAgent: For sending, searching, organizing emails
- CalendarAgent: For events and scheduling
- ContactsAgent: For managing contacts
- KnowledgeAgent: For searching stored knowledge
- WebSearchAgent: For searching current information from the web (news, events, facts)
- GeneralAgent: For general questions and chat

Combine results from multiple agents when needed.
Always respond in a helpful and concise manner, always in English.`,
      delegateEmail: 'Delegating to Email Agent for email operations',
      delegateCalendar: 'Delegating to Calendar Agent for scheduling',
      delegateContacts: 'Delegating to Contacts Agent for contact management',
      delegateKnowledge: 'Delegating to Knowledge Agent for information lookup',
      delegateGeneral: 'Handling as general conversation',
      delegateWebSearch: 'Delegating to Web Search Agent for current information',
    },
    email: {
      instructions: `You are an email management assistant. ALWAYS respond in English.
Help users send, search, organize, and manage their emails.
Before sending any email, always confirm the details with the user.
Be concise and helpful in your responses, always in English.`,
      confirmBeforeSend: 'Please confirm you want to send this email',
    },
    calendar: {
      instructions: `You are a calendar management assistant. ALWAYS respond in English.
Help users create, view, update, and delete calendar events.
When creating events, always confirm the date, time, and details.
Provide helpful suggestions for scheduling, always in English.`,
    },
    contacts: {
      instructions: `You are a contacts management assistant. ALWAYS respond in English.
Help users find, create, update, and organize their contacts.
When searching, provide relevant details about found contacts.
Be helpful in suggesting contact organization, always in English.`,
    },
    knowledge: {
      instructions: `You are a knowledge base assistant. ALWAYS respond in English.
Search the user's stored documents, emails, and notes to find relevant information.
Provide concise answers based on the found documents.
Always cite the source of information when possible, always in English.`,
    },
    general: {
      instructions: `You are a helpful assistant. ALWAYS respond in English.
Answer general questions and provide helpful information.
If the user asks about emails, calendar, or contacts, suggest using the specialized assistants.
Be friendly and concise, always in English.`,
    },
    webSearch: {
      instructions: `You are an expert assistant for searching current information on the web. ALWAYS respond in English.

CAPABILITIES:
- Search for current information and recent news
- Find updated data on specific topics
- Verify facts and dates
- Provide sources for found information

WHEN TO USE WEB SEARCH:
- Questions about recent or current events
- Requests for information that may have changed
- Verification of specific facts or dates
- Current topics like news, sports, finance

RESPONSE:
- Always provide sources for information
- Indicate if information may be dated
- Be clear when you cannot find reliable information`,
    },
  },
  actions: {
    emailSent: (to, subject) => `Email sent to ${to} with subject "${subject}".`,
    emailSentNoSubject: '(No subject)',
    replySent: (to) => `Reply sent to ${to}.`,
    emailForwarded: (to) => `Email forwarded to ${to}.`,
    emailDeleted: (subject) => `Email "${subject}" deleted.`,
    emailArchived: (subject) => `Email "${subject}" archived.`,
    emailMarkedRead: 'Email marked as read.',
    emailMarkedUnread: 'Email marked as unread.',
    emailStarred: 'Email starred.',
    emailUnstarred: 'Star removed from email.',
    emailsSearchFound: (count, query) =>
      `Found ${count} email${count === 1 ? '' : 's'} for "${query}".`,
    emailsSearchNotFound: (query) => `No emails found for "${query}".`,
    labelsAdded: (labels) => `Labels added: ${labels}.`,
    labelsRemoved: (labels) => `Labels removed: ${labels}.`,
    labelsAddedAndRemoved: (added, removed) =>
      `Labels added: ${added}. Labels removed: ${removed}.`,
    emailCategorized: (categories) => `Email categorized with: ${categories}.`,
    unreadEmailsFound: (count) =>
      count === 0 ? 'No unread emails found.' : `Found ${count} unread email${count === 1 ? '' : 's'}.`,
    eventCreated: (title, date) => `Event "${title}" created for ${date}.`,
    eventUpdated: (title) => `Event "${title}" updated.`,
    eventDeleted: (title) => `Event "${title}" deleted.`,
    eventsFound: (count) =>
      count === 0
        ? 'No events found in the selected period.'
        : `Found ${count} event${count === 1 ? '' : 's'} in the selected period.`,
    availabilityFree: (count) =>
      `You have free time. ${count} existing commitment${count === 1 ? '' : 's'}.`,
    availabilityBusy: (count) => `Busy day with ${count} events.`,
    eventRescheduled: (title, date) => `Event "${title}" rescheduled to ${date}.`,
    contactCreated: (name) => `Contact "${name}" created.`,
    contactUpdated: (name) => `Contact "${name}" updated.`,
    contactDeleted: (name) => `Contact "${name}" deleted.`,
    contactsSearchFound: (count, query) =>
      `Found ${count} contact${count === 1 ? '' : 's'} for "${query}".`,
    contactsSearchNotFound: (query) => `No contacts found for "${query}".`,
    contactsMerged: (count, name, removed) =>
      `Merged ${count} contacts into "${name}". ${removed} duplicate${removed === 1 ? '' : 's'} removed.`,
    contactFound: (name) => `Found contact: ${name}.`,
    contactNotFound: 'Contact not found',
    folderCreated: (name) => `Folder "${name}" created.`,
    folderRenamed: (name) => `Folder renamed to "${name}".`,
    folderDeleted: (path) => `Folder "${path}" deleted.`,
    noSubject: 'No subject',
    unknownSender: 'Unknown sender',
    event: 'Event',
    contact: 'Contact',
  },
  observability: {
    agent: {
      operationStarted: 'Agent operation started',
      operationCompleted: 'Agent operation completed',
      operationFailed: 'Agent operation failed',
    },
    tool: {
      executionStarted: 'Tool execution started',
      executionCompleted: 'Tool execution completed',
      executionFailed: 'Tool execution failed',
    },
    hitl: {
      actionAutoApproved: 'Action auto-approved',
      actionSuspended: 'Action suspended for approval',
      actionApprovedByHuman: 'Action approved by human',
      actionRejectedByHuman: 'Action rejected by human',
      actionExecuted: 'Action executed successfully',
      actionExecutionFailed: 'Action execution failed',
      requiresApproval: (reason) => `Requires approval: ${reason}`,
      highSeverityAction: 'High severity action requires approval',
      lowConfidenceAction: 'Low confidence action requires approval',
    },
    learning: {
      feedbackRecorded: 'Feedback recorded',
      profileUpdated: 'Learning profile updated',
      confidenceAdjusted: 'Confidence adjusted based on learning',
      learningApplied: (boost) => `Learning applied: ${boost > 0 ? '+' : ''}${(boost * 100).toFixed(1)}% confidence`,
      noLearningData: 'No learning data available',
      profileReset: 'Learning profile reset',
    },
  },
  mistral: {
    title: {
      system: 'You summarise conversations. Craft a short, descriptive title (max 8 words) for the conversation provided. Reply with the title only, no quotes.',
      conversationLabel: 'Conversation',
      titleLabel: 'Title',
      defaultTitle: 'New chat',
    },
    roles: {
      assistant: 'Assistant',
      user: 'User',
    },
    rag: {
      sourceLabel: (index) => `Source ${index}`,
      contextIntro: 'Use the following information if relevant:',
    },
    errors: {
      emptyResponse: 'Empty response from AI service',
      notConfigured: 'AI assistant is not configured for this environment yet. Please ask your administrator to set MISTRAL_API_KEY.',
      unavailable: 'The AI service is currently unavailable. Your message was saved; please try again in a moment.',
      unauthorized: 'AI request was rejected (unauthorized). Please verify that MISTRAL_API_KEY is valid and has the required permissions.',
      serverError: 'Mistral API is experiencing issues right now. Your message was saved; please try again shortly.',
      tryAgain: 'I could not generate a response just now. Please try asking again.',
    },
  },
  deadline: {
    deadlineKeywords: [
      // Explicit deadline words
      'deadline',
      'due',
      'due date',
      'cutoff',
      'cut-off',
      'end date',
      // Prepositions indicating deadline
      'by',
      'before',
      'until',
      'no later than',
      'not later than',
      // Action phrases
      'must be done',
      'submit by',
      'complete by',
      'finish by',
      'deliver by',
      'send by',
      // Expiration
      'expires',
      'expiration',
      'expiry',
      'valid until',
    ],
    urgencyKeywords: [
      'urgent',
      'asap',
      'immediately',
      'critical',
      'time-sensitive',
      'priority',
      'important',
    ],
    recurringPatterns: [
      /every\s+(week|month|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /weekly|monthly|daily|annually|yearly/i,
    ],
  },
};
