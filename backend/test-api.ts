/**
 * API Test Script for MailAgent
 * Tests provider bidirectionality and all API endpoints
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const TOKEN = process.env.TEST_TOKEN || '';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function testProviders() {
  console.log('\n📧 Testing Providers...');
  try {
    const response = await api.get('/providers');
    console.log('✅ Providers:', response.data.length, 'found');
    return response.data;
  } catch (error: any) {
    console.error('❌ Providers error:', error.response?.data || error.message);
    return [];
  }
}

async function testEmailStats() {
  console.log('\n📊 Testing Email Stats...');
  try {
    const response = await api.get('/emails/stats');
    console.log('✅ Email Stats:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Email Stats error:', error.response?.data || error.message);
  }
}

async function testEmailList(providerId?: string) {
  console.log(`\n📬 Testing Email List${providerId ? ` for provider ${providerId}` : ''}...`);
  try {
    const params = providerId ? { providerId, limit: 10 } : { limit: 10 };
    const response = await api.get('/emails', { params });
    console.log('✅ Emails:', response.data.pagination?.total, 'total,', response.data.emails?.length, 'returned');
    return response.data.emails;
  } catch (error: any) {
    console.error('❌ Email List error:', error.response?.data || error.message);
    return [];
  }
}

async function testThreadDisplay(threadId: string) {
  console.log(`\n🧵 Testing Thread ${threadId}...`);
  try {
    const response = await api.get(`/emails/thread/${encodeURIComponent(threadId)}`);
    console.log('✅ Thread emails:', response.data.length);
    return response.data;
  } catch (error: any) {
    console.error('❌ Thread error:', error.response?.data || error.message);
    return [];
  }
}

async function testConversations() {
  console.log('\n💬 Testing Conversations (grouped threads)...');
  try {
    const response = await api.get('/emails/conversations', { params: { limit: 10 } });
    console.log('✅ Conversations:', response.data.pagination?.total, 'total');
    return response.data.conversations;
  } catch (error: any) {
    console.error('❌ Conversations error:', error.response?.data || error.message);
    return [];
  }
}

async function testFolders(providerId: string) {
  console.log(`\n📁 Testing Folders for provider ${providerId}...`);
  try {
    const response = await api.get(`/folders/${providerId}`);
    console.log('✅ Folders:', response.data.length);
    return response.data;
  } catch (error: any) {
    console.error('❌ Folders error:', error.response?.data || error.message);
    return [];
  }
}

async function testSync(providerId: string) {
  console.log(`\n🔄 Testing Sync for provider ${providerId}...`);
  try {
    const response = await api.post(`/email-sync/sync/${providerId}`);
    console.log('✅ Sync started:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Sync error:', error.response?.data || error.message);
  }
}

async function testLabels() {
  console.log('\n🏷️ Testing Labels...');
  try {
    const response = await api.get('/labels');
    console.log('✅ Labels:', response.data.length);
    return response.data;
  } catch (error: any) {
    console.error('❌ Labels error:', error.response?.data || error.message);
    return [];
  }
}

async function testContacts() {
  console.log('\n👥 Testing Contacts...');
  try {
    const response = await api.get('/contacts', { params: { limit: 10 } });
    console.log('✅ Contacts:', response.data.pagination?.total || response.data.length);
    return response.data;
  } catch (error: any) {
    console.error('❌ Contacts error:', error.response?.data || error.message);
    return [];
  }
}

async function testCalendar() {
  console.log('\n📅 Testing Calendar...');
  try {
    const response = await api.get('/calendar/events', { params: { limit: 10 } });
    console.log('✅ Calendar events:', response.data.length);
    return response.data;
  } catch (error: any) {
    console.error('❌ Calendar error:', error.response?.data || error.message);
    return [];
  }
}

async function testAIFeatures(emailId: string) {
  console.log(`\n🤖 Testing AI Features for email ${emailId}...`);

  // Test summarize
  try {
    const summary = await api.post(`/ai/summarize/${emailId}`, { locale: 'en' });
    console.log('✅ AI Summary:', summary.data.summary?.substring(0, 100) + '...');
  } catch (error: any) {
    console.error('❌ AI Summary error:', error.response?.data || error.message);
  }

  // Test smart reply
  try {
    const replies = await api.post(`/ai/smart-reply/${emailId}`, { locale: 'en' });
    console.log('✅ Smart Replies:', replies.data.replies?.length, 'suggestions');
  } catch (error: any) {
    console.error('❌ Smart Reply error:', error.response?.data || error.message);
  }

  // Test categorize
  try {
    const categories = await api.post(`/ai/categorize/${emailId}`);
    console.log('✅ Categories:', categories.data.categories?.length);
  } catch (error: any) {
    console.error('❌ Categorize error:', error.response?.data || error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Starting MailAgent API Tests...\n');
  console.log('================================');

  // Test providers
  const providers = await testProviders();

  // Test email stats
  await testEmailStats();

  // Test labels
  await testLabels();

  // Test contacts
  await testContacts();

  // Test calendar
  await testCalendar();

  // Test conversations
  const conversations = await testConversations();

  // Test emails for each provider
  for (const provider of providers) {
    console.log(`\n--- Provider: ${provider.email} (${provider.providerType}) ---`);

    // Test folders
    await testFolders(provider.id);

    // Test email list
    const emails = await testEmailList(provider.id);

    // Test thread for first email with threadId
    const emailWithThread = emails.find((e: any) => e.threadId);
    if (emailWithThread) {
      await testThreadDisplay(emailWithThread.threadId);
    }

    // Test AI features for first email
    if (emails.length > 0) {
      await testAIFeatures(emails[0].id);
    }
  }

  console.log('\n================================');
  console.log('🏁 Tests completed!');
}

// Run tests
runAllTests().catch(console.error);
