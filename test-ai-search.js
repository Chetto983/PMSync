/**
 * Test script for AI semantic search
 *
 * Tests:
 * 1. Basic AI search query
 * 2. Natural language questions
 * 3. Search result quality
 *
 * Usage:
 *   node test-ai-search.js
 *
 * Prerequisites:
 *   - Backend server running on http://localhost:3000
 *   - Valid JWT token (update TOKEN constant below)
 *   - Knowledge base populated with email embeddings
 *   - AI service (Mistral) configured
 */

const fetch = require('node-fetch');

// Configuration
const API_BASE = 'http://localhost:3000';
const TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Replace with valid token

// Test queries
const TEST_QUERIES = [
  'Show me urgent emails from last week',
  'Find emails about invoice payments',
  'Emails discussing project deadlines',
  'Messages from John about the meeting',
  'Important emails I need to respond to',
];

// Helper function to search knowledge base
async function searchAI(query) {
  const url = `${API_BASE}/ai/memory/search`;
  console.log(`\n🤖 Query: "${query}"`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit: 5 }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Helper to print results
function printResults(data) {
  console.log(`   Query used: "${data.usedQuery}"`);
  console.log(`   Results found: ${data.items.length}`);

  if (data.items.length > 0) {
    console.log(`   Top results:`);
    data.items.forEach((item, i) => {
      const score = item.score !== null ? `${Math.round(item.score * 100)}%` : 'N/A';
      console.log(`     ${i + 1}. [${score}] ${item.subject || '(no subject)'}`);
      console.log(`        From: ${item.from || 'Unknown'}`);
      if (item.receivedAt) {
        console.log(`        Date: ${new Date(item.receivedAt).toLocaleDateString()}`);
      }
      console.log(`        Snippet: ${item.snippet.substring(0, 100)}...`);
      console.log(`        Email ID: ${item.emailId}`);
    });
  } else {
    console.log('   ⚠️  No results found');
  }
}

// Analyze result quality
function analyzeResultQuality(query, data) {
  const items = data.items;

  if (items.length === 0) {
    console.log(`   ❌ No results returned`);
    return;
  }

  // Check if results have good relevance scores
  const avgScore = items.reduce((sum, item) => sum + (item.score || 0), 0) / items.length;
  console.log(`   📊 Average relevance score: ${Math.round(avgScore * 100)}%`);

  if (avgScore > 0.7) {
    console.log(`   ✅ High quality results`);
  } else if (avgScore > 0.5) {
    console.log(`   ⚠️  Medium quality results`);
  } else {
    console.log(`   ❌ Low quality results (might need better embeddings)`);
  }

  // Check for diversity in results
  const uniqueSenders = new Set(items.map(item => item.from).filter(Boolean));
  console.log(`   📧 Unique senders in results: ${uniqueSenders.size}`);

  // Check date range
  const dates = items.map(item => item.receivedAt).filter(Boolean).map(d => new Date(d));
  if (dates.length > 0) {
    const oldest = new Date(Math.min(...dates));
    const newest = new Date(Math.max(...dates));
    console.log(`   📅 Date range: ${oldest.toLocaleDateString()} to ${newest.toLocaleDateString()}`);
  }
}

// Test specific query types
async function testUrgentEmails() {
  console.log('\n' + '─'.repeat(70));
  console.log('Test: Finding urgent emails');
  console.log('─'.repeat(70));

  const data = await searchAI('urgent emails that need immediate attention');
  printResults(data);
  analyzeResultQuality('urgent', data);
}

async function testTopicSearch() {
  console.log('\n' + '─'.repeat(70));
  console.log('Test: Topic-based search');
  console.log('─'.repeat(70));

  const data = await searchAI('emails about budget and financial planning');
  printResults(data);
  analyzeResultQuality('budget', data);
}

async function testSenderAndTopic() {
  console.log('\n' + '─'.repeat(70));
  console.log('Test: Sender + topic combination');
  console.log('─'.repeat(70));

  const data = await searchAI('emails from Sarah about the quarterly report');
  printResults(data);
  analyzeResultQuality('sender+topic', data);
}

async function testTimeBasedQuery() {
  console.log('\n' + '─'.repeat(70));
  console.log('Test: Time-based query');
  console.log('─'.repeat(70));

  const data = await searchAI('recent emails from this week');
  printResults(data);
  analyzeResultQuality('time-based', data);
}

// Main test runner
async function runTests() {
  console.log('='.repeat(70));
  console.log('  AI Semantic Search Test Suite');
  console.log('='.repeat(70));

  if (TOKEN === 'YOUR_JWT_TOKEN_HERE') {
    console.error('\n❌ Error: Please update the TOKEN constant with a valid JWT token');
    console.log('   You can get a token by logging into the frontend and copying it from');
    console.log('   localStorage (key: "auth-storage") or from the Network tab in DevTools');
    process.exit(1);
  }

  try {
    // Run predefined test queries
    for (const query of TEST_QUERIES) {
      console.log('\n' + '─'.repeat(70));
      const data = await searchAI(query);
      printResults(data);
      analyzeResultQuality(query, data);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
    }

    // Run specific tests
    await testUrgentEmails();
    await testTopicSearch();
    await testSenderAndTopic();
    await testTimeBasedQuery();

    console.log('\n' + '='.repeat(70));
    console.log('  ✅ All AI search tests completed!');
    console.log('='.repeat(70));
    console.log('\n💡 Tips:');
    console.log('   - If results are poor, check if embeddings are up to date');
    console.log('   - Run backfill: POST /ai/knowledge-base/emails/backfill');
    console.log('   - Check AI service configuration (Mistral API)');
    console.log('   - Ensure emails have sufficient content for embeddings');

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
