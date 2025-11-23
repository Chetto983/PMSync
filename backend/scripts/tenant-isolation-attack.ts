import axios, { AxiosError } from 'axios';
import chalk from 'chalk';

/**
 * TENANT ISOLATION PENETRATION TEST
 *
 * This script simulates a malicious attacker attempting to bypass
 * tenant isolation and access data from other tenants.
 *
 * Attack scenarios:
 * 1. Cross-tenant email access
 * 2. Cross-tenant contact access
 * 3. Cross-tenant calendar access
 * 4. Cross-tenant AI session access
 * 5. Cross-tenant provider manipulation
 * 6. Cross-tenant webhook abuse
 * 7. Parameter injection attacks
 * 8. ID enumeration attacks
 */

const BASE_URL = 'http://localhost:3000';

// Test credentials for two different tenants
const TENANT_A_USER = {
  email: 'tenant-a@test.com',
  password: 'password123',
  tenantId: '', // Will be populated after login
  token: '',
};

const TENANT_B_USER = {
  email: 'tenant-b@test.com',
  password: 'password123',
  tenantId: '', // Will be populated after login
  token: '',
};

interface AttackResult {
  attack: string;
  method: string;
  endpoint: string;
  blocked: boolean;
  response: any;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

const attackResults: AttackResult[] = [];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function logHeader(title: string) {
  console.log(chalk.cyan('\n' + '═'.repeat(80)));
  console.log(chalk.cyan(`║ ${title.padEnd(78)} ║`));
  console.log(chalk.cyan('═'.repeat(80) + '\n'));
}

function logAttack(attackNumber: number, total: number, description: string) {
  console.log(chalk.blue(`[${attackNumber}/${total}] ${description}`));
}

function logBlocked() {
  console.log(chalk.green('  ✅ BLOCKED - Tenant isolation enforced'));
}

function logVulnerable(details: string) {
  console.log(chalk.red(`  🚨 VULNERABLE - ${details}`));
}

async function registerUser(email: string, password: string, firstName: string) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/register`, {
      email,
      password,
      firstName,
    });
    console.log(chalk.green(`✓ Registered user: ${email}`));
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log(chalk.yellow(`! User already exists: ${email}`));
      return null;
    }
    throw error;
  }
}

async function loginUser(email: string, password: string) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email,
      password,
    });
    console.log(chalk.green(`✓ Logged in: ${email}`));
    return response.data;
  } catch (error: any) {
    console.error(chalk.red(`✗ Login failed for ${email}:`, error.response?.data || error.message));
    throw error;
  }
}

function recordAttack(
  attack: string,
  method: string,
  endpoint: string,
  blocked: boolean,
  response: any,
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  description: string,
) {
  attackResults.push({
    attack,
    method,
    endpoint,
    blocked,
    response,
    severity,
    description,
  });
}

// ============================================================================
// SETUP: Create test users in different tenants
// ============================================================================

async function setupTestUsers() {
  logHeader('SETUP: Creating Test Users in Different Tenants');

  // Register and login Tenant A user
  await registerUser(TENANT_A_USER.email, TENANT_A_USER.password, 'Tenant A User');
  const tenantALogin = await loginUser(TENANT_A_USER.email, TENANT_A_USER.password);
  TENANT_A_USER.token = tenantALogin.access_token;
  TENANT_A_USER.tenantId = tenantALogin.user.tenantId;
  console.log(chalk.cyan(`  Tenant A ID: ${TENANT_A_USER.tenantId}`));

  // Register and login Tenant B user
  await registerUser(TENANT_B_USER.email, TENANT_B_USER.password, 'Tenant B User');
  const tenantBLogin = await loginUser(TENANT_B_USER.email, TENANT_B_USER.password);
  TENANT_B_USER.token = tenantBLogin.access_token;
  TENANT_B_USER.tenantId = tenantBLogin.user.tenantId;
  console.log(chalk.cyan(`  Tenant B ID: ${TENANT_B_USER.tenantId}`));

  if (TENANT_A_USER.tenantId === TENANT_B_USER.tenantId) {
    throw new Error('SETUP ERROR: Both users ended up in the same tenant! Cannot test isolation.');
  }

  console.log(chalk.green('\n✓ Test users ready in separate tenants\n'));
}

// ============================================================================
// ATTACK 1: Cross-Tenant Email Access
// ============================================================================

async function attack1_CrossTenantEmailAccess() {
  logHeader('ATTACK 1: Cross-Tenant Email Access');

  // First, Tenant A creates an email/draft
  let tenantAEmailId = '';
  try {
    const response = await axios.post(
      `${BASE_URL}/emails/drafts`,
      {
        subject: 'Confidential Tenant A Email',
        body: 'SECRET DATA: Tenant A financial report Q4 2025',
        to: ['recipient@example.com'],
      },
      {
        headers: { Authorization: `Bearer ${TENANT_A_USER.token}` },
      },
    );
    tenantAEmailId = response.data.id;
    console.log(chalk.green(`✓ Tenant A created email: ${tenantAEmailId}`));
  } catch (error) {
    console.log(chalk.yellow('! Could not create test email'));
    return;
  }

  // Attack 1.1: Tenant B tries to read Tenant A's email
  logAttack(1, 4, 'Tenant B attempts to read Tenant A email by ID');
  try {
    const response = await axios.get(`${BASE_URL}/emails/${tenantAEmailId}`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
    });

    if (response.status === 200 && response.data) {
      logVulnerable('Tenant B can access Tenant A email!');
      recordAttack(
        'Cross-Tenant Email Read',
        'GET',
        `/emails/${tenantAEmailId}`,
        false,
        response.data,
        'CRITICAL',
        'User can read emails from other tenants by guessing email IDs',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Email Read',
        'GET',
        `/emails/${tenantAEmailId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents reading other tenant emails',
      );
    } else {
      throw error;
    }
  }

  // Attack 1.2: Tenant B tries to update Tenant A's email
  logAttack(2, 4, 'Tenant B attempts to modify Tenant A email');
  try {
    const response = await axios.patch(
      `${BASE_URL}/emails/${tenantAEmailId}`,
      { subject: 'HACKED BY TENANT B' },
      {
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      },
    );

    if (response.status === 200) {
      logVulnerable('Tenant B can modify Tenant A email!');
      recordAttack(
        'Cross-Tenant Email Update',
        'PATCH',
        `/emails/${tenantAEmailId}`,
        false,
        response.data,
        'CRITICAL',
        'User can modify emails from other tenants',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Email Update',
        'PATCH',
        `/emails/${tenantAEmailId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents modifying other tenant emails',
      );
    }
  }

  // Attack 1.3: Tenant B tries to delete Tenant A's email
  logAttack(3, 4, 'Tenant B attempts to delete Tenant A email');
  try {
    const response = await axios.delete(`${BASE_URL}/emails/${tenantAEmailId}`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
    });

    if (response.status === 200 || response.status === 204) {
      logVulnerable('Tenant B can delete Tenant A email!');
      recordAttack(
        'Cross-Tenant Email Delete',
        'DELETE',
        `/emails/${tenantAEmailId}`,
        false,
        null,
        'CRITICAL',
        'User can delete emails from other tenants',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Email Delete',
        'DELETE',
        `/emails/${tenantAEmailId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents deleting other tenant emails',
      );
    }
  }

  // Attack 1.4: ID Enumeration - Try sequential IDs
  logAttack(4, 4, 'ID Enumeration attack - scan for valid email IDs');
  let foundEmails = 0;
  const testIds = ['1', '2', '3', '100', '1000'];
  for (const id of testIds) {
    try {
      const response = await axios.get(`${BASE_URL}/emails/${id}`, {
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      });
      if (response.status === 200) {
        foundEmails++;
      }
    } catch (error: any) {
      // Expected - access denied or not found
    }
  }

  if (foundEmails > 0) {
    logVulnerable(`ID enumeration successful - found ${foundEmails} emails`);
    recordAttack(
      'Email ID Enumeration',
      'GET',
      '/emails/:id',
      false,
      { foundEmails },
      'HIGH',
      'Attacker can enumerate valid email IDs',
    );
  } else {
    logBlocked();
    recordAttack(
      'Email ID Enumeration',
      'GET',
      '/emails/:id',
      true,
      null,
      'HIGH',
      'ID enumeration blocked by tenant isolation',
    );
  }
}

