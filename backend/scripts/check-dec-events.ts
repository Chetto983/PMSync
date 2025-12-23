import 'dotenv/config';

async function main() {
  const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
  const prisma = createPrismaClient();

  // Check events around Dec 24, 2025
  const startDate = new Date('2025-12-20');
  const endDate = new Date('2025-12-31');

  const events = await prisma.calendarEvent.findMany({
    where: {
      isDeleted: false,
      startTime: { gte: startDate, lte: endDate },
    },
    select: {
      title: true,
      startTime: true,
      calendarName: true,
    },
    orderBy: { startTime: 'asc' },
    take: 20,
  });

  console.log('Events between Dec 20-31, 2025:');
  for (const e of events) {
    const dateStr = e.startTime.toISOString().substring(0, 10);
    const calName = (e.calendarName || 'unknown').substring(0, 25).padEnd(25);
    console.log(`  ${dateStr} | ${calName} | ${e.title}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
