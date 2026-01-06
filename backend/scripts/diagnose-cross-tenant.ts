/**
 * Diagnose Cross-Tenant Data Issues
 *
 * Checks for:
 * 1. Emails with wrong tenantId
 * 2. Embeddings with wrong tenantId
 * 3. Providers shared across tenants
 * 4. VoltAgent memory with wrong user_id format
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();

  console.log('=== CROSS-TENANT DIAGNOSTIC ===\n');

  // 1. List all tenants
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true }
  });
  console.log('TENANTS:');
  tenants.forEach(t => console.log(`  ${t.id} - ${t.name}`));
  console.log('');

  // 2. Check emails per tenant
  console.log('EMAILS BY TENANT:');
  for (const tenant of tenants) {
    const count = await prisma.email.count({ where: { tenantId: tenant.id } });
    const sample = await prisma.email.findFirst({
      where: { tenantId: tenant.id },
      select: { from: true, subject: true }
    });
    console.log(`  ${tenant.name}: ${count} emails`);
    if (sample) {
      console.log(`    Sample: ${sample.from} - ${sample.subject?.substring(0, 50)}`);
    }
  }
  console.log('');

  // 3. Check providers per tenant
  console.log('PROVIDERS BY TENANT:');
  for (const tenant of tenants) {
    const providers = await prisma.providerConfig.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, email: true, userId: true, providerType: true }
    });
    console.log(`  ${tenant.name}:`);
    providers.forEach(p => console.log(`    ${p.email} (${p.providerType})`));
  }
  console.log('');

  // 4. Check for emails with provider from different tenant
  console.log('CHECKING FOR CROSS-TENANT EMAIL-PROVIDER MISMATCH:');
  const mismatch = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count
    FROM emails e
    JOIN provider_configs p ON e."providerId" = p.id
    WHERE e."tenantId" != p."tenantId"
  `;
  console.log(`  Mismatched email-provider tenant: ${mismatch[0].count}`);
  console.log('');

  // 5. Check embeddings per tenant
  console.log('EMBEDDINGS BY TENANT:');
  for (const tenant of tenants) {
    const count = await prisma.embedding.count({ where: { tenantId: tenant.id } });
    const sample = await prisma.embedding.findFirst({
      where: { tenantId: tenant.id },
      select: { content: true, metadata: true }
    });
    console.log(`  ${tenant.name}: ${count} embeddings`);
    if (sample) {
      console.log(`    Sample: ${sample.content?.substring(0, 60)}...`);
    }
  }
  console.log('');

  // 6. Check VoltAgent memory user_id format
  console.log('VOLTAGENT MEMORY USER_ID FORMAT CHECK:');
  const memoryUsers = await prisma.$queryRaw<{user_id: string}[]>`
    SELECT DISTINCT user_id FROM voltagent_memory_messages
  `;
  console.log('  User IDs in memory:');
  for (const row of memoryUsers) {
    const parts = row.user_id.split(':');
    if (parts.length >= 2) {
      const tenantPart = parts[0];
      const tenant = tenants.find(t => t.id === tenantPart);
      console.log(`    ${row.user_id} -> Tenant: ${tenant?.name || 'UNKNOWN'}`);
    } else {
      console.log(`    ${row.user_id} -> INVALID FORMAT (no tenant prefix!)`);
    }
  }
  console.log('');

  // 7. Check for ANY emails containing test tenant names appearing in other tenants
  const testTenantId = 'cmk2x2zwj0000s4yh5nlq8izj'; // Italian RAG Test
  const davidesTenantId = 'cmjgylxkg000054yhnjpkmzd9'; // Davide's Workspace

  console.log('CHECKING FOR ITALIAN RAG TEST EMAIL NAMES IN DAVIDE\'S WORKSPACE:');
  const testNames = ['Mario Rossi', 'Laura Bianchi', 'Luca Verdi', 'Sofia Neri'];
  for (const name of testNames) {
    const inDavide = await prisma.email.count({
      where: {
        tenantId: davidesTenantId,
        OR: [
          { from: { contains: name, mode: 'insensitive' } },
          { subject: { contains: name, mode: 'insensitive' } },
        ]
      }
    });
    const inTest = await prisma.email.count({
      where: {
        tenantId: testTenantId,
        OR: [
          { from: { contains: name, mode: 'insensitive' } },
          { subject: { contains: name, mode: 'insensitive' } },
        ]
      }
    });
    console.log(`  "${name}": Davide=${inDavide}, ItalianRAG=${inTest}`);
  }
  console.log('');

  // 8. Check embeddings for test tenant content in wrong tenant
  console.log('CHECKING FOR TEST TENANT CONTENT IN DAVIDE\'S EMBEDDINGS:');
  const testPatterns = ['azienda.com', 'partner.com', 'cliente.com', 'fornitore.com'];
  for (const pattern of testPatterns) {
    const inDavide = await prisma.embedding.count({
      where: {
        tenantId: davidesTenantId,
        content: { contains: pattern, mode: 'insensitive' }
      }
    });
    const inTest = await prisma.embedding.count({
      where: {
        tenantId: testTenantId,
        content: { contains: pattern, mode: 'insensitive' }
      }
    });
    console.log(`  "${pattern}": Davide=${inDavide}, ItalianRAG=${inTest}`);
  }
  console.log('');

  console.log('=== DIAGNOSTIC COMPLETE ===');

  await prisma.$disconnect();
}

main().catch(console.error);
