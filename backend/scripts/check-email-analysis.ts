import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function check() {
  // Find the komoot email
  const email = await prisma.email.findFirst({
    where: {
      from: { contains: 'noreply@mail.komoot.com' },
      subject: { contains: 'grandi novità' },
    },
    select: { id: true, subject: true },
  });

  if (!email) {
    console.log('Email not found');
    await prisma.$disconnect();
    return;
  }

  console.log(`Email: ${email.subject}`);
  console.log(`ID: ${email.id}\n`);

  // Check EmailAnalysis table
  const analysis = await prisma.emailAnalysis.findFirst({
    where: { emailId: email.id },
  });

  if (analysis) {
    console.log('EmailAnalysis found:');
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    console.log('No EmailAnalysis record found!');
  }

  await prisma.$disconnect();
}

check().catch(console.error);
