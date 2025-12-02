/**
 * Bidirectional Email Send Test
 * Sends test emails from Google -> Microsoft and Microsoft -> Google
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWkzMjFsM3MwMDAxeWh1a3g3bzhranVsIiwiZW1haWwiOiJkdmRtYXJjaGV0dG9AZ21haWwuY29tIiwiaWF0IjoxNzMzMTQyMDgxLCJleHAiOjE3MzMyMjg0ODF9.p70l3RGqL43WJKfgMUB_oH5h_3xU4x1nYgqSaSLI_cc';

const GOOGLE_PROVIDER_ID = 'cmi7m1nod0007yhj4lawfkjww';
const MS_PROVIDER_ID = 'cmi7m4qz907ydyhj4vwqdbnj5';

const GOOGLE_EMAIL = 'dvdmarchetto@gmail.com';
const MS_EMAIL = 'chetto983@hotmail.it';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function sendEmail(
  providerId: string,
  from: string,
  to: string,
  subject: string,
  body: string
) {
  console.log(`\n📤 Sending email from ${from} to ${to}...`);
  console.log(`   Subject: ${subject}`);

  try {
    const response = await api.post('/emails/send', {
      providerId,
      to: [to],
      subject,
      body,
      bodyHtml: `<html><body><p>${body}</p></body></html>`,
    });

    console.log(`✅ Email sent successfully!`);
    console.log(`   Email ID: ${response.data.id || response.data.emailId || 'N/A'}`);
    return response.data;
  } catch (error: any) {
    console.error(`❌ Failed to send email:`, error.response?.data || error.message);
    return null;
  }
}

async function triggerSync(providerId: string, providerName: string) {
  console.log(`\n🔄 Triggering sync for ${providerName}...`);

  try {
    const response = await api.post(`/email-sync/sync/${providerId}`);
    console.log(`✅ Sync triggered: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error: any) {
    console.error(`❌ Sync failed:`, error.response?.data || error.message);
    return null;
  }
}

async function checkInbox(providerId: string, providerName: string) {
  console.log(`\n📬 Checking inbox for ${providerName}...`);

  try {
    const response = await api.get('/emails', {
      params: { providerId, limit: 5 },
    });

    const emails = response.data.emails || [];
    console.log(`✅ Found ${emails.length} recent emails:`);
    emails.forEach((e: any, i: number) => {
      console.log(`   ${i + 1}. ${e.subject?.substring(0, 50)} (from: ${e.from})`);
    });
    return emails;
  } catch (error: any) {
    console.error(`❌ Failed to check inbox:`, error.response?.data || error.message);
    return [];
  }
}

async function runBidirectionalTest() {
  const timestamp = new Date().toISOString();

  console.log('🚀 Starting Bidirectional Email Send Test...\n');
  console.log('='.repeat(60));

  // Test 1: Google -> Microsoft
  console.log('\n\n=== TEST 1: GOOGLE -> MICROSOFT ===');
  const googleToMs = await sendEmail(
    GOOGLE_PROVIDER_ID,
    GOOGLE_EMAIL,
    MS_EMAIL,
    `Test Google->MS ${timestamp}`,
    `This is a test email sent from Google (${GOOGLE_EMAIL}) to Microsoft (${MS_EMAIL}) at ${timestamp}`
  );

  // Wait a bit for the email to be processed
  console.log('\n⏳ Waiting 3 seconds for email to be processed...');
  await new Promise((r) => setTimeout(r, 3000));

  // Trigger Microsoft sync to receive the email
  await triggerSync(MS_PROVIDER_ID, 'Microsoft');

  // Wait for sync
  console.log('\n⏳ Waiting 5 seconds for sync to complete...');
  await new Promise((r) => setTimeout(r, 5000));

  // Check Microsoft inbox
  await checkInbox(MS_PROVIDER_ID, 'Microsoft');

  // Test 2: Microsoft -> Google
  console.log('\n\n=== TEST 2: MICROSOFT -> GOOGLE ===');
  const msToGoogle = await sendEmail(
    MS_PROVIDER_ID,
    MS_EMAIL,
    GOOGLE_EMAIL,
    `Test MS->Google ${timestamp}`,
    `This is a test email sent from Microsoft (${MS_EMAIL}) to Google (${GOOGLE_EMAIL}) at ${timestamp}`
  );

  // Wait a bit for the email to be processed
  console.log('\n⏳ Waiting 3 seconds for email to be processed...');
  await new Promise((r) => setTimeout(r, 3000));

  // Trigger Google sync to receive the email
  await triggerSync(GOOGLE_PROVIDER_ID, 'Google');

  // Wait for sync
  console.log('\n⏳ Waiting 5 seconds for sync to complete...');
  await new Promise((r) => setTimeout(r, 5000));

  // Check Google inbox
  await checkInbox(GOOGLE_PROVIDER_ID, 'Google');

  console.log('\n\n' + '='.repeat(60));
  console.log('🏁 Bidirectional test completed!');
  console.log('\nSummary:');
  console.log(`  Google -> Microsoft: ${googleToMs ? '✅ Sent' : '❌ Failed'}`);
  console.log(`  Microsoft -> Google: ${msToGoogle ? '✅ Sent' : '❌ Failed'}`);
}

runBidirectionalTest().catch(console.error);
