/**
 * Database Audit - Understand what data exists for validation
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                     DATABASE AUDIT FOR VALIDATION                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // 1. Tenants overview
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });

  console.log('=== TENANTS OVERVIEW ===\n');
  for (const t of tenants) {
    const emailCount = await prisma.email.count({ where: { tenantId: t.id } });
    const contactCount = await prisma.contact.count({ where: { tenantId: t.id } });
    const memoryCount = await prisma.aIMemory.count({ where: { tenantId: t.id } });
    const folderCount = await prisma.folder.count({ where: { tenantId: t.id } });
    const userCount = await prisma.user.count({ where: { tenantId: t.id } });

    console.log(`📁 ${t.name} (${t.id.slice(0, 8)}...)`);
    console.log(`   Users: ${userCount} | Emails: ${emailCount} | Contacts: ${contactCount}`);
    console.log(`   Folders: ${folderCount} | AI Memories: ${memoryCount}\n`);
  }

  // 2. Sample emails from main tenant (Davide's)
  const mainTenant = tenants.find(t => t.name.includes('Davide'));
  if (mainTenant) {
    console.log('\n=== SAMPLE EMAILS (Real Data) ===\n');

    const emails = await prisma.email.findMany({
      where: { tenantId: mainTenant.id },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        isRead: true,
        isStarred: true,
        snippet: true,
        _count: { select: { attachments: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 10,
    });

    emails.forEach((e, i) => {
      const hasAttach = e._count.attachments > 0;
      console.log(`${i + 1}. [${e.isRead ? ' ' : '●'}] ${e.subject?.slice(0, 60) || '(no subject)'}`);
      console.log(`   From: ${e.from} | ${e.receivedAt?.toISOString().split('T')[0]}`);
      console.log(`   ${e.isStarred ? '⭐' : ''} ${hasAttach ? '📎' : ''}`);
      console.log(`   Snippet: ${e.snippet?.slice(0, 80)}...`);
      console.log('');
    });

    // 3. Email statistics
    console.log('\n=== EMAIL STATISTICS ===\n');

    const unreadCount = await prisma.email.count({
      where: { tenantId: mainTenant.id, isRead: false },
    });
    const starredCount = await prisma.email.count({
      where: { tenantId: mainTenant.id, isStarred: true },
    });

    // Top senders
    const topSenders = await prisma.email.groupBy({
      by: ['from'],
      where: { tenantId: mainTenant.id },
      _count: true,
      orderBy: { _count: { from: 'desc' } },
      take: 5,
    });

    console.log(`Unread: ${unreadCount}`);
    console.log(`Starred: ${starredCount}`);
    console.log('\nTop Senders:');
    topSenders.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.from} (${s._count} emails)`);
    });

    // 4. Sample contacts
    console.log('\n\n=== SAMPLE CONTACTS ===\n');

    const contacts = await prisma.contact.findMany({
      where: { tenantId: mainTenant.id },
      select: {
        id: true,
        displayName: true,
        company: true,
        jobTitle: true,
        emails: true,
      },
      take: 10,
    });

    contacts.forEach((c, i) => {
      const email = c.emails ? JSON.parse(c.emails as string)[0]?.value : 'N/A';
      console.log(`${i + 1}. ${c.displayName || 'Unknown'}`);
      console.log(`   ${c.jobTitle || ''} ${c.company ? `@ ${c.company}` : ''}`);
      console.log(`   Email: ${email}\n`);
    });

    // 5. AI Memories
    console.log('\n=== AI MEMORIES ===\n');

    const memories = await prisma.aIMemory.findMany({
      where: { tenantId: mainTenant.id },
      select: {
        id: true,
        content: true,
        memoryType: true,
        category: true,
        confidence: true,
        usageCount: true,
      },
      take: 10,
    });

    if (memories.length === 0) {
      console.log('No AI memories stored yet.');
    } else {
      memories.forEach((m, i) => {
        console.log(`${i + 1}. [${m.memoryType}] ${m.content.slice(0, 70)}...`);
        console.log(`   Category: ${m.category || 'N/A'} | Confidence: ${m.confidence} | Used: ${m.usageCount}x\n`);
      });
    }
  }

  // 6. Check for test tenant
  const testTenant = tenants.find(t => t.name.toLowerCase().includes('test') || t.name.toLowerCase().includes('synthetic'));
  if (testTenant) {
    console.log('\n=== TEST/SYNTHETIC TENANT ===\n');
    console.log(`Found: ${testTenant.name}`);

    const testEmails = await prisma.email.count({ where: { tenantId: testTenant.id } });
    const testContacts = await prisma.contact.count({ where: { tenantId: testTenant.id } });

    console.log(`Test Emails: ${testEmails}`);
    console.log(`Test Contacts: ${testContacts}`);

    if (testEmails > 0) {
      const samples = await prisma.email.findMany({
        where: { tenantId: testTenant.id },
        select: { subject: true, from: true },
        take: 5,
      });
      console.log('\nSample test emails:');
      samples.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.subject} (from: ${e.from})`);
      });
    }
  } else {
    console.log('\n⚠️  No test/synthetic tenant found.');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
