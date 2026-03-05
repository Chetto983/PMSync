const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findMany({ select: { email: true, role: true, isActive: true } })
  .then(u => { console.log(JSON.stringify(u, null, 2)); return p.$disconnect(); })
  .catch(e => { console.error(e); return p.$disconnect(); });
