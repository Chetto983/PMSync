require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set for Prisma Client');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

module.exports = { createPrismaClient };
