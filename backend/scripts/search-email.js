require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get the provider info
  const provider = await prisma.providerConfig.findUnique({
    where: { id: 'cmjgymu5a000354yhqyw1wz8g' },
    select: {
      id: true,
      email: true,
      providerType: true,
      displayName: true
    }
  });

  console.log('=== PROVIDER INFO ===');
  console.log(JSON.stringify(provider, null, 2));

  // Get the specific email with ALL fields
  const email = await prisma.email.findUnique({
    where: { id: 'cmjqx761c010rewyhpot0y8dj' }
  });

  if (email) {
    console.log('\n=== FULL EMAIL RECORD ===');
    console.log(JSON.stringify(email, null, 2));
  }

  // Count total emails with invalid From (no @)
  const totalBadFrom = await prisma.email.count({
    where: {
      from: { not: { contains: '@' } }
    }
  });

  console.log('\n=== EMAILS WITH INVALID FROM (no @) ===');
  console.log('Total count:', totalBadFrom);

  // Also check emails with short "from" values (potential data issues)
  const badFromEmails = await prisma.email.findMany({
    where: {
      from: { not: { contains: '@' } }
    },
    select: {
      id: true,
      subject: true,
      from: true,
      to: true,
      headers: true,
      providerId: true,
      externalId: true
    },
    take: 20
  });

  badFromEmails.forEach(e => {
    console.log('---');
    console.log('ID:', e.id);
    console.log('Subject:', e.subject?.substring(0, 50));
    console.log('From:', e.from);
    console.log('To:', e.to);
    console.log('External ID:', e.externalId);
    console.log('Headers (if any):', e.headers ? JSON.stringify(e.headers).substring(0, 200) : 'null');
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
