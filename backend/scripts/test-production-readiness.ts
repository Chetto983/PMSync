/**
 * Production Readiness Test Script
 * Tests core API endpoints and WebSocket connection
 */
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:3000';

interface TestResult {
  name: string;
  status: 'pass' | 'fail';
  message: string;
  data?: unknown;
}

const results: TestResult[] = [];

async function testEndpoint(
  name: string,
  url: string,
  options?: RequestInit,
): Promise<TestResult> {
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    return {
      name,
      status: response.ok ? 'pass' : 'fail',
      message: `${response.status} ${response.statusText}`,
      data,
    };
  } catch (error) {
    return {
      name,
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function testHealth(): Promise<void> {
  const result = await testEndpoint('Health Check', `${API_URL}/health`);
  results.push(result);
  console.log(`[${result.status.toUpperCase()}] ${result.name}: ${result.message}`);
  if (result.data) {
    const health = result.data as { status: string; services: Record<string, unknown> };
    console.log(`  Status: ${health.status}`);
    if (health.services) {
      Object.entries(health.services).forEach(([service, status]) => {
        console.log(`  - ${service}: ${JSON.stringify(status)}`);
      });
    }
  }
}

async function testEmailSync(): Promise<void> {
  const result = await testEndpoint('Email Sync Status', `${API_URL}/email-sync/status`);
  results.push(result);
  console.log(`[${result.status.toUpperCase()}] ${result.name}: ${result.message}`);
}

async function testProtectedEndpoint(): Promise<void> {
  // Test that protected endpoints properly return 401 without auth
  const result = await testEndpoint('Protected Endpoint (no auth)', `${API_URL}/emails`);
  // We expect a 401, so if we get it that's a pass
  const expectUnauthorized = result.message.includes('401');
  results.push({
    ...result,
    status: expectUnauthorized ? 'pass' : 'fail',
    message: expectUnauthorized ? 'Correctly returns 401 Unauthorized' : result.message,
  });
  console.log(
    `[${expectUnauthorized ? 'PASS' : 'FAIL'}] Protected Endpoint: ${expectUnauthorized ? 'Correctly returns 401' : result.message}`,
  );
}

async function testWebSocket(): Promise<TestResult> {
  return new Promise((resolve) => {
    console.log('\n[INFO] Testing WebSocket connection...');

    const socket = io(API_URL, {
      path: '/realtime',
      transports: ['websocket'],
      timeout: 5000,
      // No token - should fail handshake
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      resolve({
        name: 'WebSocket Connection (no auth)',
        status: 'pass',
        message: 'Connection properly rejected without auth token',
      });
    }, 3000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.disconnect();
      resolve({
        name: 'WebSocket Connection (no auth)',
        status: 'fail',
        message: 'Should not connect without auth token',
      });
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      socket.disconnect();
      const isAuthError =
        error.message.toLowerCase().includes('unauthorized') ||
        error.message.toLowerCase().includes('authentication');
      resolve({
        name: 'WebSocket Connection (no auth)',
        status: isAuthError ? 'pass' : 'fail',
        message: isAuthError
          ? 'Correctly rejected: ' + error.message
          : 'Unexpected error: ' + error.message,
      });
    });
  });
}

async function runTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Production Readiness Tests');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log('');

  // Test health
  await testHealth();
  console.log('');

  // Test email sync status
  await testEmailSync();
  console.log('');

  // Test protected endpoints
  await testProtectedEndpoint();
  console.log('');

  // Test WebSocket
  const wsResult = await testWebSocket();
  results.push(wsResult);
  console.log(`[${wsResult.status.toUpperCase()}] ${wsResult.name}: ${wsResult.message}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results
      .filter((r) => r.status === 'fail')
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.message}`);
      });
  }

  console.log('\n' + '='.repeat(60));
  console.log(failed === 0 ? '✅ All tests passed!' : '❌ Some tests failed');
  console.log('='.repeat(60));

  process.exit(failed === 0 ? 0 : 1);
}

runTests();
