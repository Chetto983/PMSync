import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const p = createPrismaClient();
  const r = await p.$queryRawUnsafe<any[]>(
    `SELECT LENGTH(image) as len, LEFT(image, 150) as preview FROM "users" WHERE image IS NOT NULL`,
  );
  for (const row of r) {
    console.log(`Length: ${row.len} chars`);
    console.log(`Preview: ${row.preview}`);
  }
  await p.$disconnect();
}
main();
