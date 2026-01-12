/**
 * Sample test data from Italian RAG Test and RAG Benchmark tenants
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  // Find Italian RAG Test tenant
  const italianTenant = await prisma.tenant.findFirst({
    where: { name: { contains: 'Italian' } },
  });

  if (italianTenant) {
    console.log('=== ITALIAN RAG TEST TENANT ===');
    console.log('ID:', italianTenant.id);
    console.log('');

    // Sample emails
    const emails = await prisma.email.findMany({
      where: { tenantId: italianTenant.id },
      select: {
        id: true,
        subject: true,
        from: true,
        snippet: true,
        bodyText: true,
        receivedAt: true,
        aiPriority: true,
        aiLabels: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: 15,
    });

    console.log(`Sample emails (${emails.length} shown):`);
    emails.forEach((e, i) => {
      console.log('');
      console.log(`${i + 1}. ${e.subject}`);
      console.log(`   From: ${e.from}`);
      console.log(`   Date: ${e.receivedAt?.toISOString().split('T')[0] || 'N/A'}`);
      console.log(`   Priority: ${e.aiPriority || 'N/A'} | Labels: ${e.aiLabels?.join(', ') || 'none'}`);
      console.log(`   Snippet: ${(e.snippet?.slice(0, 100) || e.bodyText?.slice(0, 100) || 'N/A')}...`);
    });

    // Sample contacts
    const contacts = await prisma.contact.findMany({
      where: { tenantId: italianTenant.id },
      select: { displayName: true, company: true, jobTitle: true },
      take: 10,
    });

    console.log('\n=== CONTACTS ===');
    contacts.forEach((c, i) => {
      console.log(`${i + 1}. ${c.displayName} - ${c.jobTitle || ''} @ ${c.company || 'N/A'}`);
    });
  } else {
    console.log('No Italian test tenant found');
  }

  // AI Memories in RAG Benchmark tenant
  const ragTenant = await prisma.tenant.findFirst({
    where: { name: { contains: 'RAG Benchmark' } },
  });

  if (ragTenant) {
    console.log('\n=== RAG BENCHMARK TENANT ===');
    console.log('ID:', ragTenant.id);

    const memories = await prisma.aIMemory.findMany({
      where: { tenantId: ragTenant.id },
      select: { content: true, memoryType: true, category: true },
    });

    console.log(`\nAI Memories (${memories.length}):`);
    memories.forEach((m, i) => {
      console.log(`${i + 1}. [${m.memoryType}] ${m.content.slice(0, 100)}...`);
    });

    const ragEmails = await prisma.email.findMany({
      where: { tenantId: ragTenant.id },
      select: {
        subject: true,
        from: true,
        bodyText: true,
        snippet: true,
      },
      take: 10,
    });

    console.log(`\nSample emails (${ragEmails.length}):`);
    ragEmails.forEach((e, i) => {
      console.log(`${i + 1}. ${e.subject}`);
      console.log(`   From: ${e.from}`);
      console.log(`   Body: ${(e.bodyText?.slice(0, 120) || e.snippet?.slice(0, 120) || 'N/A')}...`);
      console.log('');
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
