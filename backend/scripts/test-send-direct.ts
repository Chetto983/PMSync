/**
 * Direct Email Send Test using Services
 * Sends test emails from Google -> Microsoft and Microsoft -> Google
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

const GOOGLE_PROVIDER_ID = 'cmi7m1nod0007yhj4lawfkjww';
const MS_PROVIDER_ID = 'cmi7m4qz907ydyhj4vwqdbnj5';
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

const GOOGLE_EMAIL = 'dvdmarchetto@gmail.com';
const MS_EMAIL = 'chetto983@hotmail.it';

async function getProviderTokens() {
  console.log('\n=== CHECKING PROVIDER TOKENS ===\n');

  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      id: true,
      email: true,
      providerType: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      lastSyncedAt: true,
    },
  });

  for (const p of providers) {
    console.log(`${p.providerType.toUpperCase()}: ${p.email}`);
    console.log(`  Has Access Token: ${!!p.accessToken}`);
    console.log(`  Has Refresh Token: ${!!p.refreshToken}`);
    console.log(`  Token Expires: ${p.tokenExpiresAt}`);
    console.log(`  Token Valid: ${p.tokenExpiresAt ? new Date(p.tokenExpiresAt) > new Date() : 'Unknown'}`);
    console.log(`  Last Sync: ${p.lastSyncedAt}`);
    console.log('');
  }

  return providers;
}

async function checkRecentEmails() {
  console.log('\n=== RECENT EMAILS FROM BOTH PROVIDERS ===\n');

  // Google emails
  const googleEmails = await prisma.email.findMany({
    where: { tenantId: TENANT_ID, providerId: GOOGLE_PROVIDER_ID, isDeleted: false },
    orderBy: { receivedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      subject: true,
      from: true,
      to: true,
      receivedAt: true,
    },
  });

  console.log('📧 Google (last 5 emails):');
  googleEmails.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.subject?.substring(0, 50)}`);
    console.log(`     From: ${e.from}`);
    console.log(`     To: ${JSON.stringify(e.to)}`);
    console.log(`     Date: ${e.receivedAt}`);
  });

  // Microsoft emails
  const msEmails = await prisma.email.findMany({
    where: { tenantId: TENANT_ID, providerId: MS_PROVIDER_ID, isDeleted: false },
    orderBy: { receivedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      subject: true,
      from: true,
      to: true,
      receivedAt: true,
    },
  });

  console.log('\n📧 Microsoft (last 5 emails):');
  msEmails.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.subject?.substring(0, 50)}`);
    console.log(`     From: ${e.from}`);
    console.log(`     To: ${JSON.stringify(e.to)}`);
    console.log(`     Date: ${e.receivedAt}`);
  });

  return { googleEmails, msEmails };
}

async function checkCrossProviderEmails() {
  console.log('\n=== CROSS-PROVIDER EMAIL CHECK ===\n');

  // Find emails from Google to Microsoft email address
  const googleToMs = await prisma.email.findMany({
    where: {
      tenantId: TENANT_ID,
      providerId: GOOGLE_PROVIDER_ID,
      isDeleted: false,
      OR: [
        { to: { has: MS_EMAIL } },
        { from: { contains: MS_EMAIL } },
      ],
    },
    orderBy: { receivedAt: 'desc' },
    take: 5,
    select: {
      subject: true,
      from: true,
      to: true,
      receivedAt: true,
    },
  });

  console.log(`📨 Google emails involving ${MS_EMAIL}: ${googleToMs.length}`);
  googleToMs.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.subject?.substring(0, 40)}`);
    console.log(`     From: ${e.from} -> To: ${JSON.stringify(e.to)}`);
  });

  // Find emails from Microsoft to Google email address
  const msToGoogle = await prisma.email.findMany({
    where: {
      tenantId: TENANT_ID,
      providerId: MS_PROVIDER_ID,
      isDeleted: false,
      OR: [
        { to: { has: GOOGLE_EMAIL } },
        { from: { contains: GOOGLE_EMAIL } },
      ],
    },
    orderBy: { receivedAt: 'desc' },
    take: 5,
    select: {
      subject: true,
      from: true,
      to: true,
      receivedAt: true,
    },
  });

  console.log(`\n📨 Microsoft emails involving ${GOOGLE_EMAIL}: ${msToGoogle.length}`);
  msToGoogle.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.subject?.substring(0, 40)}`);
    console.log(`     From: ${e.from} -> To: ${JSON.stringify(e.to)}`);
  });
}

async function runTests() {
  console.log('🚀 Direct Provider Check...\n');
  console.log('='.repeat(60));

  try {
    await getProviderTokens();
    await checkRecentEmails();
    await checkCrossProviderEmails();

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Check completed!');
    console.log('\n⚠️ To send emails, use the frontend or get a fresh JWT token.');
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
