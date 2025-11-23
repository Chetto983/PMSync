/**
 * Generate JWT Token for testing
 */
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const JWT_SECRET = process.env.JWT_SECRET || '932aec0fcb90f774f70cbc147cc92a8b42a548e993364da749328aa935d9aaa8280e5b390b3113a8c448bdfd337369ac643d41d4fdf52cc1797fca1ea24900e4';

async function getToken() {
  const prisma = new PrismaClient();

  try {
    // Get first user with providers
    const user = await prisma.user.findFirst({
      include: {
        providers: true
      }
    });

    if (!user) {
      console.error('No user found in database');
      process.exit(1);
    }

    if (user.providers.length === 0) {
      console.error('User has no email providers configured');
      process.exit(1);
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('\n✅ Token generated successfully!\n');
    console.log('User:', user.email);
    console.log('Tenant:', user.tenantId);
    console.log('Providers:', user.providers.length);
    user.providers.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.email} (${p.type})`);
    });
    console.log('\nJWT Token:');
    console.log(token);
    console.log('\n');

    return token;
  } finally {
    await prisma.$disconnect();
  }
}

getToken().catch(console.error);
