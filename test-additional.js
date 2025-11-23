/**
 * Additional WebSocket Tests
 * - Move to Archive
 * - Delete email
 * - Trigger sync for INBOUND
 */
const axios = require('axios');

const BACKEND_URL = 'http://localhost:3000';
const TOKEN = process.argv[2];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAdditionalTests() {
  const client = axios.create({
    baseURL: BACKEND_URL,
    headers: { Authorization: `Bearer ${TOKEN}` }
  });

  log('\n🧪 Additional WebSocket Tests', 'cyan');
  log('='.repeat(80), 'cyan');

  try {
    // Get emails for testing
    log('\n[Test 3] Fetching emails for MOVE test...', 'cyan');
    const emailsResp = await client.get('/emails', { params: { limit: 5 } });
    const emails = emailsResp.data.emails || [];

    if (emails.length < 2) {
      log('⚠️  Not enough emails for testing. Need at least 2 emails.', 'yellow');
      return;
    }

    log(`✅ Found ${emails.length} emails`, 'green');

    // Test 3: Move to Archive
    const moveEmail = emails.find(e => e.folder === 'INBOX');
    if (moveEmail) {
      log(`\n[Test 3] MOVE TO ARCHIVE: ${moveEmail.id}`, 'cyan');
      log(`  Subject: ${moveEmail.subject}`, 'reset');

      try {
        await client.patch(`/emails/${moveEmail.id}`, { folder: 'Archive' });
        log('✅ Move API call successful', 'green');
        log('   Waiting 2s for WebSocket events...', 'yellow');
        await sleep(2000);
        log('✅ Check main test output for email:update and folder_counts events', 'green');
      } catch (error) {
        log(`⚠️  Move failed: ${error.response?.data?.message || error.message}`, 'yellow');
        log('   Archive folder may not exist, trying Trash...', 'yellow');

        try {
          await client.patch(`/emails/${moveEmail.id}`, { folder: 'Trash' });
          log('✅ Move to Trash successful', 'green');
          await sleep(2000);
        } catch (e) {
          log(`❌ Move to Trash also failed: ${e.message}`, 'red');
        }
      }
    } else {
      log('⚠️  No email in INBOX to move', 'yellow');
    }

    // Test 4: Delete
    const deleteEmail = emails.find(e => e.folder === 'Trash' || e.id !== moveEmail?.id);
    if (deleteEmail) {
      log(`\n[Test 4] DELETE EMAIL: ${deleteEmail.id}`, 'cyan');
      log(`  Subject: ${deleteEmail.subject}`, 'reset');

      try {
        await client.delete(`/emails/${deleteEmail.id}`);
        log('✅ Delete API call successful', 'green');
        log('   Waiting 2s for WebSocket events...', 'yellow');
        await sleep(2000);
        log('✅ Check main test output for email:delete event', 'green');
      } catch (error) {
        log(`❌ Delete failed: ${error.response?.data?.message || error.message}`, 'red');
      }
    } else {
      log('⚠️  No email available for delete test', 'yellow');
    }

    // Test 5: Trigger Sync for INBOUND
    log('\n[Test 5] TRIGGER SYNC (INBOUND test)', 'cyan');

    const providersResp = await client.get('/providers');
    const providers = providersResp.data;

    if (providers.length > 0) {
      const provider = providers[0];
      log(`  Triggering sync for: ${provider.email}`, 'reset');

      try {
        await client.post(`/sync/${provider.id}`, { syncType: 'incremental' });
        log('✅ Sync triggered successfully', 'green');
        log('   Waiting 10s for new emails to arrive...', 'yellow');
        await sleep(10000);
        log('✅ Check main test output for email:new events', 'green');
        log('   If you recently received emails, they should appear!', 'green');
      } catch (error) {
        log(`⚠️  Sync trigger failed: ${error.response?.data?.message || error.message}`, 'yellow');
      }
    }

    // Summary
    log('\n' + '='.repeat(80), 'cyan');
    log('✅ Additional tests completed!', 'green');
    log('\nCheck the main test output for all WebSocket events.', 'cyan');
    log('The main test is still listening for events.\n', 'cyan');

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Error: ${JSON.stringify(error.response.data)}`, 'red');
    }
  }
}

if (!process.argv[2]) {
  console.error('Usage: node test-additional.js <JWT_TOKEN>');
  process.exit(1);
}

runAdditionalTests().catch(console.error);
