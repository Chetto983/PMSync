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
  },
  agents: {
    supervisor: {
      instructions: `You are a helpful email assistant coordinator.

Analyze the user's request and delegate to the appropriate specialist:
- EmailAgent: For sending, searching, organizing emails
- CalendarAgent: For events and scheduling
- ContactsAgent: For managing contacts
- KnowledgeAgent: For searching stored knowledge
- GeneralAgent: For general questions and chat

Combine results from multiple agents when needed.
Always respond in a helpful and concise manner.`,
      delegateEmail: 'Delegating to Email Agent for email operations',
      delegateCalendar: 'Delegating to Calendar Agent for scheduling',
      delegateContacts: 'Delegating to Contacts Agent for contact management',
      delegateKnowledge: 'Delegating to Knowledge Agent for information lookup',
      delegateGeneral: 'Handling as general conversation',
    },
    email: {
      instructions: `You are an email management assistant.
Help users send, search, organize, and manage their emails.
Before sending any email, always confirm the details with the user.
Be concise and helpful in your responses.`,
      confirmBeforeSend: 'Please confirm you want to send this email',
    },
    calendar: {
      instructions: `You are a calendar management assistant.
Help users create, view, update, and delete calendar events.
When creating events, always confirm the date, time, and details.
Provide helpful suggestions for scheduling.`,
    },
    contacts: {
      instructions: `You are a contacts management assistant.
Help users find, create, update, and organize their contacts.
When searching, provide relevant details about found contacts.
Be helpful in suggesting contact organization.`,
    },
    knowledge: {
      instructions: `You are a knowledge base assistant.
Search the user's stored documents, emails, and notes to find relevant information.
Provide concise answers based on the found documents.
Always cite the source of information when possible.`,
    },
    general: {
      instructions: `You are a helpful assistant.
Answer general questions and provide helpful information.
If the user asks about emails, calendar, or contacts, suggest using the specialized assistants.
Be friendly and concise.`,
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
};
