/**
 * Shared type definitions for contacts module
 *
 * Centralizes all TypeScript interfaces used across contacts services.
 * These types extend or complement the DTO classes for internal use.
 */

import { Contact } from '@prisma/client';

/**
 * Email address interface for JSON fields
 */
export interface EmailAddress {
  value: string;
  type?: string;
  primary?: boolean;
}

/**
 * Phone number interface for JSON fields
 */
export interface PhoneNumber {
  value: string;
  type?: string;
  primary?: boolean;
}

/**
 * Physical address interface for JSON fields
 */
export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  type?: string;
}

/**
 * Social profile interface for JSON fields
 */
export interface SocialProfile {
  url: string;
  type?: string;
}

/**
 * Contact metadata interface for JSON fields
 */
export interface ContactMetadata {
  source?: string;
  extractedAt?: string;
  createdAt?: string;
  importedAt?: string;
  [key: string]: unknown;
}

/**
 * Unified contact with provider sources
 * Extended Contact with provider relationship data
 */
export interface ContactWithProviders extends Contact {
  providerContacts?: Array<{
    id: string;
    providerId: string;
    externalId: string;
    provider: {
      id: string;
      email: string;
      providerType: string;
      displayName: string | null;
    };
  }>;
}

/**
 * Filters for listing contacts
 */
export interface ListContactsFilters {
  providerId?: string;
  search?: string;
  company?: string;
  limit?: number;
  offset?: number;
}

/**
 * Contact counts response structure
 */
export interface ContactCounts {
  total: number;
  withEmail: number;
  withPhone: number;
  withCompany: number;
  byProvider: Array<{ providerId: string; count: number }>;
}

/**
 * Cached contact counts structure (Redis)
 */
export interface CachedContactCounts {
  total: number;
  byProvider: Record<string, number>;
  withEmail: number;
  withPhone: number;
  starred: number;
}

/**
 * vCard import result
 */
export interface VCardImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Email extraction result
 */
export interface EmailExtractionResult {
  created: number;
  skipped: number;
  /** Candidates skipped because fuzzy name match found (need human review) */
  flaggedForReview: number;
  total: number;
}

/**
 * Contact interaction history entry.
 * Matches the frontend ContactInteraction interface in frontend/lib/api/contacts.ts
 */
export interface ContactInteraction {
  id: string;
  type: 'EMAIL_SENT' | 'EMAIL_RECEIVED' | 'MEETING' | 'CALL' | 'NOTE';
  date: string;
  summary: string | null;
  sentiment: string | null;
  sourceType: string | null;
  emailId: string | null;
  contactEmail: string | null;
  contactName: string | null;
}
