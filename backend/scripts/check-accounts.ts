import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const p = createPrismaClient();
  const accounts = await p.account.findMany({
    include: { user: { select: { email: true } } },
  });
  for (const a of accounts) {
    console.log(
      'user:', a.user?.email,
      '| provider:', a.providerId,
      '| hasPassword:', !!a.password,
    );
  }
  await p.$disconnect();
}
main();
