/**
 * Internal interfaces for IMAP driver services
 * NOT part of public API - used only within the IMAP driver module
 */

import type { ImapFlow } from 'imapflow';

/**
 * Pooled connection wrapper for connection pool management
 */
export interface PooledConnection {
  client: ImapFlow;
  lastUsed: number;
  inUse: boolean;
  mailbox?: string;
  _semaphoreRelease?: () => void;
}

/**
 * IMAP server configuration
 */
export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

/**
 * SMTP server configuration
 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

/**
 * Server capabilities detected at connection time
 * RFC 7162: CONDSTORE/QRESYNC for efficient incremental sync
 * RFC 2177: IDLE for real-time notifications
 * RFC 6154: SPECIAL-USE for folder type detection
 */
export interface ServerCapabilities {
  condstore: boolean;
  qresync: boolean;
  idle: boolean;
  specialUse: boolean;
}

/**
 * Driver context shared across services
 */
export interface ImapDriverContext {
  imapConfig: ImapConfig;
  smtpConfig?: SmtpConfig;
  userEmail?: string;
  serverCapabilities: ServerCapabilities;
}

/**
 * IMAP Connection Pool Configuration
 * Phase 6: Made configurable via environment variables
 * Phase 7: Reduced defaults for memory optimization (target <200MB/tenant)
 */
export const POOL_CONFIG = {
  // LOW-1: Reduced from 3 to 2 to improve stability with constrained providers (e.g. Gmail IMAP limit is 15)
  // With 1000 users, 2 connections = 2000 concurrent sockets which is manageable
  maxConnectionsPerUser: parseInt(process.env.IMAP_MAX_CONNECTIONS_PER_USER || '2', 10),
  connectionIdleTimeout: parseInt(process.env.IMAP_CONNECTION_IDLE_TIMEOUT_MS || '30000', 10),
  connectionAcquireTimeout: parseInt(process.env.IMAP_CONNECTION_ACQUIRE_TIMEOUT_MS || '10000', 10),
  maxMessageBodySize: parseInt(process.env.IMAP_MAX_MESSAGE_BODY_SIZE || String(5 * 1024 * 1024), 10),
  bodyDownloadTimeout: parseInt(process.env.IMAP_BODY_DOWNLOAD_TIMEOUT_MS || '15000', 10),
};