// ============================================================================
// ATTACK 2: Cross-Tenant Contact Access
// ============================================================================

async function attack2_CrossTenantContactAccess() {
  logHeader('ATTACK 2: Cross-Tenant Contact Access');

  // First, Tenant A creates a contact
  let tenantAContactId = '';
  try {
    const response = await axios.post(
      `${BASE_URL}/contacts`,
      {
        email: 'vip-client@tenantA.com',
        firstName: 'Secret',
        lastName: 'Contact',
        company: 'Confidential Corp',
      },
      {
        headers: { Authorization: `Bearer ${TENANT_A_USER.token}` },
      },
    );
    tenantAContactId = response.data.id;
    console.log(chalk.green(`✓ Tenant A created contact: ${tenantAContactId}`));
  } catch (error) {
    console.log(chalk.yellow('! Could not create test contact'));
    return;
  }

  // Attack 2.1: Tenant B tries to read Tenant A's contact
  logAttack(1, 3, 'Tenant B attempts to read Tenant A contact');
  try {
    const response = await axios.get(`${BASE_URL}/contacts/${tenantAContactId}`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
    });

    if (response.status === 200 && response.data) {
      logVulnerable('Tenant B can access Tenant A contact!');
      recordAttack(
        'Cross-Tenant Contact Read',
        'GET',
        `/contacts/${tenantAContactId}`,
        false,
        response.data,
        'CRITICAL',
        'User can read contacts from other tenants',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Contact Read',
        'GET',
        `/contacts/${tenantAContactId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents reading other tenant contacts',
      );
    }
  }

  // Attack 2.2: Tenant B tries to list all contacts (should only see their own)
  logAttack(2, 3, 'Tenant B lists contacts (checking for data leakage)');
  try {
    const response = await axios.get(`${BASE_URL}/contacts`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
    });

    // Check if Tenant A's contact appears in the list
    const contacts = response.data;
    const leakedContact = contacts.find((c: any) => c.id === tenantAContactId);

    if (leakedContact) {
      logVulnerable('Tenant B can see Tenant A contacts in list!');
      recordAttack(
        'Cross-Tenant Contact List Leakage',
        'GET',
        '/contacts',
        false,
        leakedContact,
        'CRITICAL',
        'Contact list endpoint leaks data from other tenants',
      );
    } else {
      logBlocked();
      recordAttack(
        'Cross-Tenant Contact List Leakage',
        'GET',
        '/contacts',
        true,
        null,
        'CRITICAL',
        'Contact list properly filtered by tenant',
      );
    }
  } catch (error: any) {
    // Unexpected error
    throw error;
  }

  // Attack 2.3: Tenant B tries to update Tenant A's contact
  logAttack(3, 3, 'Tenant B attempts to modify Tenant A contact');
  try {
    const response = await axios.patch(
      `${BASE_URL}/contacts/${tenantAContactId}`,
      { company: 'HACKED BY TENANT B' },
      {
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      },
    );

    if (response.status === 200) {
      logVulnerable('Tenant B can modify Tenant A contact!');
      recordAttack(
        'Cross-Tenant Contact Update',
        'PATCH',
        `/contacts/${tenantAContactId}`,
        false,
        response.data,
        'CRITICAL',
        'User can modify contacts from other tenants',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Contact Update',
        'PATCH',
        `/contacts/${tenantAContactId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents modifying other tenant contacts',
      );
    }
  }
}

