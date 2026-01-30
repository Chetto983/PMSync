/**
 * English (US) translations for VoltAgent
 *
 * To add a new language, copy this file and translate all strings.
 */
import type { VoltAgentTranslations } from './index';
import {
  SUPERVISOR_PROMPT,
  SUPERVISOR_MESSAGES,
  WEBSEARCH_PROMPT,
  ANALYTICS_PROMPT,
  DOCUMENT_LIBRARY_PROMPT,
  getUnifiedPrompt,
} from '../prompts';

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
      rlmHint: 'Use get_email_content(ids) to load full content for specific emails.',
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
    attachments: {
      list: {
        description: 'List all attachments for an email. Use this to see what files are attached before extracting content.',
      },
      getContent: {
        description: 'Extract text content from an email attachment using OCR. Supports PDFs, images, and Office documents.',
      },
      notFound: 'Attachment not found',
      extractionFailed: 'Failed to extract content from attachment',
      unsupportedType: 'Unsupported attachment type for extraction',
    },
    askUser: {
      description: `MANDATORY tool for requesting user input. This is a BLOCKING call - execution PAUSES until user responds. WHEN TO USE: Multiple matches found, missing required info, or ambiguous request. HOW IT WORKS: Call this tool → Frontend shows modal → User clicks choice → Execution resumes. NEVER ask questions in plain text - ALWAYS use this tool.`,
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
      /**
       * UNIFIED ANALYSIS - Single LLM call for ALL email insights
       * Used by triageEmail() and agents for complete email understanding
       */
      analyzeUnified: {
        description: 'Complete email analysis in a single LLM call: summary, sentiment, priority, labels, topics, escalation risk',
        systemPrompt: (allowedLabels: string) => `You are an expert email analyst. Analyze this email thoroughly and return a complete JSON analysis.

<INSTRUCTIONS>
1. Read the email carefully
2. Generate a 2-3 sentence summary capturing the main point and any action items
3. Analyze sentiment, tone, and emotional signals
4. Determine priority (1=highest/critical, 5=lowest/can wait)
5. Select up to 3 relevant labels from the ALLOWED LABELS only
6. Extract key topics and entities mentioned
7. Assess if this email poses escalation risk (angry customer, threat, complaint)
8. Generate 2-3 short smart reply suggestions if appropriate
</INSTRUCTIONS>

<ALLOWED_LABELS>
${allowedLabels}
</ALLOWED_LABELS>

<OUTPUT_FORMAT>
Reply ONLY with valid JSON (no markdown, no explanation):
{
  "summary": "2-3 sentence summary of the email",
  "sentiment": "positive|negative|neutral|mixed",
  "tone": "formal|casual|urgent|friendly|cold|assertive",
  "priority": 1-5,
  "urgency": "critical|high|medium|low",
  "labels": ["label1", "label2"],
  "keyTopics": ["topic1", "topic2", "topic3"],
  "intent": "action_required|fyi|question|meeting_request|follow_up|escalation|feedback",
  "escalationRisk": true|false,
  "hasDeadline": true|false,
  "deadlineDate": "ISO date string or null",
  "needsFollowUp": true|false,
  "smartReplies": ["Quick reply 1", "Quick reply 2", "Quick reply 3"],
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of priority/urgency assessment"
}
</OUTPUT_FORMAT>`,
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
  // ===========================================================================
  // AGENT PROMPTS (English only - getLocaleInstruction() handles response language)
  // Other locales inherit this via: agents: en.agents
  // ===========================================================================
  agents: {
    supervisor: {
      instructions: SUPERVISOR_PROMPT,
      ...SUPERVISOR_MESSAGES,
    },
    unified: {
      instructions: getUnifiedPrompt('unknown'),
    },
    webSearch: {
      instructions: WEBSEARCH_PROMPT,
    },
    analytics: {
      instructions: ANALYTICS_PROMPT,
    },
    documentLibrary: {
      instructions: DOCUMENT_LIBRARY_PROMPT,
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
    // WRITE operations → UnifiedAgent with write tools (HITL approval)
    writeOps: [
      'send|reply|forward|compose|draft',
      'delete|remove|trash|archive',
      'create|add|new|schedule',
      'update|edit|modify|change|rename',
      'move|star|unstar|mark as',
    ],
    // READ operations → UnifiedAgent with read tools
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
  // ============================================================================
  // Contact Role Classification Patterns (Phase 4.3 - Cost Optimization)
  // Multilingual patterns: English terms
  // ============================================================================
  rolePatterns: {
    executive: [
      'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'cpo', 'cro',
      'president', 'vice president', 'vp', 'chief', 'founder', 'co-founder',
      'managing director', 'general manager', 'principal', 'partner',
    ],
    board: [
      'board', 'director', 'chairman', 'chairperson', 'chairwoman',
      'trustee', 'non-executive', 'board member', 'advisory board',
    ],
    investor: [
      'investor', 'investment', 'venture', 'vc', 'angel', 'seed',
      'fund', 'capital', 'lp', 'gp', 'portfolio', 'private equity',
      'shareholder', 'stakeholder',
    ],
    engineering: [
      'engineer', 'developer', 'dev', 'programmer', 'architect',
      'devops', 'sre', 'qa', 'tester', 'software', 'backend', 'frontend',
      'fullstack', 'data scientist', 'ml engineer', 'tech lead',
    ],
    sales: [
      'sales', 'account executive', 'ae', 'sdr', 'bdr',
      'business development', 'sales manager', 'account manager',
      'sales director', 'revenue',
    ],
    marketing: [
      'marketing', 'growth', 'brand', 'content', 'seo',
      'social media', 'pr', 'communications', 'demand gen',
      'product marketing', 'campaign',
    ],
    hr: [
      'hr', 'human resources', 'recruiter', 'talent', 'people ops',
      'hiring', 'recruitment', 'people', 'culture', 'employee relations',
    ],
    legal: [
      'legal', 'lawyer', 'attorney', 'counsel', 'compliance',
      'paralegal', 'general counsel', 'legal counsel', 'contracts',
    ],
    finance: [
      'finance', 'accountant', 'controller', 'treasurer', 'bookkeeper',
      'auditor', 'financial', 'accounting', 'billing', 'payroll',
    ],
    support: [
      'support', 'success', 'service', 'helpdesk', 'help desk',
      'technical support', 'customer support', 'customer success',
    ],
    advisor: [
      'advisor', 'adviser', 'consultant', 'coach', 'mentor',
      'strategist', 'counselor', 'expert', 'specialist',
    ],
    vendor: [
      'vendor', 'supplier', 'provider', 'contractor', 'freelancer',
      'agency', 'outsourcing', 'partner',
    ],
    customer: [
      'customer', 'client', 'user', 'subscriber', 'buyer',
      'purchaser', 'patron', 'consumer',
    ],
    team: [
      'team', 'colleague', 'coworker', 'employee', 'staff',
      'intern', 'associate', 'member', 'coordinator',
    ],
  },
};
