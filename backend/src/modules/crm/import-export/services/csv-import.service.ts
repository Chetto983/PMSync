/**
 * CRM CSV Import Service
 *
 * Handles CSV contact import:
 * - Parsing with papaparse (auto-detect delimiter, encoding)
 * - Row-by-row validation
 * - Deduplication by email
 * - Batch creation with error reporting
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as Papa from 'papaparse';
import {
  CsvImportResult,
  CsvRowError,
  ColumnMapping,
  ContactImportField,
  CONTACT_IMPORT_FIELDS,
  CSV_IMPORT_LIMITS,
} from '../types';

interface ParsedContactRow {
  rowIndex: number;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  department?: string;
  notes?: string;
  tags?: string;
}

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Parse CSV content and return headers for column mapping
   */
  parseHeaders(csvContent: string): string[] {
    const result = Papa.parse(csvContent, {
      preview: 1,
      skipEmptyLines: true,
    });

    if (result.errors.length > 0) {
      throw new BadRequestException(
        `CSV parse error: ${result.errors[0].message}`,
      );
    }

    const firstRow = result.data[0];
    if (!Array.isArray(firstRow) || firstRow.length === 0) {
      throw new BadRequestException('CSV file is empty or has no columns');
    }

    return firstRow.map((h: unknown) => String(h).trim());
  }

  /**
   * Parse CSV and return preview rows (first 5) with detected headers
   */
  parsePreview(
    csvContent: string,
    mappings: ColumnMapping[],
  ): { headers: string[]; preview: Record<string, string>[]; totalRows: number } {
    const result = Papa.parse<string[]>(csvContent, {
      skipEmptyLines: true,
    });

    if (result.errors.length > 0 && result.data.length === 0) {
      throw new BadRequestException(
        `CSV parse error: ${result.errors[0].message}`,
      );
    }

    const headers = (result.data[0] || []).map((h) => String(h).trim());
    const dataRows = result.data.slice(1);
    const totalRows = dataRows.length;

    // Map preview rows using column mappings
    const preview = dataRows.slice(0, 5).map((row) => {
      const mapped: Record<string, string> = {};
      for (const mapping of mappings) {
        if (mapping.target === 'skip') continue;
        const colIndex = headers.indexOf(mapping.source);
        if (colIndex >= 0 && colIndex < row.length) {
          mapped[mapping.target] = String(row[colIndex]).trim();
        }
      }
      return mapped;
    });

    return { headers, preview, totalRows };
  }

  /**
   * Import contacts from CSV content with column mappings
   */
  async importContacts(
    tenantId: string,
    csvContent: string,
    mappings: ColumnMapping[],
    onProgress?: (processed: number, total: number) => void,
  ): Promise<CsvImportResult> {
    this.logger.log(`Starting CSV import for tenant ${tenantId}`);

    // Validate mappings
    this.validateMappings(mappings);

    // Parse CSV
    const result = Papa.parse<string[]>(csvContent, {
      skipEmptyLines: true,
    });

    if (result.errors.length > 0 && result.data.length === 0) {
      throw new BadRequestException(
        `CSV parse error: ${result.errors[0].message}`,
      );
    }

    const headers = (result.data[0] || []).map((h) => String(h).trim());
    const dataRows = result.data.slice(1);

    if (dataRows.length === 0) {
      return { total: 0, created: 0, updated: 0, skipped: 0, errors: [] };
    }

    if (dataRows.length > CSV_IMPORT_LIMITS.MAX_ROWS) {
      throw new BadRequestException(
        `Too many rows (${dataRows.length}). Maximum: ${CSV_IMPORT_LIMITS.MAX_ROWS}`,
      );
    }

    // Map rows to contact data
    const parsedRows = this.mapRowsToContacts(headers, dataRows, mappings);

    // Validate rows
    const { valid, errors } = this.validateRows(parsedRows);

    // Get existing emails for deduplication
    const existingEmails = await this.getExistingEmails(tenantId);

    // Import in batches
    let created = 0;
    let skipped = 0;
    const batchSize = CSV_IMPORT_LIMITS.BATCH_SIZE;

    for (let i = 0; i < valid.length; i += batchSize) {
      const batch = valid.slice(i, i + batchSize);
      const batchResult = await this.importBatch(
        tenantId,
        batch,
        existingEmails,
        errors,
      );
      created += batchResult.created;
      skipped += batchResult.skipped;

      if (onProgress) {
        onProgress(Math.min(i + batchSize, valid.length), valid.length);
      }
    }

    const importResult: CsvImportResult = {
      total: dataRows.length,
      created,
      updated: 0,
      skipped: skipped + (dataRows.length - valid.length),
      errors,
    };

    this.logger.log(
      `CSV import complete: ${created} created, ${importResult.skipped} skipped, ${errors.length} errors`,
    );

    return importResult;
  }

  private validateMappings(mappings: ColumnMapping[]): void {
    if (!mappings || mappings.length === 0) {
      throw new BadRequestException('Column mappings are required');
    }

    // Must have at least one non-skip mapping
    const activeMappings = mappings.filter((m) => m.target !== 'skip');
    if (activeMappings.length === 0) {
      throw new BadRequestException(
        'At least one column must be mapped to a contact field',
      );
    }

    // Validate target fields
    for (const mapping of mappings) {
      if (!CONTACT_IMPORT_FIELDS.includes(mapping.target)) {
        throw new BadRequestException(
          `Invalid mapping target: ${mapping.target}`,
        );
      }
    }

    // Check for duplicate targets (except 'skip')
    const targets = activeMappings.map((m) => m.target);
    const uniqueTargets = new Set(targets);
    if (targets.length !== uniqueTargets.size) {
      throw new BadRequestException(
        'Duplicate column mappings: each field can only be mapped once',
      );
    }
  }

  private mapRowsToContacts(
    headers: string[],
    rows: string[][],
    mappings: ColumnMapping[],
  ): ParsedContactRow[] {
    return rows.map((row, index) => {
      const contact: ParsedContactRow = { rowIndex: index + 2 }; // +2 for 1-based + header row

      for (const mapping of mappings) {
        if (mapping.target === 'skip') continue;
        const colIndex = headers.indexOf(mapping.source);
        if (colIndex >= 0 && colIndex < row.length) {
          const value = String(row[colIndex]).trim();
          if (value) {
            contact[mapping.target as keyof Omit<ParsedContactRow, 'rowIndex'>] = value;
          }
        }
      }

      return contact;
    });
  }

  private validateRows(rows: ParsedContactRow[]): {
    valid: ParsedContactRow[];
    errors: CsvRowError[];
  } {
    const valid: ParsedContactRow[] = [];
    const errors: CsvRowError[] = [];

    for (const row of rows) {
      // Must have at least email or name
      const hasEmail = !!row.email;
      const hasName = !!(row.firstName || row.lastName || row.displayName);

      if (!hasEmail && !hasName) {
        errors.push({
          row: row.rowIndex,
          message: 'Row must have at least an email or a name',
        });
        continue;
      }

      // Validate email format if present
      if (row.email && !this.isValidEmail(row.email)) {
        errors.push({
          row: row.rowIndex,
          field: 'email',
          message: `Invalid email: ${row.email}`,
        });
        continue;
      }

      valid.push(row);
    }

    return { valid, errors };
  }

  private async importBatch(
    tenantId: string,
    rows: ParsedContactRow[],
    existingEmails: Set<string>,
    errors: CsvRowError[],
  ): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    const contactsToCreate: Prisma.ContactCreateManyInput[] = [];

    for (const row of rows) {
      // Dedup by email
      if (row.email) {
        const emailLower = row.email.toLowerCase();
        if (existingEmails.has(emailLower)) {
          skipped++;
          continue;
        }
        existingEmails.add(emailLower);
      }

      const displayName =
        row.displayName ||
        [row.firstName, row.lastName].filter(Boolean).join(' ') ||
        row.email ||
        'Unknown';

      contactsToCreate.push({
        tenantId,
        firstName: row.firstName || undefined,
        lastName: row.lastName || undefined,
        displayName,
        emails: row.email
          ? ([{ value: row.email.toLowerCase(), type: 'work', primary: true }] as unknown as Prisma.InputJsonValue)
          : undefined,
        phoneNumbers: row.phone
          ? ([{ value: row.phone, type: 'work', primary: true }] as unknown as Prisma.InputJsonValue)
          : undefined,
        company: row.company || undefined,
        jobTitle: row.jobTitle || undefined,
        department: row.department || undefined,
        notes: row.notes || undefined,
        tags: row.tags ? row.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [],
        metadata: {
          source: 'csv_import',
          importedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      });
    }

    if (contactsToCreate.length > 0) {
      try {
        const result = await this.prisma.contact.createMany({
          data: contactsToCreate,
          skipDuplicates: true,
        });
        created = result.count;
      } catch (error: any) {
        this.logger.error(`Batch import failed: ${error.message}`);
        // Add errors for the whole batch
        for (const row of rows) {
          errors.push({
            row: row.rowIndex,
            message: `Batch insert failed: ${error.message}`,
          });
        }
      }
    }

    return { created, skipped };
  }

  private async getExistingEmails(tenantId: string): Promise<Set<string>> {
    const existing = await this.prisma.$queryRaw<{ email: string }[]>`
      SELECT DISTINCT LOWER(email_obj->>'value') as email
      FROM "unified_contacts",
           jsonb_array_elements(emails) AS email_obj
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = false
    `;
    return new Set(existing.map((r) => r.email));
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
