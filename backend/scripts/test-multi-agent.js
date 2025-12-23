require('dotenv').config();
const http = require('http');

const API_BASE = 'http://localhost:3001';

// You'll need to get a valid JWT token - use one from your frontend login
const AUTH_TOKEN = process.env.TEST_JWT_TOKEN || 'YOUR_JWT_TOKEN_HERE';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testMultiAgent() {
  console.log('=== Multi-Agent System Test ===\n');

  // 1. Test list agents (no auth needed for basic endpoint test)
  console.log('1. Testing GET /ai/multi-agent/agents...');
  try {
    const agents = await fetch(`${API_BASE}/ai/multi-agent/agents`, { headers });
    console.log('   Status:', agents.status);
    console.log('   Response:', JSON.stringify(agents.data, null, 2));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 2. Test stats endpoint
  console.log('\n2. Testing GET /ai/multi-agent/stats/action-counts...');
  try {
    const counts = await fetch(`${API_BASE}/ai/multi-agent/stats/action-counts`, { headers });
    console.log('   Status:', counts.status);
    console.log('   Response:', JSON.stringify(counts.data, null, 2));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 3. Test pending actions
  console.log('\n3. Testing GET /ai/multi-agent/pending-actions...');
  try {
    const pending = await fetch(`${API_BASE}/ai/multi-agent/pending-actions`, { headers });
    console.log('   Status:', pending.status);
    console.log('   Response:', JSON.stringify(pending.data, null, 2));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 4. Test learning stats
  console.log('\n4. Testing GET /ai/multi-agent/stats/learning...');
  try {
    const learning = await fetch(`${API_BASE}/ai/multi-agent/stats/learning`, { headers });
    console.log('   Status:', learning.status);
    console.log('   Response:', JSON.stringify(learning.data, null, 2));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 5. Test process message (requires valid auth)
  console.log('\n5. Testing POST /ai/multi-agent/process...');
  try {
    const process = await fetch(`${API_BASE}/ai/multi-agent/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'Hello, what can you help me with?'
      })
    });
    console.log('   Status:', process.status);
    console.log('   Response:', JSON.stringify(process.data, null, 2));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  console.log('\n=== Test Complete ===');
}

testMultiAgent().catch(console.error);
