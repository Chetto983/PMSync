require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET;
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';
const USER_ID = 'cmi31xyg90002yhukhefghcxu';

// Generate a valid test JWT token
function generateTestToken() {
  const payload = {
    userId: USER_ID,
    tenantId: TENANT_ID,
    email: 'dvdmarchetto@gmail.com',
    role: 'admin',
    sessionId: `test-session-${Date.now()}`,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const AUTH_TOKEN = generateTestToken();
console.log('Generated test JWT token for tenant:', TENANT_ID);

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
  console.log('\n=== Multi-Agent System Full Test ===\n');
  console.log('Tenant ID:', TENANT_ID);
  console.log('API Base:', API_BASE);
  console.log('');

  let allPassed = true;

  // 1. Test list agents
  console.log('1. GET /ai/multi-agent/agents - List registered agents...');
  try {
    const agents = await fetch(`${API_BASE}/ai/multi-agent/agents`, { headers });
    console.log('   Status:', agents.status);
    if (agents.status === 200) {
      const agentList = Array.isArray(agents.data) ? agents.data : agents.data.agents || [];
      console.log('   ✓ Registered agents:', agentList.map(a => a.name).join(', '));
    } else {
      console.log('   ✗ Error:', agents.data);
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // 2. Test stats endpoint
  console.log('\n2. GET /ai/multi-agent/stats/action-counts - Action counts...');
  try {
    const counts = await fetch(`${API_BASE}/ai/multi-agent/stats/action-counts`, { headers });
    console.log('   Status:', counts.status);
    if (counts.status === 200) {
      console.log('   ✓ Action counts retrieved');
      console.log('   ', JSON.stringify(counts.data, null, 2).substring(0, 200));
    } else {
      console.log('   ✗ Error:', counts.data);
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // 3. Test pending actions
  console.log('\n3. GET /ai/multi-agent/pending-actions - Pending actions...');
  try {
    const pending = await fetch(`${API_BASE}/ai/multi-agent/pending-actions`, { headers });
    console.log('   Status:', pending.status);
    if (pending.status === 200) {
      console.log('   ✓ Pending actions:', Array.isArray(pending.data) ? pending.data.length : 0);
    } else {
      console.log('   ✗ Error:', pending.data);
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // 4. Test learning stats
  console.log('\n4. GET /ai/multi-agent/stats/learning - Learning stats...');
  try {
    const learning = await fetch(`${API_BASE}/ai/multi-agent/stats/learning`, { headers });
    console.log('   Status:', learning.status);
    if (learning.status === 200) {
      console.log('   ✓ Learning stats retrieved');
      if (learning.data.profiles) {
        console.log('   Profiles:', learning.data.profiles.length);
      }
    } else {
      console.log('   ✗ Error:', learning.data);
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // 5. Test aggregate stats
  console.log('\n5. GET /ai/multi-agent/stats/aggregate - Aggregate stats...');
  try {
    const agg = await fetch(`${API_BASE}/ai/multi-agent/stats/aggregate`, { headers });
    console.log('   Status:', agg.status);
    if (agg.status === 200) {
      console.log('   ✓ Aggregate stats retrieved');
      console.log('   ', JSON.stringify(agg.data, null, 2).substring(0, 300));
    } else {
      console.log('   ✗ Error:', agg.data);
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // 6. Test process message - simple greeting
  console.log('\n6. POST /ai/multi-agent/process - Process greeting message...');
  try {
    const process1 = await fetch(`${API_BASE}/ai/multi-agent/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'Hello! What can you help me with?'
      })
    });
    console.log('   Status:', process1.status);
    if (process1.status === 200 || process1.status === 201) {
      console.log('   ✓ Message processed');
      console.log('   Intent:', process1.data.intent?.intent);
      console.log('   Agent:', process1.data.agentUsed);
      console.log('   Messages:', process1.data.messages?.[0]?.substring(0, 100));
    } else {
      console.log('   ✗ Error:', JSON.stringify(process1.data, null, 2).substring(0, 500));
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // 7. Test process message - email intent
  console.log('\n7. POST /ai/multi-agent/process - Process email intent...');
  try {
    const process2 = await fetch(`${API_BASE}/ai/multi-agent/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'Search for emails from Amazon about orders'
      })
    });
    console.log('   Status:', process2.status);
    if (process2.status === 200 || process2.status === 201) {
      console.log('   ✓ Email intent processed');
      console.log('   Intent:', process2.data.intent?.intent);
      console.log('   Confidence:', process2.data.intent?.confidence);
      console.log('   Agent:', process2.data.agentUsed);
      console.log('   Pending actions:', process2.data.pendingActionIds?.length || 0);
      console.log('   Executed actions:', process2.data.executedActionIds?.length || 0);
    } else {
      console.log('   ✗ Error:', JSON.stringify(process2.data, null, 2).substring(0, 500));
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // 8. Test process message - calendar intent
  console.log('\n8. POST /ai/multi-agent/process - Process calendar intent...');
  try {
    const process3 = await fetch(`${API_BASE}/ai/multi-agent/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'What meetings do I have tomorrow?'
      })
    });
    console.log('   Status:', process3.status);
    if (process3.status === 200 || process3.status === 201) {
      console.log('   ✓ Calendar intent processed');
      console.log('   Intent:', process3.data.intent?.intent);
      console.log('   Agent:', process3.data.agentUsed);
    } else {
      console.log('   ✗ Error:', JSON.stringify(process3.data, null, 2).substring(0, 500));
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // 9. Test process message - contacts intent
  console.log('\n9. POST /ai/multi-agent/process - Process contacts intent...');
  try {
    const process4 = await fetch(`${API_BASE}/ai/multi-agent/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'Find the phone number for John Smith'
      })
    });
    console.log('   Status:', process4.status);
    if (process4.status === 200 || process4.status === 201) {
      console.log('   ✓ Contacts intent processed');
      console.log('   Intent:', process4.data.intent?.intent);
      console.log('   Agent:', process4.data.agentUsed);
    } else {
      console.log('   ✗ Error:', JSON.stringify(process4.data, null, 2).substring(0, 500));
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // 10. Test feedback endpoint
  console.log('\n10. GET /ai/multi-agent/feedback - Feedback history...');
  try {
    const feedback = await fetch(`${API_BASE}/ai/multi-agent/feedback?limit=10`, { headers });
    console.log('   Status:', feedback.status);
    if (feedback.status === 200) {
      console.log('   ✓ Feedback retrieved:', Array.isArray(feedback.data) ? feedback.data.length : 0, 'items');
    } else {
      console.log('   ✗ Error:', feedback.data);
      allPassed = false;
    }
  } catch (e) {
    console.log('   ✗ Error:', e.message);
    allPassed = false;
  }

  // Final summary
  console.log('\n=== Test Complete ===');
  console.log(allPassed ? '✓ All tests passed!' : '✗ Some tests failed');

  return allPassed;
}

testMultiAgent()
  .then(passed => process.exit(passed ? 0 : 1))
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
