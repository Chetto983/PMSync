/**
 * Constants for contacts module
 *
 * Centralizes magic numbers and configuration values.
 * Improves maintainability and makes values discoverable.
 */

/**
 * Default configuration values for contacts
 */
export const CONTACTS_DEFAULTS = {
  /** Default page size for contact lists */
  DEFAULT_PAGE_SIZE: 100,

  /** Maximum contacts per page (configurable via env) */
  MAX_CONTACTS_LIMIT: 500,

  /** Maximum vCard file size in bytes (10MB) */
  VCARD_MAX_SIZE_BYTES: 10 * 1024 * 1024,

  /** Maximum contacts per vCard import */
  VCARD_MAX_CONTACTS: 5000,

  /** Default cache TTL for contact counts in seconds (5 minutes) */
  CACHE_TTL_SECONDS: 300,

  /** Default sync lock TTL in seconds (5 minutes) */
  SYNC_LOCK_TTL_SECONDS: 300,
} as const;

/**
 * Redis key prefixes for contacts
 */
export const CONTACTS_CACHE_KEYS = {
  /** Prefix for contact counts cache */
  COUNTS: 'contacts:counts:',

  /** Prefix for sync lock */
  SYNC_LOCK: 'contacts:sync:lock:',
} as const;

/**
 * Public email domains to exclude from contact extraction
 * These are common free email providers where contacts are less valuable
 */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  // International providers
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'msn.com',
  'protonmail.com',
  'proton.me',
  'tutanota.com',
  'zoho.com',

  // Italian providers
  'yahoo.it',
  'hotmail.it',
  'outlook.it',
  'live.it',
  'libero.it',
  'virgilio.it',
  'alice.it',
  'tin.it',
  'tiscali.it',
  'fastwebnet.it',
  'email.it',
  'pec.it',
  'aruba.it',
]);

/**
 * Contact metadata sources
 */
export const CONTACT_SOURCES = {
  LOCAL: 'local',
  EMAIL_EXTRACTION: 'email_extraction',
  VCARD_IMPORT: 'vcard_import',
  GOOGLE_SYNC: 'google',
  MICROSOFT_SYNC: 'microsoft',
} as const;
