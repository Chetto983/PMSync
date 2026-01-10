/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function checkPatterns() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'italian-rag-test' } });
  if (!tenant) { console.log('No tenant'); return; }
  
  const emails = await prisma.email.findMany({
    where: { tenantId: tenant.id, bodyText: { not: null } },
    select: { bodyText: true },
    take: 100,
  });

  const patterns: Record<string, RegExp> = {
    'rispondi/rispondere': /rispondi|rispondere|risposta/i,
    'conferma/confermare': /conferma|confermare/i,
    'attendo/aspetto': /attendo|aspetto/i,
    'fammi sapere': /fammi sapere/i,
    'urgente': /urgente|urgenza/i,
    'scadenza': /scadenza|deadline/i,
    'possibile/possiamo': /possibile|possiamo|posso/i,
    'proposta': /proposta|proporre/i,
    'budget/RAL': /budget|RAL/i,
  };

  console.log('=== PATTERN FREQUENCY IN 100 EMAILS ===');
  for (const [name, regex] of Object.entries(patterns)) {
    let count = 0;
    for (const e of emails) {
      if (regex.test(e.bodyText || '')) count++;
    }
    console.log(name + ': ' + count + ' emails');
  }

  console.log('\n=== SAMPLE EMAIL BODIES ===');
  for (const e of emails.slice(0, 3)) {
    console.log('---');
    console.log((e.bodyText || '').slice(0, 200));
  }

  await prisma.$disconnect();
}
checkPatterns().catch(e => { console.error(e); process.exit(1); });
