/**
 * Label WebSocket Bidirectional Test
 * Tests:
 * 1. Create label
 * 2. Add label to email (OUTBOUND - should trigger email:update event)
 * 3. Remove label from email (OUTBOUND - should trigger email:update event)
 * 4. Update label
 * 5. Delete label
 */
const axios = require('axios');
const io = require('socket.io-client');

const BACKEND_URL = 'http://localhost:3000';
const TOKEN = process.argv[2];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runLabelTests() {
  const client = axios.create({
    baseURL: BACKEND_URL,
    headers: { Authorization: `Bearer ${TOKEN}` }
  });

  log('\n' + '='.repeat(80), 'bold');
  log('🏷️  Label WebSocket Bidirectional Test', 'bold');
  log('='.repeat(80) + '\n', 'bold');

  let socket;
  let eventsReceived = [];
  let createdLabelId;
  let testEmailId;

  try {
    // Step 1: Check backend health
    log('[Step 1] Checking backend health...', 'cyan');
    await client.get('/health');
    log('✅ Backend is running\n', 'green');

    // Step 2: Connect WebSocket
    log('[Step 2] Connecting to WebSocket...', 'cyan');
    socket = io(`${BACKEND_URL}/realtime`, {
      auth: { token: TOKEN },
      transports: ['websocket']
    });

    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        log('✅ WebSocket connected!\n', 'green');
        resolve();
      });
      socket.on('connect_error', (error) => {
        log(`❌ WebSocket connection failed: ${error.message}`, 'red');
        reject(error);
      });
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Step 3: Register event listeners
    log('[Step 3] Registering event listeners...', 'cyan');

    socket.on('email:update', (data) => {
      if (data.reason === 'labels-updated') {
        eventsReceived.push({ type: 'email:update', data, timestamp: new Date().toISOString() });
        log('\n📨 Event received: email:update (labels-updated)', 'magenta');
        log(`   Time: ${new Date().toISOString()}`, 'reset');
        log(`   Email ID: ${data.emailId}`, 'reset');
        log(`   Labels count: ${data.email?.emailLabels?.length || 0}`, 'reset');
        log(`   Data: ${JSON.stringify(data, null, 2)}`, 'reset');
      }
    });

    log('✅ Event listeners registered\n', 'green');

    // Step 4: Get existing labels
    log('[Step 4] Fetching existing labels...', 'cyan');
    const labelsResp = await client.get('/labels');
    const existingLabels = labelsResp.data.labels || [];
    log(`✅ Found ${existingLabels.length} existing label(s)\n`, 'green');

    // Step 5: Get test email
    log('[Step 5] Fetching test email...', 'cyan');
    const emailsResp = await client.get('/emails', { params: { limit: 1 } });
    const emails = emailsResp.data.emails || [];

    if (emails.length === 0) {
      log('❌ No emails found for testing', 'red');
      return;
    }

    testEmailId = emails[0].id;
    log(`✅ Found test email: ${testEmailId}`, 'green');
    log(`   Subject: ${emails[0].subject}`, 'reset');
    log(`   Current labels: ${emails[0].emailLabels?.length || 0}\n`, 'reset');

    // Step 6: Create new label
    log('[Step 6] OUTBOUND - Creating new label...', 'cyan');
    const createResp = await client.post('/labels', {
      name: `Test Label ${Date.now()}`,
      color: { hex: '#FF5722', name: 'deep-orange' },
      icon: 'tag'
    });

    createdLabelId = createResp.data.label.id;
    log('✅ Label created successfully', 'green');
    log(`   ID: ${createdLabelId}`, 'reset');
    log(`   Name: ${createResp.data.label.name}`, 'reset');
    log(`   Color: ${JSON.stringify(createResp.data.label.color)}\n`, 'reset');

    // Step 7: Add label to email
    log('[Step 7] OUTBOUND - Adding label to email...', 'cyan');
    log(`   Label ID: ${createdLabelId}`, 'reset');
    log(`   Email ID: ${testEmailId}`, 'reset');

    await client.post(`/labels/${createdLabelId}/emails`, {
      emailIds: [testEmailId]
    });

    log('✅ API call successful', 'green');
    log('   Waiting 5s for WebSocket event (buffer delay)...', 'yellow');
    await sleep(5000);

    const addEvent = eventsReceived.find(e =>
      e.type === 'email:update' &&
      e.data.emailId === testEmailId &&
      e.data.reason === 'labels-updated'
    );

    if (addEvent) {
      log('✅ Received email:update event for label addition!', 'green');
      log('   OUTBOUND flow working correctly! ✓\n', 'green');
    } else {
      log('⚠️  Did not receive expected email:update event', 'yellow');
    }

    // Step 8: Update label
    log('[Step 8] OUTBOUND - Updating label...', 'cyan');
    await client.put(`/labels/${createdLabelId}`, {
      name: `Updated Label ${Date.now()}`,
      color: { hex: '#2196F3', name: 'blue' }
    });

    log('✅ Label updated successfully\n', 'green');

    // Step 9: Remove label from email
    log('[Step 9] OUTBOUND - Removing label from email...', 'cyan');
    const eventCountBefore = eventsReceived.length;

    await client.delete(`/labels/${createdLabelId}/emails/${testEmailId}`);

    log('✅ API call successful', 'green');
    log('   Waiting 5s for WebSocket event (buffer delay)...', 'yellow');
    await sleep(5000);

    const removeEvent = eventsReceived.slice(eventCountBefore).find(e =>
      e.type === 'email:update' &&
      e.data.emailId === testEmailId &&
      e.data.reason === 'labels-updated'
    );

    if (removeEvent) {
      log('✅ Received email:update event for label removal!', 'green');
      log('   OUTBOUND flow working correctly! ✓\n', 'green');
    } else {
      log('⚠️  Did not receive expected email:update event', 'yellow');
    }

    // Step 10: Delete label
    log('[Step 10] OUTBOUND - Deleting label...', 'cyan');
    await client.delete(`/labels/${createdLabelId}`);
    log('✅ Label deleted successfully\n', 'green');

    // Summary
    log('='.repeat(80), 'cyan');
    log('✅ Label Tests Completed!', 'green');
    log('='.repeat(80) + '\n', 'cyan');

    log('📊 Test Summary:', 'bold');
    log(`   Total events received: ${eventsReceived.length}`, 'reset');
    log(`   Label created: ✅`, 'green');
    log(`   Label added to email: ${addEvent ? '✅' : '⚠️'}`, addEvent ? 'green' : 'yellow');
    log(`   Label removed from email: ${removeEvent ? '✅' : '⚠️'}`, removeEvent ? 'green' : 'yellow');
    log(`   Label updated: ✅`, 'green');
    log(`   Label deleted: ✅`, 'green');

    log('\n📨 Events Timeline:', 'bold');
    eventsReceived.forEach((event, i) => {
      log(`   ${i + 1}. [${event.timestamp}] ${event.type} - ${event.data.reason}`, 'reset');
    });

    if (eventsReceived.length >= 2) {
      log('\n✅ WebSocket bidirectional flow for labels: WORKING! 🚀', 'green');
    } else {
      log('\n⚠️  Expected 2 events (add + remove), received: ' + eventsReceived.length, 'yellow');
    }

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Error: ${JSON.stringify(error.response.data)}`, 'red');
    }
    console.error(error);
  } finally {
    if (socket) {
      socket.close();
      log('\n🔌 WebSocket disconnected', 'cyan');
    }
  }
}

if (!process.argv[2]) {
  console.error('Usage: node test-labels.js <JWT_TOKEN>');
  console.error('\nTo get a JWT token:');
  console.error('  node get-test-token.js');
  process.exit(1);
}

runLabelTests().catch(console.error);
