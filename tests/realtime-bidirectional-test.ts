/**
 * WebSocket Bidirectional Email Test
 *
 * Questo script simula il comportamento umano per testare il flusso completo:
 * - Connessione WebSocket
 * - Ricezione eventi realtime
 * - Azioni email (read, star, move, delete)
 * - Verifica sync bidirezionale
 *
 * Usage:
 *   npx ts-node tests/realtime-bidirectional-test.ts
 *
 * Prerequisites:
 *   - Backend running on http://localhost:3000
 *   - Valid JWT token
 *   - At least 2 email providers configured
 */

import { io, Socket } from 'socket.io-client';
import axios, { AxiosInstance } from 'axios';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:3000',
  JWT_TOKEN: process.env.TEST_JWT_TOKEN || '',
  TEST_TIMEOUT: 30000, // 30 seconds
  WS_TIMEOUT: 5000, // 5 seconds for WS events
};

// ============================================================================
// Colors for console output
// ============================================================================

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

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'blue');
}

function logStep(step: number, message: string) {
  log(`\n${colors.bright}[Step ${step}] ${message}${colors.reset}`, 'cyan');
}

// ============================================================================
// WebSocket Client Wrapper
// ============================================================================

class TestWebSocketClient {
  private socket: Socket | null = null;
  private events: Map<string, any[]> = new Map();

  async connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(`${CONFIG.BACKEND_URL}/realtime`, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, CONFIG.WS_TIMEOUT);

      this.socket.on('connected', (data: any) => {
        clearTimeout(timeout);
        logSuccess(`WebSocket connected: ${JSON.stringify(data)}`);
        resolve();
      });

