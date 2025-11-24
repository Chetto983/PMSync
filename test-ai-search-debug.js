/**
 * AI Search Diagnostic Script
 * Tests AI search functionality and diagnoses issues
 */

const fetch = require('node-fetch');

// Configuration
const API_BASE = 'http://localhost:3000';
const TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Get from browser localStorage

// Tenant info
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';
const USER_EMAIL = 'dvdmarchetto@gmail.com';

console.log('='.repeat(70));
console.log('  AI Search Diagnostic Tool');
console.log('='.repeat(70));
console.log(`  Tenant ID: ${TENANT_ID}`);
console.log(`  User Email: ${USER_EMAIL}`);
console.log('='.repeat(70));

// Helper function
async function makeRequest(method, endpoint, body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const url = `${API_BASE}${endpoint}`;
  console.log(`\n${method} ${url}`);
  if (body) {
    console.log('Body:', JSON.stringify(body, null, 2));
  }

  const response = await fetch(url, options);
  const text = await response.text();

  console.log(`Status: ${response.status} ${response.statusText}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.log('Response (raw):', text.substring(0, 500));
    throw new Error('Invalid JSON response');
  }

  return { status: response.status, data };
}

async function runDiagnostics() {
  if (TOKEN === 'YOUR_JWT_TOKEN_HERE') {
    console.error('\n❌ Error: Please update the TOKEN constant with a valid JWT token');
    console.log('\n📋 How to get your token:');
    console.log('   1. Open DevTools (F12) in your browser');
    console.log('   2. Go to Application → Local Storage');
    console.log('   3. Find key "auth-storage"');
    console.log('   4. Copy the "token" value from the JSON');
    process.exit(1);
  }

  try {
    // Step 1: Check if knowledge base endpoint exists
    console.log('\n' + '─'.repeat(70));
    console.log('Step 1: Testing Knowledge Base Search Endpoint');
    console.log('─'.repeat(70));

    try {
      const result = await makeRequest('POST', '/ai/memory/search', {
        query: 'test',
        limit: 5,
      });

      if (result.status === 200) {
        console.log('✅ Knowledge base endpoint is accessible');
        console.log(`   Found ${result.data.items?.length || 0} results for test query`);
        console.log(`   Used query: "${result.data.usedQuery}"`);

        if (result.data.items && result.data.items.length > 0) {
          console.log('\n   Sample result:');
          const item = result.data.items[0];
          console.log(`   - Subject: ${item.subject || 'N/A'}`);
          console.log(`   - From: ${item.from || 'N/A'}`);
          console.log(`   - Score: ${item.score || 'N/A'}`);
          console.log(`   - Email ID: ${item.emailId || 'N/A'}`);
        } else {
          console.log('⚠️  No results found - knowledge base might be empty');
        }
      } else {
        console.log(`❌ Unexpected status: ${result.status}`);
        console.log('   Response:', JSON.stringify(result.data, null, 2));
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      if (error.message.includes('404')) {
        console.log('   The /ai/memory/search endpoint does not exist');
      } else if (error.message.includes('401') || error.message.includes('403')) {
        console.log('   Authentication/authorization error - check your token');
      }
    }

    // Step 2: Check embeddings count
    console.log('\n' + '─'.repeat(70));
    console.log('Step 2: Checking Knowledge Base Embeddings');
    console.log('─'.repeat(70));

    try {
      const result = await makeRequest('GET', '/ai/knowledge-base/embeddings?limit=1');

      if (result.status === 200) {
        const total = result.data.pagination?.total || 0;
        console.log(`✅ Embeddings endpoint accessible`);
        console.log(`   Total embeddings: ${total}`);

        if (total === 0) {
          console.log('\n⚠️  WARNING: No embeddings found!');
          console.log('   Your knowledge base is empty. You need to:');
          console.log('   1. Generate embeddings for your emails');
          console.log('   2. Run: POST /ai/knowledge-base/emails/backfill');
        } else {
          console.log(`✅ Knowledge base has ${total} embeddings`);
        }
      } else if (result.status === 403) {
        console.log('⚠️  Admin access required for this endpoint');
        console.log('   Skipping embeddings check');
      } else {
        console.log(`❌ Unexpected status: ${result.status}`);
      }
    } catch (error) {
      console.log(`⚠️  Could not check embeddings: ${error.message}`);
    }

    // Step 3: Test with specific queries
    console.log('\n' + '─'.repeat(70));
    console.log('Step 3: Testing Various Search Queries');
    console.log('─'.repeat(70));

    const testQueries = [
      'email',
      'message',
      'test',
      'urgent',
      'important',
    ];

    for (const query of testQueries) {
      try {
        const result = await makeRequest('POST', '/ai/memory/search', {
          query,
          limit: 3,
        });

        const count = result.data.items?.length || 0;
        console.log(`\n   Query: "${query}"`);
        console.log(`   Results: ${count}`);

        if (count > 0) {
          console.log(`   Top result: ${result.data.items[0].subject || '(no subject)'}`);
        }
      } catch (error) {
        console.log(`\n   Query: "${query}"`);
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    // Step 4: Check email count
    console.log('\n' + '─'.repeat(70));
    console.log('Step 4: Checking Email Count');
    console.log('─'.repeat(70));

    try {
      const result = await makeRequest('GET', '/emails?limit=1');

      if (result.status === 200) {
        const total = result.data.pagination?.total || 0;
        console.log(`✅ You have ${total} total emails`);

        if (total === 0) {
          console.log('⚠️  No emails found - sync your email providers first');
        }
      }
    } catch (error) {
      console.log(`❌ Error checking emails: ${error.message}`);
    }

    // Step 5: Recommendations
    console.log('\n' + '='.repeat(70));
    console.log('  Recommendations');
    console.log('='.repeat(70));

    console.log('\n📋 If AI search is not working:');
    console.log('   1. Ensure your knowledge base has embeddings');
    console.log('      Run: POST /ai/knowledge-base/emails/backfill');
    console.log('   2. Check that Mistral AI service is configured');
    console.log('   3. Verify emails exist in your account');
    console.log('   4. Try the standard search filters first');

    console.log('\n📋 Frontend debugging:');
    console.log('   1. Open DevTools Console (F12)');
    console.log('   2. Type in AI search bar');
    console.log('   3. Check Network tab for /ai/memory/search requests');
    console.log('   4. Look for errors in Console');

    console.log('\n✅ Diagnostic complete!');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run diagnostics
runDiagnostics();
