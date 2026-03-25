/**
 * CRM Import/Export types
 */

export interface CsvRowError {
  row: number;
  field?: string;
  message: string;
}

export interface CsvImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: CsvRowError[];
}

export interface CsvImportProgress {
  jobId: string;
  status: 'parsing' | 'validating' | 'importing' | 'completed' | 'failed';
  total: number;
  processed: number;
  created: number;
  skipped: number;
  errors: CsvRowError[];
}

export interface ColumnMapping {
  /** CSV column header name */
  source: string;
  /** Contact field name */
  target: ContactImportField;
}

export type ContactImportField =
  | 'firstName'
  | 'lastName'
  | 'displayName'
  | 'email'
  | 'phone'
  | 'company'
  | 'jobTitle'
  | 'department'
  | 'notes'
  | 'tags'
  | 'skip';

/** Fields that are valid targets for CSV column mapping */
export const CONTACT_IMPORT_FIELDS: ContactImportField[] = [
  'firstName',
  'lastName',
  'displayName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'department',
  'notes',
  'tags',
  'skip',
];

export const CSV_IMPORT_LIMITS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_ROWS: 10_000,
  BATCH_SIZE: 100,
} as const;
