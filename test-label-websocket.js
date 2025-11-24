/**
 * Test script to verify label WebSocket emissions
 *
 * This script:
 * 1. Connects to the database
 * 2. Adds a label to an email via API
 * 3. Checks if the label was saved in the database
 * 4. Listens for WebSocket events
 */

const { io } = require('socket.io-client');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const BACKEND_URL = 'http://localhost:3000';

// Replace with your actual auth token
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-token-here';

async function main() {
  console.log('🔍 Testing Label WebSocket Emissions\n');

  try {
    // 1. Get a test email from database
    console.log('1️⃣  Finding a test email...');
    const testEmail = await prisma.email.findFirst({
      where: {
        isDeleted: false,
      },
      include: {
        emailLabels: {
          include: {
            label: true,
          },
        },
      },
    });

    if (!testEmail) {
      console.error('❌ No test email found in database');
      return;
    }

    console.log(`   ✅ Found email: ${testEmail.id}`);
    console.log(`   📧 Subject: ${testEmail.subject}`);
    console.log(`   🏷️  Current labels: ${testEmail.emailLabels.length}`);
    testEmail.emailLabels.forEach(el => {
      console.log(`      - ${el.label.name} (${el.label.id})`);
    });

    // 2. Get or create a test label
    console.log('\n2️⃣  Finding or creating test label...');
    let testLabel = await prisma.userLabel.findFirst({
      where: {
        tenantId: testEmail.tenantId,
        name: 'TEST_WEBSOCKET',
      },
    });

    if (!testLabel) {
      testLabel = await prisma.userLabel.create({
        data: {
          tenantId: testEmail.tenantId,
          name: 'TEST_WEBSOCKET',
          color: {
            backgroundColor: '#FF0000',
            textColor: '#FFFFFF',
          },
        },
      });
      console.log(`   ✅ Created test label: ${testLabel.id}`);
    } else {
      console.log(`   ✅ Found existing test label: ${testLabel.id}`);
    }

    // 3. Connect to WebSocket and listen for events
    console.log('\n3️⃣  Connecting to WebSocket...');
    const socket = io(`${BACKEND_URL}/realtime`, {
      auth: {
        token: AUTH_TOKEN,
      },
      transports: ['websocket', 'polling'],
    });

    let receivedEvent = false;

    socket.on('connect', () => {
      console.log('   ✅ WebSocket connected');
    });

    socket.on('connected', (data) => {
      console.log('   ✅ Realtime service connected:', data);
    });

    socket.on('email:update', (data) => {
      console.log('\n📨 Received email:update event:');
      console.log('   Reason:', data.reason);
      console.log('   Email ID:', data.emailId);
      console.log('   Provider ID:', data.providerId);

      if (data.email) {
        console.log('   Email object received:', {
          id: data.email.id,
          subject: data.email.subject,
          emailLabelsCount: data.email.emailLabels?.length || 0,
        });

        if (data.email.emailLabels) {
          console.log('   📊 Email labels in WebSocket payload:');
          data.email.emailLabels.forEach(el => {
            console.log(`      - ${el.label.name} (${el.label.id})`);
          });
        } else {
          console.log('   ⚠️  WARNING: emailLabels field is missing in WebSocket payload!');
        }
      } else {
        console.log('   ⚠️  WARNING: email object is missing in WebSocket payload!');
      }

      if (data.emailId === testEmail.id && data.reason === 'labels-updated') {
        receivedEvent = true;
        console.log('\n   ✅ Received correct label update event for test email!');
      }
    });

    socket.on('connect_error', (error) => {
      console.error('   ❌ WebSocket connection error:', error.message);
    });

    socket.on('error', (error) => {
      console.error('   ❌ WebSocket error:', error);
    });

    // Wait for WebSocket to connect
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Check if label is already on the email
    console.log('\n4️⃣  Checking current email-label associations...');
    const existingAssociation = await prisma.emailLabel.findFirst({
      where: {
        emailId: testEmail.id,
        labelId: testLabel.id,
      },
    });

    if (existingAssociation) {
      console.log('   ⚠️  Label already associated, removing first...');
      await prisma.emailLabel.delete({
        where: {
          id: existingAssociation.id,
        },
      });
      console.log('   ✅ Removed existing association');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 5. Add label via Prisma (simulating the bulkAddLabels operation)
    console.log('\n5️⃣  Adding label to email (simulating bulkAddLabels)...');

    const emailLabelData = {
      emailId: testEmail.id,
      labelId: testLabel.id,
      tenantId: testEmail.tenantId,
    };

    const createResult = await prisma.emailLabel.create({
      data: emailLabelData,
    });

    console.log(`   ✅ Label added to database: ${createResult.id}`);

    // 6. Verify in database
    console.log('\n6️⃣  Verifying in database...');
    const updatedEmail = await prisma.email.findUnique({
      where: {
        id: testEmail.id,
      },
      include: {
        emailLabels: {
          include: {
            label: true,
          },
        },
      },
    });

    console.log(`   ✅ Email now has ${updatedEmail.emailLabels.length} label(s):`);
    updatedEmail.emailLabels.forEach(el => {
      console.log(`      - ${el.label.name} (${el.label.id})`);
    });

    // 7. Manually emit WebSocket event (simulating what bulkAddLabels should do)
    console.log('\n7️⃣  Note: WebSocket emission should happen automatically in bulkAddLabels service method');
    console.log('   Waiting 3 seconds to see if WebSocket event is received...');

    await new Promise(resolve => setTimeout(resolve, 3000));

    if (!receivedEvent) {
      console.log('\n⚠️  WARNING: No WebSocket event received!');
      console.log('   This means either:');
      console.log('   1. The bulkAddLabels method is not emitting WebSocket events');
      console.log('   2. The WebSocket is not properly connected');
      console.log('   3. The event is being emitted but not received by this client');
    }

    // Cleanup
    console.log('\n8️⃣  Cleaning up...');
    socket.disconnect();

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
