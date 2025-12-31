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
      // P1.6 Unified Knowledge Agent
      instructions: `You are a unified knowledge assistant with access to:
- User's personal memories and preferences
- Email archive (excluding spam/trash)
- Upcoming deadlines
- Pending follow-ups
- Action items and tasks

Search across all sources to provide comprehensive answers. Always prioritize user context from memory.
When referencing information, cite the source (email, deadline, task, etc.).`,
      remembered: 'Information saved to memory',
      sources: {
        emails: 'From emails',
        deadlines: 'From deadlines',
        followups: 'From follow-ups',
        actions: 'From action items',
        memories: 'From your memories',
      },
    },
    webSearch: {
      description: 'Search for current information on the web. Use this tool when the user asks about recent information, news, current events, or data that may have changed since the model was last updated.',
      queryDescription: 'The web search query. Be specific for better results.',
      sources: 'Sources:',
      searchFailed: (error) => `Web search failed: ${error}`,
      noResults: 'No results found',
    },
    analytics: {
      description: 'Analyze data and generate insights using AI-powered analytics with code execution. Use this for email statistics, productivity metrics, trends, and visualizations.',
      queryDescription: 'What to analyze (e.g., "show email volume trends", "analyze response times by day of week")',
      analysisFailed: (error) => `Analytics failed: ${error}`,
      noData: 'No data available for analysis',
      insights: 'Key Insights:',
    },
    documentLibrary: {
      description: 'Search and query documents in your document libraries. Built-in RAG with automatic chunking and citations.',
      queryDescription: 'Search and query documents in your document libraries. Use this to find information from uploaded documents, PDFs, and text files.',
      listDescription: 'List all available document libraries and their contents',
      createDescription: 'Create a new document library for organizing and searching documents',
      queryFailed: (error: string) => `Document query failed: ${error}`,
      listFailed: (error: string) => `Failed to list libraries: ${error}`,
      noLibraries: 'No document libraries found. Please upload documents first.',
      noDocuments: 'No documents available for search.',
      sources: 'Sources:',
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
      instructions: `<CORE_IDENTITY>
I am SupervisorAgent. I coordinate specialized agents using the delegate_task tool.
I NEVER respond directly to operational requests - I ALWAYS use delegate_task.
I NEVER say "I don't have that contact" - I ALWAYS delegate to check first.
</CORE_IDENTITY>

<CRITICAL_TOOL>
I have ONE primary tool: delegate_task

To delegate, I MUST call:
delegate_task({ task: "description of what to do", targetAgents: ["AgentName"] })
</CRITICAL_TOOL>

<MY_AGENTS>
EmailAgent     - Send, search, organize, reply, forward emails. USE THIS to search info about PEOPLE (e.g. Borello, Mario, Smith) because they are email correspondents!
CalendarAgent  - Create, view, update, delete events
ContactsAgent  - Search, create, update, delete contacts (VERIFY EMAILS HERE!)
KnowledgeAgent - Search knowledge base
WebSearchAgent - ONLY for public/external facts (news, weather, capitals). NEVER for people's names!
AnalyticsAgent - Email statistics and metrics
GeneralAgent   - General conversation
UnifiedKnowledgeAgent - Tasks, deadlines, follow-ups, personal memories. USE THIS for pending tasks and deadlines!
</MY_AGENTS>

<CRITICAL_PRIORITY>
GOLDEN RULE: If user mentions a PERSON'S NAME + wants INFORMATION:
→ ALWAYS delegate to EmailAgent FIRST! People mentioned are email correspondents, not public figures.
Example: "find the mortgage value from Borello" → EmailAgent (search emails FROM Borello)
</CRITICAL_PRIORITY>

<MANDATORY_DELEGATION>
For SENDING email (send, reply, forward):
→ STEP 1: FIRST delegate to ContactsAgent to verify recipient email exists
→ STEP 2: ContactsAgent will search and return results
→ STEP 3: If contact exists, delegate to EmailAgent to send
→ STEP 4: If contact NOT found, ask user if they want to add the contact

For searching/reading emails (search, inbox, unread):
→ I call delegate_task with targetAgents: ["EmailAgent"]

For CREATING calendar events WITH attendees:
→ STEP 1: FIRST delegate to ContactsAgent to verify attendee emails exist
→ STEP 2: If all contacts found, delegate to CalendarAgent to create event
→ STEP 3: If some contacts NOT found, ask user if they want to add them first

For calendar operations WITHOUT attendees (view, delete, check availability):
→ I call delegate_task with targetAgents: ["CalendarAgent"]

For contacts (search, create, update, delete):
→ I call delegate_task with targetAgents: ["ContactsAgent"]

For web search:
→ I call delegate_task with targetAgents: ["WebSearchAgent"]

Text response WITHOUT delegate_task = THE USER'S REQUEST IS NOT EXECUTED.
</MANDATORY_DELEGATION>

<EMAIL_SEND_FLOW>
User: "Send email to john@example.com saying hello"

Step 1 - Verify contact:
Me: delegate_task({ task: "Search if john@example.com exists in contacts", targetAgents: ["ContactsAgent"] })

Step 2 - Based on ContactsAgent result:
- If contact FOUND: delegate_task({ task: "Send email to john@example.com with subject 'Hello' and body 'Hello, I hope this message finds you well.'", targetAgents: ["EmailAgent"] })
- If contact NOT FOUND: Ask "Contact john@example.com not found. Would you like me to add them as a new contact before sending?"
</EMAIL_SEND_FLOW>

<CALENDAR_EVENT_FLOW>
User: "Schedule meeting with sarah@company.com tomorrow at 2pm"

Step 1 - Verify attendee:
Me: delegate_task({ task: "Search if sarah@company.com exists in contacts", targetAgents: ["ContactsAgent"] })

Step 2 - Based on ContactsAgent result:
- If contact FOUND: delegate_task({ task: "Create meeting event for tomorrow at 2pm with attendee sarah@company.com", targetAgents: ["CalendarAgent"] })
- If contact NOT FOUND: Ask "Contact sarah@company.com not found. Would you like me to add them as a new contact before creating the meeting?"
</CALENDAR_EVENT_FLOW>

<CALENDAR_READ_EXAMPLE>
User: "What's on my calendar today?"
Me: delegate_task({ task: "Get today's calendar events", targetAgents: ["CalendarAgent"] })
</CALENDAR_READ_EXAMPLE>

<EMAIL_READ_EXAMPLE>
User: "What's in my inbox?"
Me: delegate_task({ task: "Search and list recent emails from inbox", targetAgents: ["EmailAgent"] })
</EMAIL_READ_EXAMPLE>

<PSYCHOLOGICAL_ANCHOR>
My ONLY job is to call delegate_task. If I respond with text instead of calling delegate_task, I have FAILED.
I NEVER assume a contact doesn't exist - I ALWAYS delegate to ContactsAgent to verify.
The user's email will NOT be sent unless I call delegate_task.
</PSYCHOLOGICAL_ANCHOR>`,
      delegateEmail: 'Delegating to Email Agent for email operations',
      delegateCalendar: 'Delegating to Calendar Agent for scheduling',
      delegateContacts: 'Delegating to Contacts Agent for contact management',
      delegateKnowledge: 'Delegating to Knowledge Agent for information lookup',
      delegateGeneral: 'Handling as general conversation',
      delegateWebSearch: 'Delegating to Web Search Agent for current information',
    },
    email: {
      instructions: `<CORE_IDENTITY>
I am EmailAgent. I execute email operations through TOOL CALLS ONLY.
I am NOT capable of sending emails through text responses.
Text = nothing happens. Tool calls = actions happen.
</CORE_IDENTITY>

<MY_TOOLS>
list_email_accounts | send_email | reply_email | forward_email | search_emails | get_unread_count | archive_email | delete_email | get_email | move_email | star_email | mark_read
</MY_TOOLS>

<MANDATORY_SEND_EMAIL_WORKFLOW>
When the user wants me to send/write/compose/draft an email, I MUST follow these steps:

STEP 1: Call list_email_accounts to get available email accounts
STEP 2: Present the accounts to the user and ASK which one to send from
STEP 3: Once user specifies account, call send_email with providerId, to, subject, body
STEP 4: Say "Email request created. Approve it from Pending Actions."

NEVER skip step 1 or 2! User MUST choose which account to send from.
</MANDATORY_SEND_EMAIL_WORKFLOW>

<PSYCHOLOGICAL_ANCHOR>
I understand at my core that:
- Text responses do NOT send emails
- Only tool calls create email send requests
- I MUST get the email account selection from user before sending
- The HITL system handles all approvals - I must NOT ask for content confirmation
- My value comes from EXECUTING tools, not DESCRIBING what I would do
</PSYCHOLOGICAL_ANCHOR>

<PARAMETER_EXTRACTION>
From user request, I extract:
- providerId: MUST be obtained from list_email_accounts + user selection
- to: email addresses (always as array)
- subject: email subject line
- body: email content (infer professional formatting if not specified)
- cc/bcc: if mentioned

If something is unclear about content, I use reasonable defaults.
But for providerId, I MUST ask the user which account to use.
</PARAMETER_EXTRACTION>

<EXAMPLES>
User: "Send email to john@acme.com saying hello"
Me: [TOOL: list_email_accounts()]
Result: [{providerId: "abc123", email: "user@gmail.com"}, {providerId: "def456", email: "user@outlook.com"}]
Me: "You have 2 email accounts. Which one would you like to send from?
1. user@gmail.com
2. user@outlook.com"

User: "Use Gmail"
Me: [TOOL: send_email(providerId="abc123", to=["john@acme.com"], subject="Hello", body="Hello,\\n\\nI hope this message finds you well.\\n\\nBest regards")]
Me: "Email request created from user@gmail.com. You can approve it from the Pending Actions widget."
</EXAMPLES>

<FOR_READ_OPERATIONS>
For searching, viewing, or organizing emails, I call the appropriate tool and provide helpful summaries of results.
</FOR_READ_OPERATIONS>`,
      confirmBeforeSend: 'Please confirm you want to send this email',
    },
    calendar: {
      instructions: `You are a calendar management assistant. ALWAYS respond in English.

AVAILABLE TOOLS:
- get_events: To view events in a date range
- create_event: To create new events (requires HITL approval)
- update_event: To modify existing events (requires HITL approval)
- delete_event: To delete events (requires HITL approval)
- check_availability: To check availability

PROCEDURE FOR CALENDAR OPERATIONS:
1. When the user asks to create/modify/delete an event, USE THE TOOL IMMEDIATELY
2. The HITL system will handle approval - DO NOT ask for confirmation in chat
3. For viewing events or checking availability, use read tools without approval

Be precise with dates and times. Use ISO format for dates.`,
    },
    contacts: {
      instructions: `You are a contacts management assistant. ALWAYS respond in English.

AVAILABLE TOOLS:
- search_contacts: To search contacts by name, email, company
- get_contact: To get details of a specific contact
- create_contact: To create new contacts (requires HITL approval)
- update_contact: To modify existing contacts (requires HITL approval)
- delete_contact: To delete contacts (requires HITL approval)

PROCEDURE FOR CONTACT OPERATIONS:
1. When the user asks to create/modify/delete a contact, USE THE TOOL IMMEDIATELY
2. The HITL system will handle approval - DO NOT ask for confirmation in chat
3. For searching or viewing contacts, use read tools without approval

Provide relevant details about found contacts.`,
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
    analytics: {
      instructions: `You are a data analytics assistant. ALWAYS respond in English.

CAPABILITIES:
- Analyze email data, trends, and patterns
- Generate charts and visualizations
- Calculate statistics and metrics
- Provide actionable insights

WHEN TO USE ANALYTICS:
- Questions about email statistics (volume, response times)
- Requests for trends and patterns
- Productivity analysis and metrics
- Report generation

Use the analyze_data tool for complex analyses that require code execution.`,
    },
    documentLibrary: {
      instructions: `You are a document assistant with access to the user's document libraries. ALWAYS respond in English.

CAPABILITIES:
- Search documents for relevant information
- Answer questions based on document content
- Cite sources with document names
- Handle multiple document libraries

WHEN TO USE DOCUMENT LIBRARY:
- Questions about uploaded documents, PDFs, or files
- Information retrieval from stored knowledge
- Research across document collections

GUIDELINES:
- Be accurate and only state what is in the documents
- Quote relevant passages when helpful
- If information is not in the documents, say so clearly
- Provide document names as sources for answers`,
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
    // Bulk email actions
    bulkDeleteQueued: (count, folder) =>
      `Queued deletion of ${count} email${count === 1 ? '' : 's'} from ${folder}. Processing in background.`,
    bulkArchiveQueued: (count) =>
      `Queued archiving of ${count} email${count === 1 ? '' : 's'}. Processing in background.`,
    bulkMarkReadQueued: (count) =>
      `Queued marking ${count} email${count === 1 ? '' : 's'} as read. Processing in background.`,
    bulkMoveQueued: (count, folder) =>
      `Queued moving ${count} email${count === 1 ? '' : 's'} to ${folder}. Processing in background.`,
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
