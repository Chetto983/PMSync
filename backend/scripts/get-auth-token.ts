import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import * as jwt from 'jsonwebtoken';

const prisma = createPrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { tenantId: 'cmjgylxkg000054yhnjpkmzd9' },
    select: { id: true, email: true, role: true, tenantId: true },
  });
  if (!user) { console.error('No user found'); process.exit(1); }
  console.log('User:', JSON.stringify(user));

  const secret = process.env.JWT_SECRET;
  if (!secret) { console.error('JWT_SECRET not set'); process.exit(1); }

  const token = jwt.sign(
    { userId: user.id, sub: user.id, email: user.email, tenantId: user.tenantId, role: user.role },
    secret,
    { expiresIn: '1h' },
  );

  console.log('\nTOKEN=' + token);
}

main().catch(console.error).finally(() => prisma.$disconnect());
