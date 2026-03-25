/**
 * CRM Excel Export Service
 *
 * Exports contacts and accounts to XLSX format using ExcelJS.
 * Supports configurable columns and filter passthrough.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

type ExportEntity = 'contacts' | 'accounts';

interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

const CONTACT_COLUMNS: ExportColumn[] = [
  { header: 'First Name', key: 'firstName', width: 18 },
  { header: 'Last Name', key: 'lastName', width: 18 },
  { header: 'Display Name', key: 'displayName', width: 22 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Phone', key: 'phone', width: 18 },
  { header: 'Company', key: 'company', width: 20 },
  { header: 'Job Title', key: 'jobTitle', width: 20 },
  { header: 'Department', key: 'department', width: 18 },
  { header: 'Tags', key: 'tags', width: 20 },
  { header: 'Notes', key: 'notes', width: 30 },
];

const ACCOUNT_COLUMNS: ExportColumn[] = [
  { header: 'Name', key: 'name', width: 24 },
  { header: 'Website', key: 'website', width: 28 },
  { header: 'Industry', key: 'industry', width: 18 },
  { header: 'Size', key: 'size', width: 12 },
  { header: 'Revenue', key: 'revenue', width: 14 },
  { header: 'Currency', key: 'currency', width: 10 },
  { header: 'Phone', key: 'phone', width: 18 },
  { header: 'Description', key: 'description', width: 30 },
  { header: 'Street', key: 'street', width: 24 },
  { header: 'City', key: 'city', width: 16 },
  { header: 'State', key: 'state', width: 14 },
  { header: 'ZIP', key: 'zip', width: 10 },
  { header: 'Country', key: 'country', width: 14 },
];

@Injectable()
export class ExcelExportService {
  private readonly logger = new Logger(ExcelExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async exportContacts(
    tenantId: string,
    filters?: { search?: string },
  ): Promise<Buffer> {
    this.logger.log(`Exporting contacts for tenant ${tenantId}`);

    const where: any = { tenantId, isDeleted: false };
    if (filters?.search) {
      where.OR = [
        { displayName: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { company: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const contacts = await this.prisma.contact.findMany({
      where,
      orderBy: { displayName: 'asc' },
      take: 10_000,
    });

    const rows = contacts.map((c) => {
      const emails = Array.isArray(c.emails) ? c.emails : [];
      const phones = Array.isArray(c.phoneNumbers) ? c.phoneNumbers : [];
      const primaryEmail = (emails.find((e: any) => e.primary) as any)?.value ?? (emails[0] as any)?.value ?? '';
      const primaryPhone = (phones.find((p: any) => p.primary) as any)?.value ?? (phones[0] as any)?.value ?? '';

      return {
        firstName: c.firstName ?? '',
        lastName: c.lastName ?? '',
        displayName: c.displayName ?? '',
        email: primaryEmail,
        phone: primaryPhone,
        company: c.company ?? '',
        jobTitle: c.jobTitle ?? '',
        department: c.department ?? '',
        tags: (c.tags ?? []).join(', '),
        notes: c.notes ?? '',
      };
    });

    return this.buildWorkbook('Contacts', CONTACT_COLUMNS, rows);
  }

  async exportAccounts(
    tenantId: string,
    filters?: { search?: string; industry?: string },
  ): Promise<Buffer> {
    this.logger.log(`Exporting accounts for tenant ${tenantId}`);

    const where: any = { tenantId, deletedAt: null };
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { website: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters?.industry) {
      where.industry = filters.industry;
    }

    const accounts = await this.prisma.crmAccount.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 10_000,
    });

    const rows = accounts.map((a) => {
      const addr = (a.address as any) ?? {};
      return {
        name: a.name,
        website: a.website ?? '',
        industry: a.industry ?? '',
        size: a.size ?? '',
        revenue: a.revenue?.toString() ?? '',
        currency: a.currency ?? '',
        phone: a.phone ?? '',
        description: a.description ?? '',
        street: addr.street ?? '',
        city: addr.city ?? '',
        state: addr.state ?? '',
        zip: addr.zip ?? '',
        country: addr.country ?? '',
      };
    });

    return this.buildWorkbook('Accounts', ACCOUNT_COLUMNS, rows);
  }

  private async buildWorkbook(
    sheetName: string,
    columns: ExportColumn[],
    rows: Record<string, string>[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PMSync CRM';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width ?? 15,
    }));

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F5E9' },
    };

    // Add data rows
    for (const row of rows) {
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
