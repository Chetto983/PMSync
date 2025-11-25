/**
 * Test Bidirectional Sync with Real Providers
 *
 * This script tests:
 * 1. Calendar: Create, Update, Delete events → syncs to Google/Microsoft
 * 2. Contacts: Create, Update, Delete contacts → syncs to Google/Microsoft
 *
 * Prerequisites:
 * - Backend running on localhost:3001
 * - At least one Google or Microsoft provider connected
 * - Valid auth token
 *
 * Usage:
 * node scripts/test-bidirectional-sync.js <auth-token>
 */

const API_BASE = 'http://localhost:3001/api';

async function makeRequest(method, endpoint, token, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json().catch(() => null);

  return { status: response.status, data };
}

async function testCalendarBidirectional(token) {
  console.log('\n📅 === CALENDAR BIDIRECTIONAL SYNC TEST ===\n');

  // 1. Get providers
  console.log('1. Getting providers...');
  const { data: providers } = await makeRequest('GET', '/providers', token);
  const calendarProvider = providers?.find(p => p.supportsCalendar);

  if (!calendarProvider) {
    console.log('❌ No calendar provider found. Please connect Google or Microsoft first.');
    return;
  }

  console.log(`   ✅ Using provider: ${calendarProvider.email} (${calendarProvider.providerType})`);

  // 2. Create a test event
  console.log('\n2. Creating test event...');
  const testEvent = {
    providerId: calendarProvider.id,
    title: `[TEST] Bidirectional Sync Test - ${new Date().toISOString()}`,
    description: 'This event was created to test bidirectional sync. It should appear in your Google/Microsoft calendar.',
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
    timeZone: 'Europe/Rome',
  };

  const createResult = await makeRequest('POST', '/calendar/events', token, testEvent);

  if (createResult.status !== 201) {
    console.log(`   ❌ Failed to create event: ${JSON.stringify(createResult.data)}`);
    return;
  }

  const createdEvent = createResult.data;
  console.log(`   ✅ Event created: ${createdEvent.id}`);
  console.log(`   📌 External ID: ${createdEvent.externalId}`);
  console.log(`   → Check your ${calendarProvider.providerType} calendar - event should appear!`);

  // 3. Update the event
  console.log('\n3. Updating test event...');
  const updateData = {
    title: `[TEST UPDATED] Bidirectional Sync Test - ${new Date().toISOString()}`,
    description: 'This event was UPDATED via PMSync. The change should reflect in your Google/Microsoft calendar.',
    location: 'Test Location - PMSync Office',
  };

  const updateResult = await makeRequest('PATCH', `/calendar/events/${createdEvent.id}`, token, updateData);

  if (updateResult.status !== 200) {
    console.log(`   ❌ Failed to update event: ${JSON.stringify(updateResult.data)}`);
  } else {
    console.log(`   ✅ Event updated`);
    console.log(`   → Check your ${calendarProvider.providerType} calendar - title/description/location should be updated!`);
  }

  // 4. Wait for user confirmation
  console.log('\n4. Verify in your calendar app, then press Enter to delete the test event...');
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // 5. Delete the event
  console.log('5. Deleting test event...');
  const deleteResult = await makeRequest('DELETE', `/calendar/events/${createdEvent.id}`, token);

  if (deleteResult.status !== 204) {
    console.log(`   ❌ Failed to delete event: ${JSON.stringify(deleteResult.data)}`);
  } else {
    console.log(`   ✅ Event deleted`);
    console.log(`   → Check your ${calendarProvider.providerType} calendar - event should be removed!`);
  }

  console.log('\n📅 Calendar bidirectional sync test complete!\n');
}

