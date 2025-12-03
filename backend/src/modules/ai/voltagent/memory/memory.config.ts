/**
 * VoltAgent Memory Configuration
 *
 * Provides PostgreSQL-based persistent memory for agent conversations.
 * Uses the same PostgreSQL database as the main application.
 */
import { Memory } from '@voltagent/core';
import { PostgreSQLMemoryAdapter } from '@voltagent/postgres';
import { LibSQLMemoryAdapter } from '@voltagent/libsql';

export interface MemoryOptions {
  /**
   * PostgreSQL connection string or config
   */
  connection?: string | {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  };
  /**
   * Table prefix for namespacing
   */
  tablePrefix?: string;
  /**
   * PostgreSQL schema to use
   */
  schema?: string;
  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Creates a PostgreSQL-backed memory instance for VoltAgent.
 * Uses the same database as the main application.
 *
 * @example
 * const memory = createMemory({
 *   connection: process.env.DATABASE_URL,
 * });
 */
export function createMemory(options: MemoryOptions = {}): Memory {
  const {
    connection = process.env.DATABASE_URL || 'postgresql://localhost:5432/mailagent',
    tablePrefix = 'voltagent_memory',
    schema = 'public',
    debug = process.env.NODE_ENV === 'development',
  } = options;

  return new Memory({
    storage: new PostgreSQLMemoryAdapter({
      connection,
      tablePrefix,
      schema,
      debug,
    }),
  });
}

/**
 * Creates an in-memory adapter for testing (uses LibSQL :memory:).
 */
export function createTestMemory(): Memory {
  return new Memory({
    storage: new LibSQLMemoryAdapter({
      url: ':memory:',
      tablePrefix: 'test_memory',
      debug: false,
    }),
  });
}
