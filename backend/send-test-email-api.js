/**
 * API-based Email Send Test
 * Tests the migrated EmailSendService via HTTP API
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function getProviders() {
  try {
    const response = await axios.get(`${BASE_URL}/api/providers`, {
      headers: {
        'Content-Type': 'application/json',
        // Add auth token if needed
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching providers:', error.message);
    return [];
  }
}

async function sendTestEmail(providerId, tenantId, email) {
  const emailData = {
    tenantId,
    providerId,
    to: [email],
    subject: `EmailSendService Migration Test - ${new Date().toISOString()}`,
    bodyHtml: `
      <html>
        <body>
          <h2>✅ Email Send Service Migration Test</h2>
          <p>This email was sent using the new <strong>EmailDriverFactory</strong> pattern.</p>
          <ul>
            <li>Provider: ${email}</li>
            <li>Driver Pattern: ✅ New driver-only architecture</li>
            <li>Legacy Factory: ❌ Removed</li>
          </ul>
          <p><em>Timestamp: ${new Date().toISOString()}</em></p>
        </body>
      </html>
    `,
    bodyText: `Email Send Service Migration Test - Timestamp: ${new Date().toISOString()}`,
  };

  try {
    const response = await axios.post(`${BASE_URL}/api/emails/send`, emailData, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

async function main() {
  console.log('🚀 Starting Email Send API Test...\n');
  console.log('Testing migrated EmailSendService with EmailDriverFactory\n');
  console.log('='.repeat(70) + '\n');

  // For now, let's manually specify test data
  // In production, you would fetch this from the API or database
  const testProviders = [
    // Add your provider IDs here - example:
    // { id: 'provider-id-1', tenantId: 'tenant-1', email: 'test@gmail.com', type: 'google' },
    // { id: 'provider-id-2', tenantId: 'tenant-1', email: 'test@outlook.com', type: 'microsoft' },
  ];

  if (testProviders.length === 0) {
    console.log('⚠️  No test providers configured');
    console.log('   Please add provider IDs to the testProviders array in this script\n');
    console.log('   Example:');
    console.log('   { id: "your-provider-id", tenantId: "your-tenant-id", email: "your@email.com", type: "google" }');
    console.log('');
    return;
  }

  for (const provider of testProviders) {
    console.log(`📧 Testing ${provider.type.toUpperCase()} - ${provider.email}...`);

    const result = await sendTestEmail(provider.id, provider.tenantId, provider.email);

    if (result.success) {
      console.log(`✅ SUCCESS`);
      console.log(`   Message ID: ${result.data.messageId || 'N/A'}`);
    } else {
      console.log(`❌ FAILED`);
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  }

  console.log('='.repeat(70));
  console.log('✨ Test complete!\n');
}

main().catch(console.error);
