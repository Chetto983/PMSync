/**
 * WebSocket Bidirectional Test - Simplified Version
 *
 * Prerequisites:
 * 1. Backend deve essere in esecuzione: cd backend && npm run start:dev
 * 2. Database deve essere accessibile
 * 3. Almeno 1 provider configurato
 *
 * Usage:
 *   node test-websocket.js <JWT_TOKEN>
 *
 * Per ottenere il JWT token:
 * 1. Apri il frontend (http://localhost:3001)
 * 2. Login
 * 3. DevTools > Application > Local Storage > copia il valore di "token"
 * 4. Esegui: node test-websocket.js "your-token-here"
 */

const { io } = require('socket.io-client');
const axios = require('axios');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const JWT_TOKEN = process.argv[2];

// Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main test
async function runTest() {
  log('\n' + '='.repeat(80), 'bright');
  log('🚀 WebSocket Bidirectional Email Test', 'bright');
  log('='.repeat(80) + '\n', 'bright');

  if (!JWT_TOKEN) {
    log('❌ Error: JWT Token not provided', 'red');
    log('\nUsage: node test-websocket.js "<your-jwt-token>"', 'yellow');
    log('\nHow to get JWT token:', 'cyan');
    log('1. Open http://localhost:3001', 'reset');
    log('2. Login to your account', 'reset');
    log('3. Open DevTools (F12)', 'reset');
    log('4. Go to Application > Local Storage', 'reset');
    log('5. Copy the value of "token"', 'reset');
    log('6. Run: node test-websocket.js "paste-token-here"\n', 'reset');
    process.exit(1);
  }

  log('ℹ️  Backend URL: ' + BACKEND_URL, 'blue');
  log('ℹ️  Token: ' + JWT_TOKEN.substring(0, 20) + '...', 'blue');
  log('');

  // Step 1: Check backend
  log('[Step 1] Checking backend health...', 'cyan');
  try {
    const healthResponse = await axios.get(`${BACKEND_URL}/health`, { timeout: 5000 });
    log('✅ Backend is running', 'green');
  } catch (error) {
    log('❌ Backend is NOT running or not accessible', 'red');
    log('   Please start backend: cd backend && npm run start:dev', 'yellow');
    process.exit(1);
  }

  // Step 2: Check providers
  log('\n[Step 2] Fetching email providers...', 'cyan');
  let providers = [];
  try {
    const response = await axios.get(`${BACKEND_URL}/providers`, {
      headers: { Authorization: `Bearer ${JWT_TOKEN}` }
    });
    providers = response.data;
    log(`✅ Found ${providers.length} provider(s)`, 'green');
    providers.forEach((p, i) => {
      log(`   ${i + 1}. ${p.email} (${p.type}) [${p.id}]`, 'reset');
    });

    if (providers.length === 0) {
      log('⚠️  No providers configured. Please add at least one email provider.', 'yellow');
      process.exit(1);
    }
  } catch (error) {
    log('❌ Failed to fetch providers', 'red');
    log('   Error: ' + (error.response?.data?.message || error.message), 'red');
    if (error.response?.status === 401) {
      log('   Token may be expired or invalid', 'yellow');
    }
    process.exit(1);
  }

  // Step 3: Connect WebSocket
  log('\n[Step 3] Connecting to WebSocket...', 'cyan');
  const socket = io(`${BACKEND_URL}/realtime`, {
    auth: { token: JWT_TOKEN },
    transports: ['websocket', 'polling']
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WebSocket connection timeout'));
    }, 10000);

    socket.on('connected', (data) => {
      clearTimeout(timeout);
      log('✅ WebSocket connected!', 'green');
      log(`   User ID: ${data.userId}`, 'reset');
      log(`   Tenant ID: ${data.tenantId}`, 'reset');
      log(`   Email: ${data.email}`, 'reset');
      resolve();
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  // Step 4: Register event listeners
  log('\n[Step 4] Registering event listeners...', 'cyan');
  const receivedEvents = [];

  const eventTypes = [
    'email:new',
    'email:update',
    'email:delete',
    'email:unread_count_update',
    'email:folder_counts_update',
    'sync:status',
  ];

  eventTypes.forEach(eventType => {
    socket.on(eventType, (data) => {
      const timestamp = new Date().toISOString();
      receivedEvents.push({ eventType, data, timestamp });
      log(`\n📨 Event received: ${eventType}`, 'magenta');
      log(`   Time: ${timestamp}`, 'reset');
      log(`   Data: ${JSON.stringify(data, null, 2)}`, 'reset');
    });
  });

  log('✅ Event listeners registered', 'green');
  log('   Listening for: ' + eventTypes.join(', '), 'reset');

  // Step 5: Fetch an email to test
  log('\n[Step 5] Fetching emails for testing...', 'cyan');
  let testEmail = null;

  try {
    const response = await axios.get(`${BACKEND_URL}/emails`, {
      headers: { Authorization: `Bearer ${JWT_TOKEN}` },
      params: { limit: 1, providerId: providers[0].id }
    });

    if (response.data.emails && response.data.emails.length > 0) {
      testEmail = response.data.emails[0];
      log('✅ Found test email', 'green');
      log(`   ID: ${testEmail.id}`, 'reset');
      log(`   Subject: ${testEmail.subject}`, 'reset');
      log(`   From: ${testEmail.from}`, 'reset');
      log(`   Read: ${testEmail.isRead}`, 'reset');
      log(`   Starred: ${testEmail.isStarred}`, 'reset');
    } else {
      log('⚠️  No emails found. Send yourself a test email first.', 'yellow');
    }
  } catch (error) {
    log('❌ Failed to fetch emails', 'red');
    log('   Error: ' + (error.response?.data?.message || error.message), 'red');
  }

  // Step 6: Test OUTBOUND flow (if email available)
  if (testEmail) {
    log('\n[Step 6] Testing OUTBOUND flow (Mark as Read)...', 'cyan');
    log(`   Marking email ${testEmail.id} as read...`, 'reset');

    try {
      await axios.patch(
        `${BACKEND_URL}/emails/${testEmail.id}`,
        { isRead: true },
        { headers: { Authorization: `Bearer ${JWT_TOKEN}` } }
      );

      log('✅ API call successful', 'green');
      log('   Waiting for WebSocket event...', 'yellow');

      await sleep(2000);

      const updateEvents = receivedEvents.filter(e =>
        e.eventType === 'email:update' && e.data.emailId === testEmail.id
      );

      if (updateEvents.length > 0) {
        log('✅ Received email:update event!', 'green');
        log('   OUTBOUND flow working correctly! ✓', 'green');
      } else {
        log('⚠️  No email:update event received yet', 'yellow');
        log('   This may indicate a problem with event emission', 'yellow');
      }

      // Test starring
      log('\n   Marking email as starred...', 'reset');
      await axios.patch(
        `${BACKEND_URL}/emails/${testEmail.id}`,
        { isStarred: true },
        { headers: { Authorization: `Bearer ${JWT_TOKEN}` } }
      );

      log('✅ API call successful', 'green');
      await sleep(2000);

      const starEvents = receivedEvents.filter(e =>
        e.eventType === 'email:update' &&
        e.data.emailId === testEmail.id &&
        e.timestamp > updateEvents[0]?.timestamp
      );

      if (starEvents.length > 0) {
        log('✅ Received second email:update event!', 'green');
      }

    } catch (error) {
      log('❌ OUTBOUND test failed', 'red');
      log('   Error: ' + (error.response?.data?.message || error.message), 'red');
    }
  } else {
    log('\n[Step 6] Skipping OUTBOUND test (no emails available)', 'yellow');
  }

  // Step 7: Monitor for INBOUND events
  log('\n[Step 7] Monitoring for INBOUND events...', 'cyan');
  log('   🔔 Listening for incoming emails...', 'yellow');
  log('   📧 Send yourself a test email to see it appear in realtime!', 'bright');
  log('', 'reset');
  log(`   To: ${providers[0].email}`, 'reset');
  log('   Subject: Test Email - Realtime Sync', 'reset');
  log('   Body: Testing WebSocket bidirectional flow', 'reset');
  log('', 'reset');
  log('   Press Ctrl+C to stop monitoring\n', 'yellow');

  // Keep connection open
  process.on('SIGINT', () => {
    log('\n\n📊 Test Summary:', 'bright');
    log('='.repeat(80), 'bright');
    log(`Total events received: ${receivedEvents.length}`, 'cyan');

    if (receivedEvents.length > 0) {
      const eventCounts = {};
      receivedEvents.forEach(e => {
        eventCounts[e.eventType] = (eventCounts[e.eventType] || 0) + 1;
      });

      log('\nEvents breakdown:', 'cyan');
      Object.entries(eventCounts).forEach(([type, count]) => {
        log(`  ${type}: ${count}`, 'reset');
      });

      log('\n✅ WebSocket is working correctly!', 'green');
      log('   INBOUND: ✓ (if you received email:new events)', 'green');
      log('   OUTBOUND: ✓ (if you received email:update events)', 'green');
    } else {
      log('\n⚠️  No events received during test', 'yellow');
      log('   Possible issues:', 'yellow');
      log('   - No email activity during monitoring', 'reset');
      log('   - Events not being emitted from backend', 'reset');
      log('   - WebSocket connection issues', 'reset');
    }

    log('='.repeat(80), 'bright');
    socket.disconnect();
    process.exit(0);
  });
}

// Run test
runTest().catch(error => {
  log('\n❌ Test failed:', 'red');
  console.error(error);
  process.exit(1);
});