// ============================================================================
// ATTACK 3: Cross-Tenant Calendar Access
// ============================================================================

async function attack3_CrossTenantCalendarAccess() {
  logHeader('ATTACK 3: Cross-Tenant Calendar Access');

  // First, Tenant A creates a calendar event
  let tenantAEventId = '';
  try {
    const response = await axios.post(
      `${BASE_URL}/calendar/events`,
      {
        summary: 'Confidential Board Meeting',
        description: 'Q4 Strategy - TOP SECRET',
        startTime: new Date('2025-12-01T10:00:00Z').toISOString(),
        endTime: new Date('2025-12-01T11:00:00Z').toISOString(),
      },
      {
        headers: { Authorization: `Bearer ${TENANT_A_USER.token}` },
      },
    );
    tenantAEventId = response.data.id;
    console.log(chalk.green(`✓ Tenant A created calendar event: ${tenantAEventId}`));
  } catch (error) {
    console.log(chalk.yellow('! Could not create test calendar event'));
    return;
  }

  // Attack 3.1: Tenant B tries to read Tenant A's calendar event
  logAttack(1, 3, 'Tenant B attempts to read Tenant A calendar event');
  try {
    const response = await axios.get(`${BASE_URL}/calendar/events/${tenantAEventId}`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
    });

    if (response.status === 200 && response.data) {
      logVulnerable('Tenant B can access Tenant A calendar event!');
      recordAttack(
        'Cross-Tenant Calendar Read',
        'GET',
        `/calendar/events/${tenantAEventId}`,
        false,
        response.data,
        'CRITICAL',
        'User can read calendar events from other tenants',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Calendar Read',
        'GET',
        `/calendar/events/${tenantAEventId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents reading other tenant calendar events',
      );
    }
  }

  // Attack 3.2: Tenant B lists events (checking for data leakage)
  logAttack(2, 3, 'Tenant B lists calendar events (checking for leakage)');
  try {
    const response = await axios.get(`${BASE_URL}/calendar/events`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
    });

    const events = response.data;
    const leakedEvent = events.find((e: any) => e.id === tenantAEventId);

    if (leakedEvent) {
      logVulnerable('Tenant B can see Tenant A events in list!');
      recordAttack(
        'Cross-Tenant Calendar List Leakage',
        'GET',
        '/calendar/events',
        false,
        leakedEvent,
        'CRITICAL',
        'Calendar list endpoint leaks data from other tenants',
      );
    } else {
      logBlocked();
      recordAttack(
        'Cross-Tenant Calendar List Leakage',
        'GET',
        '/calendar/events',
        true,
        null,
        'CRITICAL',
        'Calendar list properly filtered by tenant',
      );
    }
  } catch (error: any) {
    throw error;
  }

  // Attack 3.3: Tenant B tries to modify Tenant A's event
  logAttack(3, 3, 'Tenant B attempts to modify Tenant A calendar event');
  try {
    const response = await axios.patch(
      `${BASE_URL}/calendar/events/${tenantAEventId}`,
      { summary: 'CANCELLED BY HACKER' },
      {
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      },
    );

    if (response.status === 200) {
      logVulnerable('Tenant B can modify Tenant A calendar event!');
      recordAttack(
        'Cross-Tenant Calendar Update',
        'PATCH',
        `/calendar/events/${tenantAEventId}`,
        false,
        response.data,
        'CRITICAL',
        'User can modify calendar events from other tenants',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Calendar Update',
        'PATCH',
        `/calendar/events/${tenantAEventId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents modifying other tenant calendar events',
      );
    }
  }
}

