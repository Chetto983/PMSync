/**
 * PENETRATION TESTING SCRIPT
 * ===========================
 *
 * DISCLAIMER: This script is for authorized security testing only.
 * DO NOT use against systems you don't own or have permission to test.
 *
 * This script attempts various attack vectors to verify security fixes.
 */

import axios, { AxiosError } from 'axios';

const BASE_URL = 'http://localhost:3000';
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

interface TestResult {
  attack: string;
  expected: string;
  actual: string;
  status: 'BLOCKED' | 'VULNERABLE' | 'ERROR';
}

const results: TestResult[] = [];

function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logAttack(name: string) {
  log('magenta', `\n🎯 ATTACKING: ${name}`);
}

function logResult(result: TestResult) {
  const icon = result.status === 'BLOCKED' ? '✅' : result.status === 'VULNERABLE' ? '🚨' : '❌';
  const color = result.status === 'BLOCKED' ? 'green' : result.status === 'VULNERABLE' ? 'red' : 'yellow';
  log(color, `${icon} ${result.attack}: ${result.status}`);
  log('blue', `   Expected: ${result.expected}`);
  log('blue', `   Actual: ${result.actual}`);
  results.push(result);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// ATTACK 1: Unauthenticated Access
// ============================================
async function attack1_UnauthenticatedAccess() {
  logAttack('Unauthenticated Access to Protected Endpoints');

  const endpoints = [
    '/tenants',
    '/tenants/test-id',
    '/emails',
    '/compliance/gdpr/status',
    '/users/me',
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${BASE_URL}${endpoint}`);
      logResult({
        attack: `GET ${endpoint} (no auth)`,
        expected: '401 Unauthorized',
        actual: `${response.status} - VULNERABLE!`,
        status: 'VULNERABLE',
      });
    } catch (error) {
      const err = error as AxiosError;
      if (err.response?.status === 401) {
        logResult({
          attack: `GET ${endpoint} (no auth)`,
          expected: '401 Unauthorized',
          actual: `401 Unauthorized`,
          status: 'BLOCKED',
        });
      } else {
        logResult({
          attack: `GET ${endpoint} (no auth)`,
          expected: '401 Unauthorized',
          actual: `${err.response?.status || 'ERROR'}`,
          status: 'ERROR',
        });
      }
    }
  }
}

// ============================================
// ATTACK 2: JWT Token Manipulation
// ============================================
async function attack2_TokenManipulation() {
  logAttack('JWT Token Manipulation');

  // Test 1: Invalid token
  try {
    const response = await axios.get(`${BASE_URL}/tenants`, {
      headers: { Authorization: 'Bearer invalid_token_here' },
    });
    logResult({
      attack: 'Invalid JWT token',
      expected: '401 Unauthorized',
      actual: `${response.status} - VULNERABLE!`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Invalid JWT token',
      expected: '401 Unauthorized',
      actual: `${err.response?.status || 'ERROR'}`,
      status: err.response?.status === 401 ? 'BLOCKED' : 'ERROR',
    });
  }

  // Test 2: Expired token (simulate)
  const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjB9.invalid';
  try {
    const response = await axios.get(`${BASE_URL}/tenants`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    logResult({
      attack: 'Expired JWT token',
      expected: '401 Unauthorized',
      actual: `${response.status} - VULNERABLE!`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Expired JWT token',
      expected: '401 Unauthorized',
      actual: `${err.response?.status || 'ERROR'}`,
      status: err.response?.status === 401 ? 'BLOCKED' : 'ERROR',
    });
  }
}

// ============================================
// ATTACK 3: Authorization Bypass (Tenant Controller)
// ============================================
async function attack3_TenantAuthorizationBypass(userToken: string) {
  logAttack('Tenant Controller - Authorization Bypass Attempts');

  // Test 1: Regular user trying to list all tenants
  try {
    const response = await axios.get(`${BASE_URL}/tenants`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    logResult({
      attack: 'Regular user listing all tenants',
      expected: '403 Forbidden',
      actual: `${response.status} - VULNERABLE! User can see all tenants!`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Regular user listing all tenants',
      expected: '403 Forbidden',
      actual: `${err.response?.status || 'ERROR'}`,
      status: err.response?.status === 403 ? 'BLOCKED' : 'ERROR',
    });
  }

  // Test 2: Regular user trying to create tenant
  try {
    const response = await axios.post(
      `${BASE_URL}/tenants`,
      {
        name: 'Hacker Tenant',
        slug: 'hacker-tenant',
        description: 'Created by attacker!',
      },
      {
        headers: { Authorization: `Bearer ${userToken}` },
      },
    );
    logResult({
      attack: 'Regular user creating tenant',
      expected: '403 Forbidden',
      actual: `${response.status} - VULNERABLE! Tenant created!`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Regular user creating tenant',
      expected: '403 Forbidden',
      actual: `${err.response?.status || 'ERROR'}`,
      status: err.response?.status === 403 ? 'BLOCKED' : 'ERROR',
    });
  }

  // Test 3: Regular user trying to delete tenant
  try {
    const response = await axios.delete(`${BASE_URL}/tenants/victim-tenant-id`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    logResult({
      attack: 'Regular user deleting tenant',
      expected: '403 Forbidden',
      actual: `${response.status} - VULNERABLE! Tenant deleted!`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Regular user deleting tenant',
      expected: '403 Forbidden',
      actual: `${err.response?.status || 'ERROR'}`,
      status: err.response?.status === 403 ? 'BLOCKED' : 'ERROR',
    });
  }
}

// ============================================
// ATTACK 4: Mass Assignment
// ============================================
async function attack4_MassAssignment(adminToken: string, tenantId: string) {
  logAttack('Mass Assignment - Inject Protected Fields');

  try {
    const response = await axios.put(
      `${BASE_URL}/tenants/${tenantId}`,
      {
        name: 'Updated Name',
        isActive: false, // Should be rejected!
        ownerId: 'attacker-id', // Should be rejected!
        credits: 999999, // Should be rejected!
        __proto__: { isAdmin: true }, // Prototype pollution attempt
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );

    // Check if protected fields were updated
    const data = response.data;
    const vulnerable =
      data.isActive === false || data.ownerId === 'attacker-id' || data.credits === 999999;

    logResult({
      attack: 'Mass assignment - inject protected fields',
      expected: 'Only name updated',
      actual: vulnerable ? 'VULNERABLE! Protected fields modified!' : 'Only safe fields updated',
      status: vulnerable ? 'VULNERABLE' : 'BLOCKED',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Mass assignment - inject protected fields',
      expected: 'Only name updated or 400 Bad Request',
      actual: `${err.response?.status || 'ERROR'}`,
      status: 'BLOCKED',
    });
  }
}

// ============================================
// ATTACK 5: SQL Injection
// ============================================
async function attack5_SQLInjection(token: string) {
  logAttack('SQL Injection Attempts');

  const sqlPayloads = [
    "' OR '1'='1",
    "' OR 1=1--",
    "' UNION SELECT password FROM users--",
    "'; DROP TABLE users; --",
    "admin' --",
    "1' OR '1' = '1",
  ];

  for (const payload of sqlPayloads) {
    try {
      const response = await axios.get(`${BASE_URL}/emails/search`, {
        params: { q: payload },
        headers: { Authorization: `Bearer ${token}` },
      });

      logResult({
        attack: `SQL Injection: ${payload}`,
        expected: 'Safe query or error',
        actual: `${response.status} - Potential vulnerability if returns unexpected data`,
        status: 'VULNERABLE',
      });
    } catch (error) {
      const err = error as AxiosError;
      logResult({
        attack: `SQL Injection: ${payload}`,
        expected: 'Safe query or error',
        actual: `${err.response?.status || 'ERROR'} - Query rejected or parameterized`,
        status: 'BLOCKED',
      });
    }
  }
}

// ============================================
// ATTACK 6: Cross-Site Scripting (XSS)
// ============================================
async function attack6_XSS(token: string) {
  logAttack('XSS - Stored Cross-Site Scripting');

  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    '<svg/onload=alert("XSS")>',
    'javascript:alert("XSS")',
    '<iframe src="javascript:alert(\'XSS\')">',
  ];

  for (const payload of xssPayloads) {
    try {
      // Try to create label with XSS
      const response = await axios.post(
        `${BASE_URL}/labels`,
        {
          name: payload,
          color: '#ff0000',
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      // Check if payload was sanitized
      const labelName = response.data.name;
      const sanitized = !labelName.includes('<script>') && !labelName.includes('onerror=');

      logResult({
        attack: `XSS in label name: ${payload.substring(0, 30)}...`,
        expected: 'Sanitized or rejected',
        actual: sanitized ? 'Sanitized' : 'VULNERABLE! XSS stored!',
        status: sanitized ? 'BLOCKED' : 'VULNERABLE',
      });
    } catch (error) {
      const err = error as AxiosError;
      logResult({
        attack: `XSS in label name: ${payload.substring(0, 30)}...`,
        expected: 'Sanitized or rejected',
        actual: `${err.response?.status || 'ERROR'} - Rejected`,
        status: 'BLOCKED',
      });
    }
  }
}

// ============================================
// ATTACK 7: Rate Limit Bypass
// ============================================
async function attack7_RateLimitBypass() {
  logAttack('Rate Limiting - Brute Force Attack');

  const attempts = 10;
  let successCount = 0;

  log('yellow', `Attempting ${attempts} OTP verification requests...`);

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await axios.post(`${BASE_URL}/auth/verify-otp`, {
        email: 'victim@example.com',
        code: String(i).padStart(6, '0'),
        tenantSlug: 'test',
      });

      successCount++;
      log('yellow', `  Attempt ${i + 1}: ${response.status} - Request succeeded`);
    } catch (error) {
      const err = error as AxiosError;
      if (err.response?.status === 429) {
        log('green', `  Attempt ${i + 1}: 429 - Rate limited (GOOD!)`);
        break;
      } else {
        log('yellow', `  Attempt ${i + 1}: ${err.response?.status || 'ERROR'}`);
      }
    }

    await sleep(100); // Small delay
  }

  logResult({
    attack: `Rate limit bypass - ${attempts} OTP attempts`,
    expected: 'Blocked after 3 attempts',
    actual: `${successCount} attempts succeeded before rate limit`,
    status: successCount <= 3 ? 'BLOCKED' : 'VULNERABLE',
  });
}

// ============================================
// ATTACK 8: File Upload Exploits
// ============================================
async function attack8_FileUpload(token: string) {
  logAttack('File Upload - Malicious Files');

  // Test 1: Executable file
  try {
    const maliciousFile = Buffer.from('MZ\x90\x00').toString('base64'); // EXE signature

    const response = await axios.post(
      `${BASE_URL}/emails/send`,
      {
        to: ['victim@example.com'],
        subject: 'Test',
        bodyText: 'Test',
        bodyHtml: '<p>Test</p>',
        attachments: [
          {
            filename: 'malware.exe',
            contentType: 'application/x-msdownload',
            contentBase64: maliciousFile,
          },
        ],
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    logResult({
      attack: 'Upload .exe file',
      expected: '400 Bad Request - file type rejected',
      actual: `${response.status} - VULNERABLE! Executable uploaded!`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Upload .exe file',
      expected: '400 Bad Request',
      actual: `${err.response?.status || 'ERROR'} - Upload rejected`,
      status: err.response?.status === 400 ? 'BLOCKED' : 'ERROR',
    });
  }

  // Test 2: Path traversal
  try {
    const response = await axios.post(
      `${BASE_URL}/emails/send`,
      {
        to: ['victim@example.com'],
        subject: 'Test',
        bodyText: 'Test',
        bodyHtml: '<p>Test</p>',
        attachments: [
          {
            filename: '../../etc/passwd',
            contentType: 'text/plain',
            contentBase64: Buffer.from('test').toString('base64'),
          },
        ],
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    logResult({
      attack: 'Path traversal in filename',
      expected: 'Filename sanitized',
      actual: `${response.status} - Check if filename was sanitized`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Path traversal in filename',
      expected: 'Filename sanitized or rejected',
      actual: `${err.response?.status || 'ERROR'}`,
      status: 'BLOCKED',
    });
  }
}

// ============================================
// ATTACK 9: Input Validation Bypass
// ============================================
async function attack9_InputValidation(token: string) {
  logAttack('Input Validation - Bypass Attempts');

  // Test 1: Negative page number
  try {
    const response = await axios.get(`${BASE_URL}/emails`, {
      params: { page: -1, limit: 50 },
      headers: { Authorization: `Bearer ${token}` },
    });

    logResult({
      attack: 'Negative page number',
      expected: '400 Bad Request',
      actual: `${response.status} - VULNERABLE!`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Negative page number',
      expected: '400 Bad Request',
      actual: `${err.response?.status || 'ERROR'}`,
      status: err.response?.status === 400 ? 'BLOCKED' : 'ERROR',
    });
  }

  // Test 2: Extremely large limit (DOS attempt)
  try {
    const response = await axios.get(`${BASE_URL}/emails`, {
      params: { page: 1, limit: 999999 },
      headers: { Authorization: `Bearer ${token}` },
    });

    logResult({
      attack: 'Extremely large limit (999999)',
      expected: '400 Bad Request',
      actual: `${response.status} - VULNERABLE! DOS possible!`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Extremely large limit (999999)',
      expected: '400 Bad Request',
      actual: `${err.response?.status || 'ERROR'}`,
      status: err.response?.status === 400 ? 'BLOCKED' : 'ERROR',
    });
  }

  // Test 3: Massive page number (offset DOS)
  try {
    const response = await axios.get(`${BASE_URL}/emails`, {
      params: { page: 999999, limit: 100 },
      headers: { Authorization: `Bearer ${token}` },
    });

    logResult({
      attack: 'Massive page number (offset DOS)',
      expected: '400 Bad Request',
      actual: `${response.status} - VULNERABLE! Huge offset allowed!`,
      status: 'VULNERABLE',
    });
  } catch (error) {
    const err = error as AxiosError;
    logResult({
      attack: 'Massive page number (offset DOS)',
      expected: '400 Bad Request',
      actual: `${err.response?.status || 'ERROR'}`,
      status: err.response?.status === 400 ? 'BLOCKED' : 'ERROR',
    });
  }
}

// ============================================
// MAIN FUNCTION
// ============================================
async function main() {
  log('magenta', '╔════════════════════════════════════════════════════════════╗');
  log('magenta', '║         PENETRATION TESTING - AUTHORIZED ONLY              ║');
  log('magenta', '║                                                            ║');
  log('magenta', '║  Testing backend security controls and vulnerabilities     ║');
  log('magenta', '║  Target: http://localhost:3000                             ║');
  log('magenta', '╚════════════════════════════════════════════════════════════╝\n');

  // Note: You'll need valid tokens for authenticated tests
  // For now, we'll test what we can without authentication
  const mockUserToken = 'user_token_here'; // Replace with actual token for full test
  const mockAdminToken = 'admin_token_here'; // Replace with actual token
  const mockTenantId = 'tenant_id_here'; // Replace with actual ID

  try {
    await attack1_UnauthenticatedAccess();
    await attack2_TokenManipulation();
    await attack7_RateLimitBypass();

    // Uncomment when you have valid tokens:
    // await attack3_TenantAuthorizationBypass(mockUserToken);
    // await attack4_MassAssignment(mockAdminToken, mockTenantId);
    // await attack5_SQLInjection(mockUserToken);
    // await attack6_XSS(mockUserToken);
    // await attack8_FileUpload(mockUserToken);
    // await attack9_InputValidation(mockUserToken);
  } catch (error) {
    log('red', `\n❌ Fatal error during penetration test: ${error}`);
  }

  // Print summary
  log('magenta', '\n\n╔════════════════════════════════════════════════════════════╗');
  log('magenta', '║                    TEST SUMMARY                            ║');
  log('magenta', '╚════════════════════════════════════════════════════════════╝\n');

  const blocked = results.filter((r) => r.status === 'BLOCKED').length;
  const vulnerable = results.filter((r) => r.status === 'VULNERABLE').length;
  const errors = results.filter((r) => r.status === 'ERROR').length;

  log('green', `✅ BLOCKED (Secure): ${blocked}`);
  log('red', `🚨 VULNERABLE: ${vulnerable}`);
  log('yellow', `❌ ERRORS: ${errors}`);
  log('blue', `📊 Total Tests: ${results.length}`);

  const securityScore = blocked / results.length * 100;
  log('blue', `\n🎯 Security Score: ${securityScore.toFixed(1)}%`);

  if (vulnerable > 0) {
    log('red', '\n⚠️  WARNING: VULNERABILITIES FOUND! Review results above.');
  } else if (errors > 0) {
    log('yellow', '\n⚠️  Some tests encountered errors. Manual verification needed.');
  } else {
    log('green', '\n✅ All attack vectors BLOCKED! Security controls working.');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
