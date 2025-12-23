import 'dotenv/config';

async function main() {
  const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
  const prisma = createPrismaClient();

  const events = await prisma.calendarEvent.findMany({
    where: {
      calendarName: { contains: 'compleann', mode: 'insensitive' },
      isDeleted: false,
    },
    select: {
      id: true,
      externalId: true,
      title: true,
      startTime: true,
      calendarName: true,
      description: true,
      organizer: true,
      attendees: true,
      metadata: true,
    },
    take: 10,
  });

  console.log(`Found ${events.length} birthday calendar events:\n`);
  for (const e of events) {
    console.log(`Title: "${e.title}"`);
    console.log(`Date: ${e.startTime}`);
    console.log(`Calendar: ${e.calendarName}`);
    console.log(`Description: ${e.description?.substring(0, 100)}...`);
    console.log(`ExternalId: ${e.externalId?.substring(0, 50)}...`);
    console.log(`Attendees: ${JSON.stringify(e.attendees)}`);
    console.log(`Metadata: ${JSON.stringify(e.metadata)}`);
    console.log('---');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