// ============================================================================
// ATTACK 4: Cross-Tenant AI Session Access
// ============================================================================

async function attack4_CrossTenantAISessionAccess() {
  logHeader('ATTACK 4: Cross-Tenant AI Session Access');

  // First, Tenant A creates an AI chat session
  let tenantASessionId = '';
  try {
    const response = await axios.post(
      `${BASE_URL}/ai/chat/sessions`,
      { locale: 'en' },
      {
        headers: { Authorization: `Bearer ${TENANT_A_USER.token}` },
      },
    );
    tenantASessionId = response.data.session.id;
    console.log(chalk.green(`✓ Tenant A created AI session: ${tenantASessionId}`));

    // Add a message to the session with sensitive data
    await axios.post(
      `${BASE_URL}/ai/agent`,
      {
        message: 'Store this: API_KEY=sk-secret-tenant-a-12345',
        sessionId: tenantASessionId,
      },
      {
        headers: { Authorization: `Bearer ${TENANT_A_USER.token}` },
      },
    );
  } catch (error) {
    console.log(chalk.yellow('! Could not create test AI session'));
    return;
  }

  // Attack 4.1: Tenant B tries to read Tenant A's AI session
  logAttack(1, 2, 'Tenant B attempts to read Tenant A AI session');
  try {
    const response = await axios.get(`${BASE_URL}/ai/chat/sessions/${tenantASessionId}`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
    });

    if (response.status === 200 && response.data.success && response.data.session) {
      logVulnerable('Tenant B can access Tenant A AI session with messages!');
      recordAttack(
        'Cross-Tenant AI Session Read',
        'GET',
        `/ai/chat/sessions/${tenantASessionId}`,
        false,
        response.data,
        'CRITICAL',
        'User can read AI chat sessions from other tenants (may contain sensitive data)',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.data?.success === false) {
      logBlocked();
      recordAttack(
        'Cross-Tenant AI Session Read',
        'GET',
        `/ai/chat/sessions/${tenantASessionId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents reading other tenant AI sessions',
      );
    }
  }

  // Attack 4.2: Tenant B tries to delete Tenant A's AI session
  logAttack(2, 2, 'Tenant B attempts to delete Tenant A AI session');
  try {
    const response = await axios.delete(`${BASE_URL}/ai/chat/sessions/${tenantASessionId}`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
    });

    if (response.data.success === true) {
      logVulnerable('Tenant B can delete Tenant A AI session!');
      recordAttack(
        'Cross-Tenant AI Session Delete',
        'DELETE',
        `/ai/chat/sessions/${tenantASessionId}`,
        false,
        response.data,
        'CRITICAL',
        'User can delete AI chat sessions from other tenants',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.data?.success === false) {
      logBlocked();
      recordAttack(
        'Cross-Tenant AI Session Delete',
        'DELETE',
        `/ai/chat/sessions/${tenantASessionId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents deleting other tenant AI sessions',
      );
    }
  }
}

// ============================================================================
// ATTACK 5: Cross-Tenant Provider Manipulation (CRITICAL)
// ============================================================================

async function attack5_CrossTenantProviderManipulation() {
  logHeader('ATTACK 5: Cross-Tenant Provider Manipulation');

  // This attack tests if Tenant B can sync/manipulate Tenant A's OAuth providers
  // by guessing provider IDs

  // First, we need to check if Tenant A has any providers
  let tenantAProviderId = '';
  try {
    const response = await axios.get(`${BASE_URL}/providers`, {
      headers: { Authorization: `Bearer ${TENANT_A_USER.token}` },
    });

    if (response.data.length > 0) {
      tenantAProviderId = response.data[0].id;
      console.log(chalk.green(`✓ Tenant A has provider: ${tenantAProviderId}`));
    } else {
      console.log(chalk.yellow('! Tenant A has no providers - skipping this attack'));
      return;
    }
  } catch (error) {
    console.log(chalk.yellow('! Could not fetch Tenant A providers'));
    return;
  }

  // Attack 5.1: Tenant B tries to trigger sync on Tenant A's provider
  logAttack(1, 3, 'Tenant B attempts to sync Tenant A provider (contacts)');
  try {
    const response = await axios.post(
      `${BASE_URL}/contacts/sync/${tenantAProviderId}`,
      {},
      {
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      },
    );

    if (response.status === 200 || response.status === 201) {
      logVulnerable('Tenant B can trigger sync on Tenant A provider! (CRITICAL)');
      recordAttack(
        'Cross-Tenant Provider Sync (Contacts)',
        'POST',
        `/contacts/sync/${tenantAProviderId}`,
        false,
        response.data,
        'CRITICAL',
        'User can trigger contact sync on other tenant providers - may steal data',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Provider Sync (Contacts)',
        'POST',
        `/contacts/sync/${tenantAProviderId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents syncing other tenant providers',
      );
    }
  }

  // Attack 5.2: Tenant B tries to sync Tenant A's calendar
  logAttack(2, 3, 'Tenant B attempts to sync Tenant A provider (calendar)');
  try {
    const response = await axios.post(
      `${BASE_URL}/calendar/sync/${tenantAProviderId}`,
      {},
      {
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      },
    );

    if (response.status === 200 || response.status === 201) {
      logVulnerable('Tenant B can trigger calendar sync on Tenant A provider!');
      recordAttack(
        'Cross-Tenant Provider Sync (Calendar)',
        'POST',
        `/calendar/sync/${tenantAProviderId}`,
        false,
        response.data,
        'CRITICAL',
        'User can trigger calendar sync on other tenant providers',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Provider Sync (Calendar)',
        'POST',
        `/calendar/sync/${tenantAProviderId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents syncing other tenant calendar providers',
      );
    }
  }

  // Attack 5.3: Tenant B tries to delete Tenant A's provider
  logAttack(3, 3, 'Tenant B attempts to delete Tenant A provider');
  try {
    const response = await axios.delete(`${BASE_URL}/providers/${tenantAProviderId}`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
    });

    if (response.status === 200 || response.status === 204) {
      logVulnerable('Tenant B can delete Tenant A provider! (CRITICAL)');
      recordAttack(
        'Cross-Tenant Provider Delete',
        'DELETE',
        `/providers/${tenantAProviderId}`,
        false,
        null,
        'CRITICAL',
        'User can delete providers from other tenants - DoS attack vector',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Provider Delete',
        'DELETE',
        `/providers/${tenantAProviderId}`,
        true,
        error.response?.data,
        'CRITICAL',
        'Tenant isolation prevents deleting other tenant providers',
      );
    }
  }
}

// ============================================================================
// ATTACK 6: Webhook Abuse
// ============================================================================

async function attack6_WebhookAbuse() {
  logHeader('ATTACK 6: Webhook Abuse Attacks');

  // Attack 6.1: Try to trigger webhooks without proper authentication
  logAttack(1, 2, 'Unauthenticated webhook trigger (Google Contacts)');
  try {
    const response = await axios.post(`${BASE_URL}/webhooks/contacts/google/sync`, {
      providerId: 'fake-provider-id',
    });

    if (response.status === 200) {
      logVulnerable('Webhook accepts unauthenticated requests!');
      recordAttack(
        'Unauthenticated Webhook Trigger',
        'POST',
        '/webhooks/contacts/google/sync',
        false,
        response.data,
        'HIGH',
        'Webhook endpoints accept unauthenticated requests',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      logBlocked();
      recordAttack(
        'Unauthenticated Webhook Trigger',
        'POST',
        '/webhooks/contacts/google/sync',
        true,
        error.response?.data,
        'HIGH',
        'Webhook properly requires authentication',
      );
    }
  }

  // Attack 6.2: Try to trigger calendar webhook
  logAttack(2, 2, 'Unauthenticated webhook trigger (Google Calendar)');
  try {
    const response = await axios.post(
      `${BASE_URL}/webhooks/calendar/google/push`,
      {},
      {
        headers: {
          'x-goog-channel-id': 'fake-channel',
          'x-goog-resource-id': 'fake-resource',
        },
      },
    );

    if (response.status === 200) {
      logVulnerable('Calendar webhook accepts unauthenticated requests!');
      recordAttack(
        'Unauthenticated Calendar Webhook',
        'POST',
        '/webhooks/calendar/google/push',
        false,
        response.data,
        'HIGH',
        'Calendar webhook endpoints accept unauthenticated requests',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      logBlocked();
      recordAttack(
        'Unauthenticated Calendar Webhook',
        'POST',
        '/webhooks/calendar/google/push',
        true,
        error.response?.data,
        'HIGH',
        'Calendar webhook properly requires authentication',
      );
    }
  }
}

// ============================================================================
// ATTACK 7: Parameter Injection
// ============================================================================

async function attack7_ParameterInjection() {
  logHeader('ATTACK 7: Parameter Injection Attacks');

  // Attack 7.1: Try to inject tenantId in request body
  logAttack(1, 3, 'Inject tenantId in contact creation');
  try {
    const response = await axios.post(
      `${BASE_URL}/contacts`,
      {
        email: 'injected@test.com',
        firstName: 'Injected',
        lastName: 'Contact',
        tenantId: TENANT_A_USER.tenantId, // Try to inject Tenant A's ID while logged in as Tenant B
      },
      {
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      },
    );

    // Check if the contact was created in Tenant A instead of Tenant B
    if (response.status === 201 && response.data.tenantId === TENANT_A_USER.tenantId) {
      logVulnerable('tenantId injection successful - created contact in different tenant!');
      recordAttack(
        'TenantId Injection (Contact)',
        'POST',
        '/contacts',
        false,
        response.data,
        'CRITICAL',
        'Can inject tenantId to create data in other tenants',
      );
    } else {
      logBlocked();
      recordAttack(
        'TenantId Injection (Contact)',
        'POST',
        '/contacts',
        true,
        null,
        'CRITICAL',
        'Server ignores injected tenantId and uses authenticated user tenant',
      );
    }
  } catch (error: any) {
    // Expected
  }

  // Attack 7.2: Try to inject userId in AI chat
  logAttack(2, 3, 'Inject userId in AI chat session');
  try {
    const response = await axios.post(
      `${BASE_URL}/ai/chat/sessions`,
      {
        locale: 'en',
        userId: 'fake-user-id', // Try to impersonate another user
        tenantId: TENANT_A_USER.tenantId,
      },
      {
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      },
    );

    if (response.data.session.userId !== TENANT_B_USER.token) {
      logVulnerable('userId injection successful!');
      recordAttack(
        'UserId Injection (AI)',
        'POST',
        '/ai/chat/sessions',
        false,
        response.data,
        'CRITICAL',
        'Can inject userId to impersonate other users',
      );
    } else {
      logBlocked();
      recordAttack(
        'UserId Injection (AI)',
        'POST',
        '/ai/chat/sessions',
        true,
        null,
        'CRITICAL',
        'Server ignores injected userId',
      );
    }
  } catch (error: any) {
    // Expected
  }

  // Attack 7.3: Query parameter injection
  logAttack(3, 3, 'Query parameter injection in email list');
  try {
    const response = await axios.get(`${BASE_URL}/emails`, {
      headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      params: {
        tenantId: TENANT_A_USER.tenantId,
        where: JSON.stringify({ tenantId: TENANT_A_USER.tenantId }),
      },
    });

    // Check if we got Tenant A's emails
    if (response.data.length > 0) {
      const firstEmail = response.data[0];
      if (firstEmail.tenantId === TENANT_A_USER.tenantId) {
        logVulnerable('Query parameter injection successful - retrieved other tenant data!');
        recordAttack(
          'Query Parameter Injection',
          'GET',
          '/emails',
          false,
          response.data,
          'CRITICAL',
          'Can inject query parameters to access other tenant data',
        );
      } else {
        logBlocked();
        recordAttack(
          'Query Parameter Injection',
          'GET',
          '/emails',
          true,
          null,
          'CRITICAL',
          'Query parameter injection blocked',
        );
      }
    } else {
      logBlocked();
      recordAttack(
        'Query Parameter Injection',
        'GET',
        '/emails',
        true,
        null,
        'CRITICAL',
        'Query parameter injection blocked',
      );
    }
  } catch (error: any) {
    // Expected
  }
}

// ============================================================================
// ATTACK 8: Bulk Operations Cross-Tenant
// ============================================================================

async function attack8_BulkOperationsCrossTenant() {
  logHeader('ATTACK 8: Bulk Operations Cross-Tenant Attacks');

  // Create some emails for Tenant A
  const tenantAEmailIds: string[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const response = await axios.post(
        `${BASE_URL}/emails/drafts`,
        {
          subject: `Tenant A Email ${i}`,
          body: `Confidential content ${i}`,
          to: ['test@example.com'],
        },
        {
          headers: { Authorization: `Bearer ${TENANT_A_USER.token}` },
        },
      );
      tenantAEmailIds.push(response.data.id);
    }
    console.log(chalk.green(`✓ Created ${tenantAEmailIds.length} test emails for Tenant A`));
  } catch (error) {
    console.log(chalk.yellow('! Could not create test emails'));
    return;
  }

  // Attack 8.1: Tenant B tries to bulk delete Tenant A's emails
  logAttack(1, 2, 'Tenant B attempts bulk delete of Tenant A emails');
  try {
    const response = await axios.delete(
      `${BASE_URL}/emails/bulk`,
      {
        data: { emailIds: tenantAEmailIds },
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      },
    );

    if (response.status === 200) {
      logVulnerable('Tenant B can bulk delete Tenant A emails!');
      recordAttack(
        'Cross-Tenant Bulk Delete',
        'DELETE',
        '/emails/bulk',
        false,
        response.data,
        'CRITICAL',
        'Can bulk delete emails from other tenants',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403 || error.response?.data?.deleted === 0) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Bulk Delete',
        'DELETE',
        '/emails/bulk',
        true,
        error.response?.data,
        'CRITICAL',
        'Bulk delete properly filtered by tenant',
      );
    }
  }

  // Attack 8.2: Tenant B tries to bulk mark Tenant A's emails as read
  logAttack(2, 2, 'Tenant B attempts bulk mark read on Tenant A emails');
  try {
    const response = await axios.patch(
      `${BASE_URL}/emails/bulk/read`,
      {
        emailIds: tenantAEmailIds,
        isRead: true,
      },
      {
        headers: { Authorization: `Bearer ${TENANT_B_USER.token}` },
      },
    );

    if (response.status === 200 && response.data.updated > 0) {
      logVulnerable('Tenant B can bulk modify Tenant A emails!');
      recordAttack(
        'Cross-Tenant Bulk Update',
        'PATCH',
        '/emails/bulk/read',
        false,
        response.data,
        'CRITICAL',
        'Can bulk modify emails from other tenants',
      );
    } else {
      logBlocked();
      recordAttack(
        'Cross-Tenant Bulk Update',
        'PATCH',
        '/emails/bulk/read',
        true,
        response.data,
        'CRITICAL',
        'Bulk update properly filtered by tenant',
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403) {
      logBlocked();
      recordAttack(
        'Cross-Tenant Bulk Update',
        'PATCH',
        '/emails/bulk/read',
        true,
        error.response?.data,
        'CRITICAL',
        'Bulk update blocked by tenant isolation',
      );
    }
  }
}

// ============================================================================
// FINAL REPORT
// ============================================================================

function generateReport() {
  logHeader('TENANT ISOLATION PENETRATION TEST - FINAL REPORT');

  const vulnerabilities = attackResults.filter((r) => !r.blocked);
  const blocked = attackResults.filter((r) => r.blocked);

  const criticalVulns = vulnerabilities.filter((v) => v.severity === 'CRITICAL');
  const highVulns = vulnerabilities.filter((v) => v.severity === 'HIGH');
  const mediumVulns = vulnerabilities.filter((v) => v.severity === 'MEDIUM');
  const lowVulns = vulnerabilities.filter((v) => v.severity === 'LOW');

  console.log(chalk.cyan('SUMMARY:'));
  console.log(chalk.cyan('═'.repeat(80)));
  console.log(chalk.green(`✅ BLOCKED:     ${blocked.length} attacks`));
  console.log(chalk.red(`🚨 VULNERABLE:  ${vulnerabilities.length} attacks`));
  console.log(chalk.blue(`📊 TOTAL:       ${attackResults.length} attacks executed\n`));

  if (vulnerabilities.length > 0) {
    console.log(chalk.red('\n🚨 VULNERABILITIES FOUND:\n'));
    console.log(chalk.red(`  CRITICAL: ${criticalVulns.length}`));
    console.log(chalk.red(`  HIGH:     ${highVulns.length}`));
    console.log(chalk.yellow(`  MEDIUM:   ${mediumVulns.length}`));
    console.log(chalk.yellow(`  LOW:      ${lowVulns.length}\n`));

    console.log(chalk.red('DETAILS:\n'));
    vulnerabilities.forEach((vuln, index) => {
      console.log(chalk.red(`${index + 1}. [${vuln.severity}] ${vuln.attack}`));
      console.log(chalk.white(`   ${vuln.method} ${vuln.endpoint}`));
      console.log(chalk.gray(`   ${vuln.description}\n`));
    });
  }

  // Calculate security score
  const securityScore = Math.round((blocked.length / attackResults.length) * 100);
  console.log(chalk.magenta(`\n🎯 TENANT ISOLATION SECURITY SCORE: ${securityScore}%\n`));

  // Final verdict
  console.log(chalk.cyan('╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║                    FINAL VERDICT                          ║'));
  console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝'));

  if (criticalVulns.length > 0) {
    console.log(chalk.red('\n🚨 CRITICAL VULNERABILITIES FOUND!'));
    console.log(chalk.red('❌ FAIL - TENANT ISOLATION COMPROMISED'));
    console.log(chalk.red('🔴 DO NOT DEPLOY TO PRODUCTION\n'));
    console.log(chalk.yellow('Critical issues must be fixed immediately:'));
    criticalVulns.forEach((v) => {
      console.log(chalk.yellow(`  - ${v.attack}`));
    });
  } else if (highVulns.length > 0) {
    console.log(chalk.yellow('\n⚠️  HIGH SEVERITY ISSUES FOUND'));
    console.log(chalk.yellow('⚠️  CONDITIONAL PASS - Address before production'));
  } else if (vulnerabilities.length > 0) {
    console.log(chalk.green('\n✅ PASS - Minor issues found'));
    console.log(chalk.green('Tenant isolation is secure, but consider addressing:'));
    vulnerabilities.forEach((v) => {
      console.log(chalk.yellow(`  - ${v.attack}`));
    });
  } else {
    console.log(chalk.green('\n✅ EXCELLENT - ALL ATTACKS BLOCKED!'));
    console.log(chalk.green('🚀 TENANT ISOLATION IS SECURE'));
    console.log(chalk.green('✅ READY FOR PRODUCTION\n'));
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log(chalk.cyan.bold('\n' + '█'.repeat(80)));
  console.log(chalk.cyan.bold('█' + ' '.repeat(78) + '█'));
  console.log(
    chalk.cyan.bold('█') +
      chalk.white.bold('        TENANT ISOLATION PENETRATION TEST - HACKER MODE         ') +
      chalk.cyan.bold('█'),
  );
  console.log(chalk.cyan.bold('█' + ' '.repeat(78) + '█'));
  console.log(chalk.cyan.bold('█'.repeat(80)));

  try {
    await setupTestUsers();

    await attack1_CrossTenantEmailAccess();
    await attack2_CrossTenantContactAccess();
    await attack3_CrossTenantCalendarAccess();
    await attack4_CrossTenantAISessionAccess();
    await attack5_CrossTenantProviderManipulation();
    await attack6_WebhookAbuse();
    await attack7_ParameterInjection();
    await attack8_BulkOperationsCrossTenant();

    generateReport();
  } catch (error: any) {
    console.error(chalk.red('\n❌ Test suite failed with error:'));
    console.error(chalk.red(error.message));
    if (error.response) {
      console.error(chalk.gray('Response:', JSON.stringify(error.response.data, null, 2)));
    }
    process.exit(1);
  }
}

main();