async function testContactsBidirectional(token) {
  console.log('\n👥 === CONTACTS BIDIRECTIONAL SYNC TEST ===\n');

  // 1. Get providers
  console.log('1. Getting providers...');
  const { data: providers } = await makeRequest('GET', '/providers', token);
  const contactsProvider = providers?.find(p => p.supportsContacts);

  if (!contactsProvider) {
    console.log('❌ No contacts provider found. Please connect Google or Microsoft first.');
    return;
  }

  console.log(`   ✅ Using provider: ${contactsProvider.email} (${contactsProvider.providerType})`);

  // 2. Create a test contact
  console.log('\n2. Creating test contact...');
  const testContact = {
    providerId: contactsProvider.id,
    firstName: 'PMSync',
    lastName: `Test-${Date.now()}`,
    displayName: `PMSync Test Contact ${new Date().toISOString()}`,
    emails: [{ value: `pmsync-test-${Date.now()}@example.com`, type: 'work', primary: true }],
    phoneNumbers: [{ value: '+1234567890', type: 'mobile', primary: true }],
    company: 'PMSync Test Company',
    jobTitle: 'Bidirectional Sync Tester',
    notes: 'This contact was created to test bidirectional sync. It should appear in your Google/Microsoft contacts.',
  };

  const createResult = await makeRequest('POST', '/contacts', token, testContact);

  if (createResult.status !== 201) {
    console.log(`   ❌ Failed to create contact: ${JSON.stringify(createResult.data)}`);
    return;
  }

  const createdContact = createResult.data;
  console.log(`   ✅ Contact created: ${createdContact.id}`);
  console.log(`   → Check your ${contactsProvider.providerType} contacts - contact should appear!`);

  // 3. Update the contact
  console.log('\n3. Updating test contact...');
  const updateData = {
    firstName: 'PMSync-UPDATED',
    lastName: `Test-${Date.now()}-UPDATED`,
    company: 'PMSync Test Company - UPDATED',
    jobTitle: 'Senior Bidirectional Sync Tester',
    notes: 'This contact was UPDATED via PMSync. The change should reflect in your Google/Microsoft contacts.',
  };

  const updateResult = await makeRequest('PATCH', `/contacts/${createdContact.id}`, token, updateData);

  if (updateResult.status !== 200) {
    console.log(`   ❌ Failed to update contact: ${JSON.stringify(updateResult.data)}`);
  } else {
    console.log(`   ✅ Contact updated`);
    console.log(`   → Check your ${contactsProvider.providerType} contacts - name/company/title should be updated!`);
  }

  // 4. Wait for user confirmation
  console.log('\n4. Verify in your contacts app, then press Enter to delete the test contact...');
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // 5. Delete the contact
  console.log('5. Deleting test contact...');
  const deleteResult = await makeRequest('DELETE', `/contacts/${createdContact.id}`, token);

  if (deleteResult.status !== 204 && deleteResult.status !== 200) {
    console.log(`   ❌ Failed to delete contact: ${JSON.stringify(deleteResult.data)}`);
  } else {
    console.log(`   ✅ Contact deleted`);
    console.log(`   → Check your ${contactsProvider.providerType} contacts - contact should be removed!`);
  }

  console.log('\n👥 Contacts bidirectional sync test complete!\n');
}

async function main() {
  const token = process.argv[2];

  if (!token) {
    console.log('Usage: node scripts/test-bidirectional-sync.js <auth-token>');
    console.log('\nTo get your auth token:');
    console.log('1. Open PMSync in browser');
    console.log('2. Open DevTools (F12) → Application → Local Storage');
    console.log('3. Find the "token" or "accessToken" key');
    console.log('4. Copy the value and pass it as argument');
    process.exit(1);
  }

  console.log('🔄 PMSync Bidirectional Sync Test');
  console.log('==================================');
  console.log('This will test creating, updating, and deleting:');
  console.log('- Calendar events');
  console.log('- Contacts');
  console.log('');
  console.log('Changes will sync to your real Google/Microsoft account!');
  console.log('');

  try {
    // Test Calendar
    await testCalendarBidirectional(token);

    // Test Contacts
    await testContactsBidirectional(token);

    console.log('\n✅ All bidirectional sync tests completed!');
    console.log('Check your Google/Microsoft apps to verify the sync worked correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }

  process.exit(0);
}

main();
