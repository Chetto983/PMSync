/**
 * Action types that agents can propose
 */
export enum AgentActionType {
  // Email actions
  SEND_EMAIL = 'SEND_EMAIL',
  REPLY_EMAIL = 'REPLY_EMAIL',
  FORWARD_EMAIL = 'FORWARD_EMAIL',
  ARCHIVE_EMAIL = 'ARCHIVE_EMAIL',
  DELETE_EMAIL = 'DELETE_EMAIL',
  CATEGORIZE_EMAIL = 'CATEGORIZE_EMAIL',
  LABEL_EMAIL = 'LABEL_EMAIL',
  SEARCH_EMAILS = 'SEARCH_EMAILS',
  MARK_READ = 'MARK_READ',
  MARK_UNREAD = 'MARK_UNREAD',
  STAR_EMAIL = 'STAR_EMAIL',
  UNSTAR_EMAIL = 'UNSTAR_EMAIL',
  GET_UNREAD = 'GET_UNREAD',

  // Calendar actions
  CREATE_EVENT = 'CREATE_EVENT',
  UPDATE_EVENT = 'UPDATE_EVENT',
  DELETE_EVENT = 'DELETE_EVENT',
  RESCHEDULE_EVENT = 'RESCHEDULE_EVENT',
  INVITE_ATTENDEES = 'INVITE_ATTENDEES',
  GET_EVENTS = 'GET_EVENTS',
  CHECK_AVAILABILITY = 'CHECK_AVAILABILITY',
  SCHEDULE_MEETING = 'SCHEDULE_MEETING',

  // Contact actions
  CREATE_CONTACT = 'CREATE_CONTACT',
  UPDATE_CONTACT = 'UPDATE_CONTACT',
  DELETE_CONTACT = 'DELETE_CONTACT',
  MERGE_CONTACTS = 'MERGE_CONTACTS',
  ENRICH_CONTACT = 'ENRICH_CONTACT',
  SEARCH_CONTACTS = 'SEARCH_CONTACTS',
  GET_CONTACT = 'GET_CONTACT',

  // Knowledge actions
  SEARCH_KNOWLEDGE = 'SEARCH_KNOWLEDGE',
  ADD_TO_KNOWLEDGE = 'ADD_TO_KNOWLEDGE',

  // General
  NOTIFY_USER = 'NOTIFY_USER',
  NO_ACTION = 'NO_ACTION',
}

/**
 * Severity levels for actions
 * Determines HITL requirements
 */
export enum ActionSeverity {
  LOW = 'LOW', // Can be auto-executed with high confidence
  MEDIUM = 'MEDIUM', // Requires moderate confidence for auto-execution
  HIGH = 'HIGH', // Always requires human approval
}

/**
 * Status of a pending action
 */
export enum ActionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  EXECUTED = 'EXECUTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

/**
 * An action proposed by an agent
 */
export interface AgentAction {
  type: AgentActionType;
  payload: Record<string, any>;
  confidence: number; // 0.0 - 1.0 (original confidence from agent)
  adjustedConfidence?: number; // After learning boost applied
  severity: ActionSeverity;
  reasoningSteps?: string; // LLM reasoning explanation
  learningContext?: {
    originalConfidence: number;
    boost: number;
    profileAttempts: number;
  };
}

/**
 * Payload types for specific actions
 */
export interface SendEmailPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  replyToEmailId?: string;
  attachments?: Array<{ filename: string; content: string }>;
}

export interface CreateEventPayload {
  title: string;
  description?: string;
  startTime: string; // ISO 8601
  endTime: string;
  location?: string;
  attendees?: string[];
  providerId: string;
  calendarId?: string;
}

export interface MergeContactsPayload {
  primaryContactId: string;
  secondaryContactIds: string[];
  mergeStrategy: 'keep_primary' | 'merge_all' | 'manual';
}

export interface CategorizeEmailPayload {
  emailId: string;
  category: string;
  labels?: string[];
  confidence: number;
}
