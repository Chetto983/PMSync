/**
 * English (US) translations for VoltAgent
 *
 * To add a new language, copy this file and translate all strings.
 */
import type { VoltAgentTranslations } from './index';
import { SUPERVISOR_PROMPT, SUPERVISOR_MESSAGES } from '../prompts';
import { ACTIONS_PROMPT } from '../prompts';
import { INTELLIGENCE_PROMPT } from '../prompts';

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
      serviceUnavailable: 'Email service is temporarily unavailable. Please try again in a moment, or check your email provider connection in Settings → Connected Accounts.',
      notFound: 'Email not found. It may have been deleted or moved. Try searching for it or refresh your inbox.',
      requiresApproval: 'This action requires your approval. Check the Pending Actions panel to approve or reject it.',
    },
    calendar: {
      eventsFound: (count) => `${count} events found`,
      eventCreated: (title, date) => `Event "${title}" created for ${date}`,
      eventUpdated: (title) => `Event "${title}" updated`,
      eventDeleted: (title) => `Event "${title}" deleted`,
      slotAvailable: 'The time slot is available',
      slotConflict: (count) => `There are ${count} conflicting events`,
      serviceUnavailable: 'Calendar service is temporarily unavailable. Please try again, or check your calendar provider connection in Settings → Connected Accounts.',
      notFound: 'Event not found. It may have been deleted or rescheduled. Try checking your calendar directly.',
      requiresApproval: 'This calendar action requires your approval. Check the Pending Actions panel to approve or reject it.',
    },
    contacts: {
      found: (count, query) => `Found ${count} contacts for "${query}"`,
      contact: 'Contact',
      created: (name) => `Contact "${name}" created`,
      updated: (name) => `Contact "${name}" updated`,
      deleted: (name) => `Contact "${name}" deleted`,
      alreadyExists: (email) => `Contact with email ${email} already exists. Search for the existing contact to update it.`,
      notFound: 'Contact not found. It may have been deleted. Try searching for similar contacts.',
      requiresApproval: 'This contact action requires your approval. Check the Pending Actions panel to approve or reject it.',
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
When referencing information, cite the source (email, deadline, task, etc.).

<GROUNDING_RULES>
1.  I must ONLY provide information found in the available sources.
2.  If I cannot find the information, I must state "I couldn't find that information" instead of inventing it.
3.  I must explicitly cite where I found the info (e.g. "According to the email from John...").
</GROUNDING_RULES>`,
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
        systemPrompt: (toneInstruction: string, language: string) => {
          const languageExamples = language === 'Italian'
            ? 'Use ONLY Italian greetings like "Ciao", "Salve", "Buongiorno", "Gentile". NEVER use English words like "Hi", "Hello", "Dear", "Best", "Regards". Sign off with Italian phrases like "Cordiali saluti", "A presto", "Grazie".'
            : 'Use standard English greetings and sign-offs.';
          return `You are an email drafting assistant. ${toneInstruction} CRITICAL: Write the ENTIRE email body in ${language} ONLY. Do NOT mix languages. ${languageExamples} Reply ONLY in JSON: {"body":"...", "subject":"..."}. Every word must be in ${language}. Avoid markdown.`;
        },
        originalEmail: 'Original email:',
        replyInstructions: 'Reply instructions:',
        // Compose prompt strings
        recipients: 'Recipients',
        subjectHint: 'Subject hint',
        requestedTone: 'Requested tone',
        senderName: 'Sender name (sign the email with this name)',
        signatureInstruction: 'Use exactly this signature at the end of the email',
        threadContext: 'Thread context:',
        message: 'Message',
        draftInstruction: 'Draft a ready-to-send email.',
        userPrompt: 'User prompt',
        jsonInstruction: 'Return JSON with body and subject fields. No markdown.',
        // Language names for AI prompt
        languageNames: {
          en: 'English',
          it: 'Italian',
        },
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
          `Generate 2-3 concise replies to the email in ENGLISH. ${toneInstruction} Respond in JSON: {"replies":["..."]}.`,
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
      instructions: SUPERVISOR_PROMPT,
      ...SUPERVISOR_MESSAGES,
    },
    email: {
      instructions: `<CORE_IDENTITY>
I am EmailAgent. I execute email operations through TOOL CALLS ONLY.
I am NOT capable of sending emails through text responses.
Text = nothing happens. Tool calls = actions happen.
</CORE_IDENTITY>

<PROACTIVITY>
After completing a task, briefly suggest ONE logical follow-up action if relevant.
Example: "Email sent. Shall I create a follow-up task for next Tuesday?"
</PROACTIVITY>

<MY_TOOLS>
get_email_content - Read full email body (USE THIS before summarizing!)
list_email_accounts | send_email | reply_email | forward_email
search_emails | get_unread_emails | count_emails
archive_email | delete_email | move_email | star_email | mark_read
</MY_TOOLS>

<READ_EMAIL_WORKFLOW>
When user asks to summarize, read, or analyze an email:
1. ALWAYS call get_email_content(emailId) first
2. Read the full body from the result
3. Then summarize/analyze the content
4. NEVER say "I cannot read emails" - you CAN with get_email_content!
</READ_EMAIL_WORKFLOW>

<REASONING_REQUIRED>
Before executing ANY tool, I MUST:
1.  Identify the user's core intent (Read vs Write).
2.  Check if I need to verify data first (e.g. check if contact exists).
3.  Choose the most specific tool for the job.
</REASONING_REQUIRED>

<EMAIL_COUNTING>
When user asks "how many emails?" or email count/statistics:
- ALWAYS use count_emails tool with period: "today", "this_week", "this_month", or "all"
- Example: "How many emails this week?" → count_emails(period="this_week")
- NEVER say you don't have tools for counting - you DO have count_emails!
</EMAIL_COUNTING>

<MANDATORY_SEND_EMAIL_WORKFLOW>
When the user wants me to send/write/compose/draft an email:

SMART ACCOUNT DETECTION:
If user EXPLICITLY specifies sender (e.g., "from dvdmarchetto@gmail.com", "da [email]", "using my gmail"):
→ Match against available accounts and USE IT DIRECTLY - DO NOT ASK
→ Example: "manda email da dvdmarchetto@gmail.com" → use that account immediately

If user does NOT specify sender AND has multiple accounts:
→ STEP 1: Call list_email_accounts
→ STEP 2: ASK which account to use
→ STEP 3: Once selected, proceed

EXECUTION:
1. Call send_email with providerId, to, subject, body
2. Say "Email request created. Approve it from Pending Actions."

KEY RULE: NEVER ask for account if user already specified it!
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
- providerId: Extract from user's explicit specification OR ask if multiple accounts and not specified
- to: email addresses (always as array)
- subject: email subject line
- body: email content (infer professional formatting if not specified)
- cc/bcc: if mentioned

SMART EXTRACTION EXAMPLES:
- "send from dvdmarchetto@gmail.com" → providerId = match "dvdmarchetto@gmail.com"
- "da [user@domain.com]" → providerId = match "user@domain.com"
- "using my hotmail" → providerId = match account containing "hotmail"

If content is unclear, use reasonable defaults.
Only ask for providerId if user has multiple accounts AND did not specify one.
</PARAMETER_EXTRACTION>

<EXAMPLES>
EXAMPLE 1 - User specifies account (NO asking):
User: "manda email a john@acme.com da dvdmarchetto@gmail.com facendo gli auguri"
Me: [TOOL: list_email_accounts()] → find providerId for dvdmarchetto@gmail.com
Me: [TOOL: send_email(providerId="xxx", to=["john@acme.com"], subject="Auguri!", body="Ciao John,\\n\\nTanti auguri!\\n\\nDavide")]
Me: "Email request created from dvdmarchetto@gmail.com. Approve in Pending Actions."

EXAMPLE 2 - User does NOT specify account (ASK):
User: "Send email to john@acme.com saying hello"
Me: [TOOL: list_email_accounts()]
Result: [{providerId: "abc", email: "user@gmail.com"}, {providerId: "def", email: "user@outlook.com"}]
Me: "Which account to send from? 1. user@gmail.com 2. user@outlook.com"
User: "Gmail"
Me: [TOOL: send_email(providerId="abc", to=["john@acme.com"], subject="Hello", body="Hello,\\n\\nBest regards")]
Me: "Email request created. Approve in Pending Actions."

EXAMPLE 3 - Single account (NO asking):
User: "Send hi to sarah@corp.com"
Me: [TOOL: list_email_accounts()] → only 1 account found
Me: [TOOL: send_email(providerId="only-one", ...)]
Me: "Email request created. Approve in Pending Actions."
</EXAMPLES>

<FOR_READ_OPERATIONS>
For searching, viewing, or organizing emails, I call the appropriate tool and provide helpful summaries of results.
</FOR_READ_OPERATIONS>`,
      confirmBeforeSend: 'Please confirm you want to send this email',
    },
    calendar: {
      instructions: `You are a calendar management specialist for MailAgent. ALWAYS respond in English.

<CORE_IDENTITY>
I help users manage their calendar events, check availability, and schedule meetings efficiently.
I understand time zones, recurring events, and multi-calendar setups.
</CORE_IDENTITY>

<MY_TOOLS>
1. get_events - View events in a date range (READ-ONLY)
   Examples:
   - "Show my meetings today" → get_events({ startDate: "2025-01-10", endDate: "2025-01-10" })
   - "What's on my calendar this week?" → get_events with current week range
   - "Events for January" → get_events({ startDate: "2025-01-01", endDate: "2025-01-31" })

2. manage_event - Create, update, delete, or check availability (CONSOLIDATED TOOL)
   Actions:
   - action="create" → Create new event (requires title, startTime, endTime) - HITL APPROVAL
   - action="update" → Modify existing event (requires eventId) - HITL APPROVAL
   - action="delete" → Delete event (requires eventId) - HITL APPROVAL
   - action="check_availability" → Check if time slot is free (READ-ONLY)

   Examples:
   - "Schedule meeting with John at 2pm tomorrow" → manage_event({ action: "create", title: "Meeting with John", startTime: "2025-01-11T14:00:00", endTime: "2025-01-11T15:00:00" })
   - "Am I free at 3pm?" → manage_event({ action: "check_availability", startTime: "2025-01-10T15:00:00", endTime: "2025-01-10T16:00:00" })
   - "Cancel the team meeting" → First search with get_events, then manage_event({ action: "delete", eventId: "..." })
</MY_TOOLS>

<WORKFLOW>
1. For viewing events: Use get_events directly, no approval needed
2. For checking availability: Use manage_event(action="check_availability"), no approval needed
3. For create/update/delete: Use manage_event with appropriate action - HITL will handle approval
4. NEVER ask for confirmation in chat - the HITL system handles all approvals
5. Use ISO 8601 format for all dates and times (e.g., "2025-01-10T14:00:00")
</WORKFLOW>

<TIME_HANDLING>
- Always consider user's timezone (from context) when interpreting relative times
- "tomorrow" = next calendar day in user's timezone
- "this week" = current week starting from today
- "next Monday" = the coming Monday (not today if today is Monday)
</TIME_HANDLING>`,
    },
    contacts: {
      instructions: `You are a contacts management specialist for MailAgent. ALWAYS respond in English.

<CORE_IDENTITY>
I help users manage their contacts, find contact information, and maintain their professional network.
I can search across all connected email accounts and sync contacts from Google and Microsoft.
</CORE_IDENTITY>

<MY_TOOLS>
1. search_contacts - Find contacts by name, email, or company (READ-ONLY)
   - Returns contacts with at least one valid email address
   - Searches: displayName, firstName, lastName, company
   - Also searches email addresses via raw SQL if query contains "@"

   Examples:
   - "Find John's email" → search_contacts({ query: "John" })
   - "Who works at Acme Corp?" → search_contacts({ query: "Acme Corp" })
   - "Contact info for john@example.com" → search_contacts({ query: "john@example.com" })

2. manage_contact - Get, create, update, or delete contacts (CONSOLIDATED TOOL)
   Actions:
   - action="get" → Get full contact details (requires contactId) - READ-ONLY
   - action="create" → Create new contact (requires email) - HITL APPROVAL
   - action="update" → Update contact (requires contactId) - HITL APPROVAL
   - action="delete" → Delete contact (requires contactId) - HITL APPROVAL

   Examples:
   - "Add new contact: Jane Doe, jane@example.com, works at TechCo" → manage_contact({ action: "create", email: "jane@example.com", displayName: "Jane Doe", company: "TechCo" })
   - "Update John's phone number" → First search_contacts, then manage_contact({ action: "update", contactId: "...", phone: "555-1234" })
   - "Delete the duplicate contact" → manage_contact({ action: "delete", contactId: "..." })
</MY_TOOLS>

<WORKFLOW>
1. For finding contacts: Use search_contacts first to locate the contact
2. For detailed view: Use manage_contact(action="get") with the found contactId
3. For create/update/delete: Use manage_contact with appropriate action - HITL handles approval
4. NEVER ask for confirmation in chat - the HITL system handles all approvals
5. When creating contacts, email is REQUIRED; other fields are optional
</WORKFLOW>

<CONTACT_DATA>
Available fields:
- email (required for create): Primary email address
- displayName: Full display name
- firstName, lastName: Name parts
- phone: Phone number
- company: Company name
- jobTitle: Job title/role
- notes: Additional notes

Always provide relevant contact details in responses (name, email, company, job title).
</CONTACT_DATA>`,
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
      instructions: `You are a data analytics assistant with code execution capabilities. ALWAYS respond in English.

**IMPORTANT**: You MUST use the analyze_data tool for ANY request involving:
- Email statistics (volume, counts, response times)
- Trends and patterns analysis
- Productivity metrics
- Data visualizations
- Report generation

NEVER say you don't have tools. You have the analyze_data tool available.

WHEN ASKED ABOUT STATISTICS OR METRICS:
1. ALWAYS call the analyze_data tool first
2. Pass the user's query to the tool
3. Present the results clearly

Example queries that REQUIRE the analyze_data tool:
- "Show me my email statistics" → Use analyze_data
- "How many emails this week?" → Use analyze_data
- "Email volume trends" → Use analyze_data
- "Response time analysis" → Use analyze_data`,
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
    // ========================================================================
    // CONSOLIDATED AGENTS (Phase 3: Agent Consolidation 10 → 3)
    // ========================================================================
    actions: {
      instructions: ACTIONS_PROMPT,
    },
    intelligence: {
      instructions: INTELLIGENCE_PROMPT,
    },
  },
  // Action response message templates (ActionSummaryTranslations)
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
      toolExecution: (error) => `Tool execution failed: ${error}`,
      retryPrompt: (error) => `System: Your last tool call failed with the following error:\n${error}\n\nPlease fix the parameters and try again.`,
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
  followUp: {
    // Semantic query for RAG - captures intent across varied phrasing
    ragQuery: 'waiting for reply, action required, please respond, follow up needed, deadline approaching, let me know, confirm receipt, need your input, pending response, awaiting confirmation, request for action, need feedback',
    highConfidenceReason: 'Detected via semantic search (high confidence)',
    verifiedReason: 'Verified by AI analysis',
  },
  briefing: {
    quotaExceeded: 'Daily briefing unavailable - AI quota limit reached. Please upgrade your plan.',
    emptyInbox: 'No new unread emails. Your inbox is clear!',
    fallbackSummary: (unread, today) => `You have ${unread} unread emails, ${today} received today.`,
    emailFrom: 'Email from',
    aiPromptLanguage: 'Your response should be in English.',
    followUps: {
      overdue: (count) => `⚠️ You have ${count} overdue follow-up${count > 1 ? 's' : ''} requiring attention.`,
      dueToday: (count) => `📋 ${count} follow-up${count > 1 ? 's' : ''} due today.`,
      pending: (count) => `✓ ${count} pending follow-up${count > 1 ? 's' : ''}, none overdue.`,
      none: '✓ No pending follow-ups.',
      unavailable: 'Follow-up data unavailable.',
    },
    deadlines: {
      placeholder: '✓ Deadline tracking available in future update.',
    },
    actionItems: {
      placeholder: '✓ Action items tracking available in future update.',
    },
    calendar: {
      available: '📆 Calendar sync available via /api/v1/calendar endpoints.',
      unavailable: 'Calendar data unavailable.',
    },
  },
  // Router patterns for intent classification (English)
  router: {
    // WRITE operations → ActionsAgent
    writeOps: [
      'send|reply|forward|compose|draft',
      'delete|remove|trash|archive',
      'create|add|new|schedule',
      'update|edit|modify|change|rename',
      'move|star|unstar|mark as',
    ],
    // READ operations → IntelligenceAgent
    readOps: [
      'search|find|look|show|list|get',
      'email|inbox|mail|message|unread',
      'calendar|schedule|meeting|appointment|event|availability',
      'contact|address|phone|who is|person',
      'analyze|summarize|sentiment|priority',
      'how many|count',
    ],
    // Simple queries → Supervisor direct response
    simple: [
      '^(hi|hello|hey|thanks|thank you|ok|okay)\\b',
      '^what (is|are|was|were) ',
      '^how (to|do|can) ',
      '^translate',
      '^define',
    ],
    // Complexity: simple
    complexitySimple: [
      '^(hi|hello|hey|thanks|thank you|ok|okay|yes|no)\\b',
      '^what (is|are|was|were) ',
      '^(summarize|summary of)',
      '^(list|show|get|find) (my|the|all)',
      'unread emails?',
      'check (my )?calendar',
      'mark (as )?(read|unread)',
      '^how many',
      '^when (is|was|will)',
    ],
    // Complexity: moderate
    complexityModerate: [
      'analyze|analysis',
      'compare|comparison',
      'explain|explanation',
      'draft|write|compose',
      'suggest|recommend',
      'schedule|reschedule',
      'organize|categorize',
      'translate|translation',
      'sentiment',
      'priority',
    ],
    // Complexity: complex
    complexityComplex: [
      'create (a |an )?(detailed|comprehensive|full)',
      'step[- ]by[- ]step',
      'implement|implementation',
      'refactor|restructure',
      'multi[- ]?step',
      'plan|planning',
      'strategy|strategic',
      'code|programming',
      'integrate|integration',
      'automate|automation',
      'workflow',
    ],
  },
  errors: {
    http: {
      forbidden: {
        admin: 'Administrator privileges required for this operation.',
        crossTenant: 'You do not have access to this resource.',
      },
      notFound: {
        library: 'Library not found.',
        document: 'Document not found.',
        file: 'File not found.',
        email: 'Email not found.',
        contact: 'Contact not found.',
      },
      badRequest: {
        noFile: 'No file provided.',
        unsupportedFileType: (mimeType, supported) =>
          `Unsupported file type: ${mimeType}. Supported types: ${supported}`,
        fileTooLarge: (limitMb) => `File size exceeds the ${limitMb}MB limit.`,
        invalidInput: 'Invalid input provided.',
      },
    },
    validation: {
      embedding: {
        notArray: 'Embedding must be an array.',
        empty: 'Embedding array cannot be empty.',
        tooLarge: (max) => `Embedding array exceeds maximum dimension (${max}).`,
        invalidValue: (index) => `Embedding contains invalid value at index ${index}.`,
      },
    },
    ai: {
      quotaExceeded: 'Monthly AI call limit reached. Please upgrade your plan.',
      costLimitDaily: 'Daily AI cost limit reached. Limit resets at midnight.',
      costLimitMonthly: 'Monthly AI cost limit reached. Please upgrade your plan.',
      agentFailed: 'Agent failed to generate a response. Please try again.',
      providerNotConfigured: 'AI provider not configured.',
      approvalNotInitialized: 'Approval workflow not initialized.',
    },
    subscription: {
      canceled: 'Your subscription has been canceled. Please reactivate to continue.',
      pastDue: 'Your payment is past due. Please update your payment method.',
      featureNotAvailable: (feature) => `This feature requires a higher plan. Please upgrade to access ${feature}.`,
      emailQuotaExceeded: (limit) => `You've reached your monthly email limit of ${limit}. Upgrade for more capacity.`,
    },
  },
};