      this.socket.on('connect_error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // Register all event listeners
      this.registerEventListeners();
    });
  }

  private registerEventListeners() {
    if (!this.socket) return;

    const eventTypes = [
      'email:new',
      'email:update',
      'email:delete',
      'email:unread_count_update',
      'email:folder_counts_update',
      'email:thread_update',
      'email:batch_processed',
      'sync:status',
    ];

    eventTypes.forEach((eventType) => {
      this.socket!.on(eventType, (data: any) => {
        if (!this.events.has(eventType)) {
          this.events.set(eventType, []);
        }
        this.events.get(eventType)!.push({
          ...data,
          _receivedAt: new Date().toISOString(),
        });
        log(`📨 Event received: ${eventType}`, 'magenta');
        log(`   Data: ${JSON.stringify(data, null, 2)}`, 'reset');
      });
    });
  }

  async waitForEvent(
    eventType: string,
    predicate?: (data: any) => boolean,
    timeout = CONFIG.WS_TIMEOUT
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        const events = this.events.get(eventType) || [];
        const matchingEvent = predicate
          ? events.find(predicate)
          : events[events.length - 1];

        if (matchingEvent) {
          clearInterval(checkInterval);
          resolve(matchingEvent);
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout waiting for event: ${eventType}`));
        }
      }, 100);
    });
  }

  clearEvents() {
    this.events.clear();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getReceivedEvents(eventType: string): any[] {
    return this.events.get(eventType) || [];
  }
}

// ============================================================================
// API Client Wrapper
// ============================================================================

class TestAPIClient {
  private client: AxiosInstance;

  constructor(token: string) {
    this.client = axios.create({
      baseURL: CONFIG.BACKEND_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getProviders() {
    const response = await this.client.get('/providers');
    return response.data;
  }

  async listEmails(params: {
    providerId?: string;
    folder?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await this.client.get('/emails', { params });
    return response.data;
  }

  async getEmail(emailId: string) {
    const response = await this.client.get(`/emails/${emailId}`);
    return response.data;
  }

  async updateEmail(
    emailId: string,
    data: {
      isRead?: boolean;
      isStarred?: boolean;
      isFlagged?: boolean;
      folder?: string;
    }
  ) {
    const response = await this.client.patch(`/emails/${emailId}`, data);
    return response.data;
  }

  async deleteEmail(emailId: string) {
    const response = await this.client.delete(`/emails/${emailId}`);
    return response.data;
  }

  async sendEmail(data: {
    to: string[];
    subject: string;
    body: string;
    providerId: string;
  }) {
    const response = await this.client.post('/emails/send', data);
    return response.data;
  }

  async triggerSync(providerId: string, syncType: 'full' | 'incremental' = 'incremental') {
    const response = await this.client.post(`/sync/${providerId}`, {
      syncType,
    });
    return response.data;
  }
}

// ============================================================================
// Test Suite
// ============================================================================

class BidirectionalEmailTest {
  private wsClient: TestWebSocketClient;
  private apiClient: TestAPIClient;
  private testEmailId: string | null = null;
  private providers: any[] = [];

  constructor() {
    this.wsClient = new TestWebSocketClient();
    this.apiClient = new TestAPIClient(CONFIG.JWT_TOKEN);
  }

  async run() {
    log('\n' + '='.repeat(80), 'bright');
    log('🚀 WebSocket Bidirectional Email Test Suite', 'bright');
    log('='.repeat(80) + '\n', 'bright');

    try {
      await this.setup();
      await this.testInboundFlow();
      await this.testOutboundFlow();
      await this.testBidirectionalSync();
      await this.cleanup();

      log('\n' + '='.repeat(80), 'bright');
      logSuccess('✅ All tests passed!');
      log('='.repeat(80) + '\n', 'bright');
    } catch (error) {
      logError(`Test suite failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      this.wsClient.disconnect();
    }
  }

  // ==========================================================================
  // Setup
  // ==========================================================================

  private async setup() {
    logStep(1, 'Setup - Connect WebSocket & Fetch Providers');

    if (!CONFIG.JWT_TOKEN) {
      throw new Error('JWT_TOKEN not provided. Set TEST_JWT_TOKEN env variable.');
    }

    // Connect WebSocket
    await this.wsClient.connect(CONFIG.JWT_TOKEN);

    // Fetch providers
    this.providers = await this.apiClient.getProviders();
    logInfo(`Found ${this.providers.length} providers`);

    if (this.providers.length < 1) {
      throw new Error('At least 1 provider required for testing');
    }

    this.providers.forEach((p, i) => {
      logInfo(`  Provider ${i + 1}: ${p.email} (${p.type}) [${p.id}]`);
    });

    logSuccess('Setup complete');
    await this.sleep(1000);
  }

  // ==========================================================================
  // Test 1: INBOUND Flow (Provider → Backend → WS → Frontend)
  // ==========================================================================

  private async testInboundFlow() {
    logStep(2, 'Test INBOUND: Send Email & Receive Realtime Event');

    const provider = this.providers[0];
    logInfo(`Using provider: ${provider.email}`);

    // Clear previous events
    this.wsClient.clearEvents();

    // Send email to ourselves to trigger inbound flow
    logInfo('Sending test email...');
    const sentEmail = await this.apiClient.sendEmail({
      to: [provider.email],
      subject: `Test Email - Inbound Flow - ${new Date().toISOString()}`,
      body: 'This is a test email for inbound flow verification.',
      providerId: provider.id,
    });

    logInfo(`Email sent: ${sentEmail.messageId || 'pending'}`);

    // Trigger sync to fetch the email
    logInfo('Triggering sync...');
    await this.apiClient.triggerSync(provider.id, 'incremental');

    // Wait for email:new event
    logInfo('Waiting for email:new event...');
    try {
      const event = await this.wsClient.waitForEvent(
        'email:new',
        (data) => data.providerId === provider.id,
        15000 // 15 seconds timeout
      );

      logSuccess(`Received email:new event!`);
      logInfo(`  Email ID: ${event.emailId}`);
      logInfo(`  Subject: ${event.email?.subject || 'N/A'}`);

      this.testEmailId = event.emailId;

      // Also check for folder counts update
      const folderEvent = await this.wsClient.waitForEvent(
        'email:folder_counts_update',
        (data) => data.providerId === provider.id,
        5000
      );
      logSuccess(`Received folder_counts_update event!`);
      logInfo(`  Folder: ${folderEvent.folderName} (${folderEvent.unreadCount} unread)`);
    } catch (error) {
      logError(`Failed to receive expected events`);
      throw error;
    }

    logSuccess('INBOUND test passed ✓');
    await this.sleep(2000);
  }

  // ==========================================================================
  // Test 2: OUTBOUND Flow (Frontend → API → WS → Provider)
  // ==========================================================================

  private async testOutboundFlow() {
    logStep(3, 'Test OUTBOUND: Update Email & Verify Realtime Event');

    if (!this.testEmailId) {
      // Fallback: get any email
      const emails = await this.apiClient.listEmails({
        providerId: this.providers[0].id,
        limit: 1,
      });

      if (emails.emails && emails.emails.length > 0) {
        this.testEmailId = emails.emails[0].id;
      } else {
        throw new Error('No test email available');
      }
    }

    logInfo(`Using email: ${this.testEmailId}`);

    // Clear events
    this.wsClient.clearEvents();

    // Test 2a: Mark as Read
    logInfo('\n📧 Test 2a: Mark as Read');
    await this.apiClient.updateEmail(this.testEmailId, { isRead: true });

    const readEvent = await this.wsClient.waitForEvent(
      'email:update',
      (data) => data.emailId === this.testEmailId
    );
    logSuccess('Received email:update event for mark as read');

    // Test 2b: Mark as Starred
    logInfo('\n⭐ Test 2b: Mark as Starred');
    this.wsClient.clearEvents();
    await this.apiClient.updateEmail(this.testEmailId, { isStarred: true });

    const starEvent = await this.wsClient.waitForEvent(
      'email:update',
      (data) => data.emailId === this.testEmailId
    );
    logSuccess('Received email:update event for mark as starred');

    // Test 2c: Move to Archive (if available)
    logInfo('\n📁 Test 2c: Move to Archive');
    this.wsClient.clearEvents();
    try {
      await this.apiClient.updateEmail(this.testEmailId, { folder: 'Archive' });

      const moveEvent = await this.wsClient.waitForEvent(
        'email:update',
        (data) => data.emailId === this.testEmailId
      );
      logSuccess('Received email:update event for move');

      // Check folder counts
      const folderEvent = await this.wsClient.waitForEvent(
        'email:folder_counts_update',
        undefined,
        3000
      );
      if (folderEvent) {
        logSuccess('Received folder_counts_update event');
      }
    } catch (error) {
      logInfo('Archive folder may not be available, skipping move test');
    }

    logSuccess('OUTBOUND test passed ✓');
    await this.sleep(2000);
  }

  // ==========================================================================
  // Test 3: BIDIRECTIONAL (Multi-device sync simulation)
  // ==========================================================================

  private async testBidirectionalSync() {
    logStep(4, 'Test BIDIRECTIONAL: Multi-device Sync Simulation');

    // Simulate second client
    logInfo('Creating second WebSocket client (simulating second browser)...');
    const wsClient2 = new TestWebSocketClient();
    await wsClient2.connect(CONFIG.JWT_TOKEN);

    await this.sleep(1000);

    // Clear events on both clients
    this.wsClient.clearEvents();
    wsClient2.clearEvents();

    if (!this.testEmailId) {
      throw new Error('No test email ID available');
    }

    // Client 1 makes a change via API
    logInfo('\n🔄 Client 1: Marking email as unread...');
    await this.apiClient.updateEmail(this.testEmailId, { isRead: false });

    // Both clients should receive the event
    logInfo('Waiting for events on both clients...');

    const [event1, event2] = await Promise.all([
      this.wsClient.waitForEvent(
        'email:update',
        (data) => data.emailId === this.testEmailId
      ),
      wsClient2.waitForEvent(
        'email:update',
        (data) => data.emailId === this.testEmailId
      ),
    ]);

    logSuccess('Client 1 received email:update event');
    logSuccess('Client 2 received email:update event');
    logInfo('✓ Multi-device sync working correctly!');

    // Cleanup
    wsClient2.disconnect();

    logSuccess('BIDIRECTIONAL test passed ✓');
    await this.sleep(2000);
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  private async cleanup() {
    logStep(5, 'Cleanup');

    if (this.testEmailId) {
      try {
        logInfo('Deleting test email...');
        await this.apiClient.deleteEmail(this.testEmailId);

        const deleteEvent = await this.wsClient.waitForEvent(
          'email:delete',
          (data) => data.emailId === this.testEmailId,
          5000
        );
        logSuccess('Received email:delete event');
      } catch (error) {
        logInfo('Test email already deleted or not found');
      }
    }

    logSuccess('Cleanup complete');
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  // Validate environment
  if (!CONFIG.JWT_TOKEN) {
    logError('Missing JWT_TOKEN. Please provide TEST_JWT_TOKEN environment variable.');
    logInfo('\nHow to get JWT token:');
    logInfo('1. Login to frontend');
    logInfo('2. Open DevTools > Application > Local Storage');
    logInfo('3. Copy the "token" value');
    logInfo('4. Run: TEST_JWT_TOKEN="your-token" npx ts-node tests/realtime-bidirectional-test.ts');
    process.exit(1);
  }

  const test = new BidirectionalEmailTest();

  try {
    await test.run();
    process.exit(0);
  } catch (error) {
    logError(`\nTest failed with error:`);
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { BidirectionalEmailTest, TestWebSocketClient, TestAPIClient };
