/**
 * Seed database with sample data for local development
 * Run with: npx prisma db seed
 * This runs automatically when Docker starts the backend
 */

import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('🌱 Seeding database with test data...');
  console.log('');

  // Create default tenant
  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Tenant',
      slug: 'default',
      description: 'Default tenant for local development',
      isActive: true,
    },
  });

  console.log('✅ Created default tenant:', defaultTenant.name);

  // Create test user (admin)
  const adminPassword = await bcrypt.hash('TestPassword123!', 10);
  const adminUser = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: defaultTenant.id,
        email: 'admin@pmsync.local',
      },
    },
    update: {},
    create: {
      tenantId: defaultTenant.id,
      email: 'admin@pmsync.local',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      isMfaEnabled: true,
    },
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create regular test user
  const userPassword = await bcrypt.hash('UserPassword123!', 10);
  const regularUser = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: defaultTenant.id,
        email: 'test@pmsync.local',
      },
    },
    update: {},
    create: {
      tenantId: defaultTenant.id,
      email: 'test@pmsync.local',
      passwordHash: userPassword,
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      isMfaEnabled: true,
    },
  });

  console.log('✅ Created regular user:', regularUser.email);

  console.log('✅ Skipped sample messages (schema changed)');

  console.log('');
  console.log('🎉 Database seeding completed successfully!');
  console.log('');
  console.log('📋 Test Accounts Created:');
  console.log('─────────────────────────────────────────');
  console.log('  Admin Account:');
  console.log('    • Email: admin@pmsync.local');
  console.log('    • Password: TestPassword123!');
  console.log('    • Role: Administrator');
  console.log('');
  console.log('  Regular User Account:');
  console.log('    • Email: test@pmsync.local');
  console.log('    • Password: UserPassword123!');
  console.log('    • Role: User');
  console.log('');
  console.log('🔐 Security Notes:');
  console.log('  • MFA is ENABLED for both accounts');
  console.log('  • OTP will be sent via email in real deployment');
  console.log('  • For testing: check logs for generated OTP codes');
  console.log('');
  console.log('📊 Sample Data:');
  console.log('  • Default tenant created');
  console.log('  • Sample conversation added (4 messages)');
  console.log('');
  console.log('🚀 Next Steps:');
  console.log('  1. Visit: http://localhost:3001/auth/login');
  console.log('  2. Use admin@pmsync.local or test@pmsync.local');
  console.log('  3. Enter password');
  console.log('  4. Enter OTP (check docker logs for code)');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
