/**
 * Create a real user for testing
 */
import * as bcrypt from 'bcrypt';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  const email = 'dvdmarchetto@gmail.com';
  const tenantSlug = email.toLowerCase(); // Each user has their own tenant

  console.log('Creating tenant and user for:', email);

  // Create tenant (each user has their own)
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: {
      name: `Tenant for ${email}`,
      slug: tenantSlug,
      description: `Personal tenant for ${email}`,
      isActive: true,
    },
  });

  console.log('✅ Tenant created:', tenant.slug);

  // Create user with a temporary password (user will use OTP)
  const passwordHash = await bcrypt.hash('TempPassword123!', 10);
  const user = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: email,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: email,
      passwordHash: passwordHash,
      firstName: 'Dvd',
      lastName: 'Marchetto',
      role: 'admin',
      isMfaEnabled: true,
      isActive: true,
    },
  });

  console.log('✅ User created:', user.email);
  console.log('\n📋 Login Info:');
  console.log('  Email:', email);
  console.log('  Tenant Slug:', tenantSlug);
  console.log('  MFA Enabled: Yes (OTP via email)');
  console.log('\n🔐 To login:');
  console.log('  1. POST /auth/send-otp with { email, tenantSlug }');
  console.log('  2. Check email for OTP or backend logs in dev mode');
  console.log('  3. POST /auth/verify-otp with { email, code, tenantSlug }');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
