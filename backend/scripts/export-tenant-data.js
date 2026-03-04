/**
 * Export tenant data from database to D:\PMSync\data\export\
 * - Last 500 emails with attachments
 * - All calendar events
 * - All contacts
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '../../data/export');

async function main() {
  // Ensure output dir exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Get tenant info
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true },
    });
    console.log(`Found ${tenants.length} tenant(s):`, tenants.map(t => `${t.name} (${t.id})`).join(', '));

    if (tenants.length === 0) {
      console.log('No tenants found. Exiting.');
      return;
    }

    const tenantId = tenants[0].id;
    console.log(`\nExporting data for tenant: ${tenants[0].name} (${tenantId})\n`);

    // 2. Counts
    const [emailCount, contactCount, calendarCount, attachmentCount] = await Promise.all([
      prisma.email.count({ where: { tenantId } }),
      prisma.contact.count({ where: { tenantId } }),
      prisma.calendarEvent.count({ where: { tenantId } }),
      prisma.emailAttachment.count({ where: { tenantId } }),
    ]);

    console.log('--- Record Counts ---');
    console.log(`Emails: ${emailCount}`);
    console.log(`Contacts: ${contactCount}`);
    console.log(`Calendar Events: ${calendarCount}`);
    console.log(`Email Attachments: ${attachmentCount}`);
    console.log('---------------------\n');

    // 3. Export last 500 emails with attachments
    console.log('Exporting last 500 emails with attachments...');
    const emails = await prisma.email.findMany({
      where: { tenantId },
      orderBy: { receivedAt: 'desc' },
      take: 500,
      select: {
        id: true,
        externalId: true,
        threadId: true,
        messageId: true,
        from: true,
        to: true,
        cc: true,
        bcc: true,
        replyTo: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        snippet: true,
        folder: true,
        labels: true,
        isRead: true,
        isStarred: true,
        isFlagged: true,
        isDraft: true,
        isDeleted: true,
        isArchived: true,
        sentAt: true,
        receivedAt: true,
        size: true,
        hasCalendarInvite: true,
        calendarInviteStatus: true,
        aiPriority: true,
        aiPriorityReason: true,
        aiSentiment: true,
        aiLabels: true,
        attachments: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            size: true,
            contentId: true,
            storageType: true,
            storagePath: true,
            isInline: true,
            createdAt: true,
          },
        },
      },
    });

    const emailsFile = path.join(OUTPUT_DIR, 'emails-last-500.json');
    fs.writeFileSync(emailsFile, JSON.stringify(emails, null, 2), 'utf-8');
    console.log(`  -> Exported ${emails.length} emails to emails-last-500.json`);

    const emailsWithAttachments = emails.filter(e => e.attachments.length > 0);
    console.log(`  -> ${emailsWithAttachments.length} of ${emails.length} emails have attachments`);

    const totalAttachments = emails.reduce((sum, e) => sum + e.attachments.length, 0);
    console.log(`  -> Total attachment records in export: ${totalAttachments}`);

    // 4. Export all calendar events
    console.log('\nExporting calendar events...');
    const calendarEvents = await prisma.calendarEvent.findMany({
      where: { tenantId },
      orderBy: { startTime: 'desc' },
      select: {
        id: true,
        externalId: true,
        calendarId: true,
        iCalUID: true,
        title: true,
        description: true,
        location: true,
        organizer: true,
        attendees: true,
        startTime: true,
        endTime: true,
        isAllDay: true,
        timeZone: true,
        recurrence: true,
        status: true,
        visibility: true,
        isDeleted: true,
        isCancelled: true,
        reminders: true,
        htmlLink: true,
        calendarName: true,
        attachments: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            size: true,
            fileUrl: true,
            createdAt: true,
          },
        },
      },
    });

    const calendarFile = path.join(OUTPUT_DIR, 'calendar-events.json');
    fs.writeFileSync(calendarFile, JSON.stringify(calendarEvents, null, 2), 'utf-8');
    console.log(`  -> Exported ${calendarEvents.length} calendar events to calendar-events.json`);

    // 5. Export all contacts
    console.log('\nExporting contacts...');
    const contacts = await prisma.contact.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        middleName: true,
        nickname: true,
        prefix: true,
        suffix: true,
        emails: true,
        phoneNumbers: true,
        addresses: true,
        company: true,
        jobTitle: true,
        department: true,
        birthday: true,
        anniversary: true,
        websites: true,
        socialProfiles: true,
        notes: true,
        tags: true,
        photoUrl: true,
        isDeleted: true,
        isStarred: true,
        isFavorite: true,
        isVip: true,
        lastInteractedAt: true,
        receivedCount: true,
        sentCount: true,
        totalInteractions: true,
        relationshipScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const contactsFile = path.join(OUTPUT_DIR, 'contacts.json');
    fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2), 'utf-8');
    console.log(`  -> Exported ${contacts.length} contacts to contacts.json`);

    // 6. Summary
    console.log('\n========== EXPORT SUMMARY ==========');
    console.log(`Tenant: ${tenants[0].name} (${tenantId})`);
    console.log(`Emails exported: ${emails.length} (last 500 by receivedAt)`);
    console.log(`  - With attachments: ${emailsWithAttachments.length}`);
    console.log(`  - Total attachment records: ${totalAttachments}`);
    console.log(`Calendar events exported: ${calendarEvents.length}`);
    console.log(`Contacts exported: ${contacts.length}`);
    console.log(`Output directory: ${OUTPUT_DIR}`);
    console.log('=====================================');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Export failed:', e);
  process.exit(1);
});
