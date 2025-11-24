/**
 * Test script for new email filters
 *
 * Tests:
 * 1. Filter by recipient (to)
 * 2. Filter by subject
 * 3. Filter by labels (labelIds)
 * 4. Combination of filters
 *
 * Usage:
 *   node test-email-filters.js
 *
 * Prerequisites:
 *   - Backend server running on http://localhost:3000
 *   - Valid JWT token (update TOKEN constant below)
 *   - Some test data in the database
 */

const fetch = require('node-fetch');

// Configuration
const API_BASE = 'http://localhost:3000';
const TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Replace with valid token

// Helper function to make API requests
async function fetchEmails(params = {}) {
  const queryParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.append(key, value.toString());
    }
  });

  const url = `${API_BASE}/emails?${queryParams.toString()}`;
  console.log(`\n🔍 Testing: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// Helper to print results
function printResults(testName, data) {
  console.log(`\n✅ ${testName}`);
  console.log(`   Total emails: ${data.pagination.total}`);
  console.log(`   Returned: ${data.emails.length}`);

  if (data.emails.length > 0) {
    console.log(`   Sample results:`);
    data.emails.slice(0, 3).forEach((email, i) => {
      console.log(`     ${i + 1}. ${email.subject || '(no subject)'}`);
      console.log(`        From: ${email.from}`);
      console.log(`        To: ${email.to.join(', ')}`);
      if (email.emailLabels && email.emailLabels.length > 0) {
        console.log(`        Labels: ${email.emailLabels.map(el => el.label.name).join(', ')}`);
      }
    });
  }
}

// Test functions
async function testRecipientFilter() {
  const data = await fetchEmails({ to: 'example@gmail.com' });
  printResults('Filter by recipient (to)', data);

  // Verify all results have the recipient
  const allMatch = data.emails.every(email =>
    email.to.some(recipient => recipient.includes('example@gmail.com'))
  );

  if (!allMatch) {
    console.log('   ⚠️  Warning: Some results do not match the "to" filter');
  } else {
    console.log('   ✓ All results match the filter');
  }
}

async function testSubjectFilter() {
  const data = await fetchEmails({ subject: 'meeting' });
  printResults('Filter by subject', data);

  // Verify all results have "meeting" in subject
  const allMatch = data.emails.every(email =>
    email.subject && email.subject.toLowerCase().includes('meeting')
  );

  if (!allMatch) {
    console.log('   ⚠️  Warning: Some results do not match the "subject" filter');
  } else {
    console.log('   ✓ All results match the filter');
  }
}

async function testLabelFilter(labelId) {
  const data = await fetchEmails({ labelIds: labelId });
  printResults(`Filter by label (${labelId})`, data);

  // Verify all results have the label
  const allMatch = data.emails.every(email =>
    email.emailLabels && email.emailLabels.some(el => el.label.id === labelId)
  );

  if (!allMatch) {
    console.log('   ⚠️  Warning: Some results do not have the specified label');
  } else {
    console.log('   ✓ All results have the label');
  }
}

async function testMultipleLabelFilter(labelIds) {
  const data = await fetchEmails({ labelIds: labelIds.join(',') });
  printResults(`Filter by multiple labels (${labelIds.join(', ')})`, data);

  // Verify all results have at least one of the labels
  const allMatch = data.emails.every(email =>
    email.emailLabels && email.emailLabels.some(el => labelIds.includes(el.label.id))
  );

  if (!allMatch) {
    console.log('   ⚠️  Warning: Some results do not have any of the specified labels');
  } else {
    console.log('   ✓ All results have at least one of the labels');
  }
}

async function testCombinedFilters() {
  const data = await fetchEmails({
    from: 'john',
    isRead: 'false',
    hasAttachments: 'true',
  });
  printResults('Combined filters (from + unread + has attachments)', data);

  // Verify all results match all filters
  const allMatch = data.emails.every(email =>
    email.from.toLowerCase().includes('john') &&
    !email.isRead &&
    email.attachments && email.attachments.length > 0
  );

  if (!allMatch) {
    console.log('   ⚠️  Warning: Some results do not match all filters');
  } else {
    console.log('   ✓ All results match all filters');
  }
}

async function testDateRangeWithSubject() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30); // Last 30 days

  const data = await fetchEmails({
    subject: 'report',
    startDate: startDate.toISOString().split('T')[0],
  });
  printResults('Date range + subject filter', data);

  // Verify dates
  const allMatch = data.emails.every(email => {
    const receivedDate = new Date(email.receivedAt);
    return receivedDate >= startDate &&
           email.subject &&
           email.subject.toLowerCase().includes('report');
  });

  if (!allMatch) {
    console.log('   ⚠️  Warning: Some results are outside date range or do not match subject');
  } else {
    console.log('   ✓ All results are within date range and match subject');
  }
}

// Main test runner
async function runTests() {
  console.log('='.repeat(70));
  console.log('  Email Filters Test Suite');
  console.log('='.repeat(70));

  if (TOKEN === 'YOUR_JWT_TOKEN_HERE') {
    console.error('\n❌ Error: Please update the TOKEN constant with a valid JWT token');
    console.log('   You can get a token by logging into the frontend and copying it from');
    console.log('   localStorage (key: "auth-storage") or from the Network tab in DevTools');
    process.exit(1);
  }

  try {
    // Test 1: Recipient filter
    console.log('\n' + '─'.repeat(70));
    console.log('Test 1: Filter by recipient (to)');
    console.log('─'.repeat(70));
    await testRecipientFilter();

    // Test 2: Subject filter
    console.log('\n' + '─'.repeat(70));
    console.log('Test 2: Filter by subject');
    console.log('─'.repeat(70));
    await testSubjectFilter();

    // Test 3: Single label filter
    console.log('\n' + '─'.repeat(70));
    console.log('Test 3: Filter by single label');
    console.log('─'.repeat(70));
    console.log('   Note: Update the labelId in code if needed');
    // await testLabelFilter('your-label-id-here');
    console.log('   ⏭️  Skipped (update labelId in code)');

    // Test 4: Multiple labels filter
    console.log('\n' + '─'.repeat(70));
    console.log('Test 4: Filter by multiple labels');
    console.log('─'.repeat(70));
    console.log('   Note: Update the labelIds in code if needed');
    // await testMultipleLabelFilter(['label-id-1', 'label-id-2']);
    console.log('   ⏭️  Skipped (update labelIds in code)');

    // Test 5: Combined filters
    console.log('\n' + '─'.repeat(70));
    console.log('Test 5: Combined filters');
    console.log('─'.repeat(70));
    await testCombinedFilters();

    // Test 6: Date range + subject
    console.log('\n' + '─'.repeat(70));
    console.log('Test 6: Date range + subject filter');
    console.log('─'.repeat(70));
    await testDateRangeWithSubject();

    console.log('\n' + '='.repeat(70));
    console.log('  ✅ All tests completed!');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run tests
runTests();
