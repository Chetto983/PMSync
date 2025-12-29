import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  const emails = await prisma.email.findMany({
    where: {
      subject: { contains: 'BP eDesk', mode: 'insensitive' }
    },
    select: {
      id: true,
      subject: true,
      from: true,
      bodyHtml: true,
      bodyText: true,
      snippet: true,
      receivedAt: true
    },
    take: 5
  });

  console.log('Found emails:', emails.length);
  emails.forEach(e => {
    console.log('---');
    console.log('ID:', e.id);
    console.log('Subject:', e.subject);
    console.log('From:', e.from);
    console.log('Body HTML length:', e.bodyHtml?.length || 0);
    console.log('Body Text length:', e.bodyText?.length || 0);
    console.log('Snippet:', e.snippet?.substring(0, 200));
    console.log('Body HTML (first 2000):');
    console.log(e.bodyHtml?.substring(0, 2000));
    console.log('Body Text (first 2000):');
    console.log(e.bodyText?.substring(0, 2000));
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
