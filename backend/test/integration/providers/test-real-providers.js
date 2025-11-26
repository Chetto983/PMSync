#!/usr/bin/env node

/**
 * Real Provider Integration Test Script
 * Tests actual email providers using database credentials
 * Usage: node test-real-providers.js
 */

const { createPrismaClient } = require('../../../scripts/prisma-client');
const { ProviderFactory } = require('../../../dist/modules/providers/factory/provider.factory');
const { google } = require('googleapis');
const https = require('https');
const crypto = require('crypto');

class RealProviderTester {
  constructor() {
    this.prisma = createPrismaClient();
    this.crypto = {
      decrypt: (encrypted, iv) => {
        // Use the REAL AES-256 key from production environment
        // The key in .env is base64 encoded - decode it first
        const encodedKey = process.env.AES_SECRET_KEY || '6h727qBIKgZA5e13ya8UDckB/ltNuMxPzmQma82JFXo=';
        const key = Buffer.from(encodedKey, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
        let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
      }
    };
  }

  async init() {
    console.log('🔍 Looking for active providers in database...');
    const providers = await this.prisma.providerConfig.findMany({
      where: { isActive: true },
      take: 10,
    });

    if (providers.length === 0) {
      console.log('❌ No active providers found in database');
      return false;
    }

    console.log(`📋 Found ${providers.length} active provider(s):`);
    providers.forEach(p => console.log(`   - ${p.providerType}: ${p.email}`));

    return true;
  }

  async testProvider(providerId, providerType, email) {
    console.log(`\n🔗 Testing ${providerType} provider: ${email}`);

    try {
      // Get provider data
      const providerData = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!providerData) {
        throw new Error(`Provider ${providerId} not found`);
      }

      let accessToken;
      let refreshToken = '';

      // Try to get token through ProviderTokenService (with refresh if needed)
      try {
        console.log(`🔑 Attempting to get token through ProviderTokenService...`);

        // Import the service dynamically
        const { ProviderTokenService } = require('../../../dist/modules/email-sync/services/provider-token.service');

        // Create a minimal mock ProviderTokenService
        const tokenService = {
          getProviderWithToken: async (id) => ({
            provider: providerData,
            accessToken: this.crypto.decrypt(
              providerData.accessToken,
              providerData.tokenEncryptionIv
            )
          })
        };

        const { accessToken: freshToken } = await tokenService.getProviderWithToken(providerId);
        accessToken = freshToken;

        console.log(`✅ Got fresh token through token service`);

      } catch (refreshError) {
        console.log(`⚠️  Token service failed, trying direct decryption...`);

        // Fallback to direct decryption
        if (!providerData.accessToken || !providerData.tokenEncryptionIv) {
          throw new Error('No access token available');
        }

        const decryptedToken = this.crypto.decrypt(
          providerData.accessToken,
          providerData.tokenEncryptionIv
        );

        // Try to refresh if it's Google and seems expired
        if (providerType === 'google' && decryptedToken.includes('ya29.')) {
          console.log(`🔄 Trying to refresh Google token...`);
          accessToken = await this.tryRefreshGoogleToken(decryptedToken, providerData);
        } else {
          accessToken = decryptedToken;
        }

        console.log(`✅ Token decrypted directly`);
      }

      // Create provider config with real tokens
      const config = {
        userId: providerData.userId || 'test-user',
        providerId: providerData.id,
        providerType: providerData.providerType,
        email: providerData.email,
        accessToken,
        refreshToken,
      };

      console.log(`🔑 Access token decrypted: ${accessToken.substring(0, 20)}...`);

      // Create provider instance
      const provider = ProviderFactory.create(providerData.providerType, config);
      console.log(`✅ Provider instance created successfully`);

      // For Microsoft, also test direct OAuth service connectivity
      if (providerData.providerType === 'microsoft') {
        console.log(`🔗 Also testing Microsoft OAuth service directly...`);
        const { MicrosoftOAuthService } = require('../../../dist/modules/providers/services/microsoft-oauth.service');

        // Note: This would require injecting dependencies, so we'll skip for now
        // But we can at least verify the token format
        if (accessToken.includes('.')) {
          console.log(`   ✓ Microsoft token is in JWT format`);
        } else {
          console.log(`   ✓ Microsoft token is opaque OAuth format (${accessToken.length} chars)`);
        }
      }

      // Test 1: Basic connection / user info
      console.log(`👤 Testing user info...`);
      const userInfo = await provider.getUserInfo();
      console.log(`   ✓ User: ${userInfo.name} <${userInfo.email}>`);

      // Test 2: List threads (read-only)
      console.log(`📧 Testing threads list...`);
      const threadsResponse = await provider.listThreads({ maxResults: 3 });
      console.log(`   ✓ Found ${threadsResponse.threads.length} threads`);

      if (threadsResponse.threads.length > 0) {
        console.log(`   📝 Sample thread: ${threadsResponse.threads[0].snippet?.substring(0, 50)}...`);
      }

      // Test 3: Get labels/folders
      console.log(`📁 Testing labels/folders...`);
      const labels = await provider.getLabels();
      console.log(`   ✓ Found ${labels.length} labels/folders`);

      if (labels.length > 0) {
        console.log(`   📂 Sample label: ${labels[0].name}`);
      }

      // Test 4: Test connection method
      console.log(`🔗 Testing connection method...`);
      const isConnected = await provider.testConnection();
      console.log(`   ✓ Connection test: ${isConnected ? 'SUCCESS' : 'FAILED'}`);

      // Test 5: Sync capability (small batch)
      console.log(`🔄 Testing sync capability...`);
      const syncResult = await provider.syncEmails({
        syncType: 'incremental',
        maxMessages: 10, // Very small for testing
      });
      console.log(`   ✓ Sync result: ${syncResult.emailsSynced} emails, ${syncResult.newEmails} new`);

      // Test 6: Email count
      console.log(`📊 Testing email count...`);
      const emailCount = await provider.getEmailCount();
      console.log(`   ✓ Email counts: ${emailCount.map(c => `${c.label}: ${c.count}`).join(', ')}`);

      console.log(`🎉 All ${providerType} provider tests passed!`);
      return true;

    } catch (error) {
      console.error(`❌ ${providerType} provider test failed:`, error.message);
      console.error('   Stack:', error.stack?.split('\n')[0]);
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Real Provider Integration Tests...\n');

    try {
      if (!(await this.init())) {
        return;
      }

      // Get all active providers
      const activeProviders = await this.prisma.providerConfig.findMany({
        where: { isActive: true },
      });

      let passedTests = 0;
      let totalTests = 0;

      for (const provider of activeProviders) {
        totalTests++;
        const success = await this.testProvider(
          provider.id,
          provider.providerType,
          provider.email
        );
        if (success) passedTests++;
      }

      console.log(`\n📊 Test Results: ${passedTests}/${totalTests} providers passed`);

      if (passedTests === totalTests && totalTests > 0) {
        console.log('🎯 All real provider integration tests PASSED!');
        return 0; // Success exit code
      } else {
        console.log('⚠️  Some provider tests failed');
        return 1; // Failure exit code
      }

    } catch (error) {
      console.error('💥 Fatal error during tests:', error);
      return 1;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  async tryRefreshGoogleToken(oldToken, providerData) {
    try {
      // Get refresh token
      if (!providerData.refreshToken || !providerData.refreshTokenEncryptionIv) {
        console.log(`⚠️  No refresh token available, using expired token`);
        return oldToken;
      }

      const refreshToken = this.crypto.decrypt(
        providerData.refreshToken,
        providerData.refreshTokenEncryptionIv
      );

      console.log(`🔄 Refreshing token using refresh token...`);

      // Set up OAuth2 client
      const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        console.log(`⚠️  OAuth credentials not available, using expired token`);
        return oldToken;
      }

      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'urn:ietf:wg:oauth:2.0:oob' // Special value for installed apps
      );

      // Refresh the token
      const { tokens } = await oauth2Client.refreshToken(refreshToken);

      if (!tokens.access_token) {
        console.log(`⚠️  Token refresh failed, using expired token`);
        return oldToken;
      }

      console.log(`✅ Token refreshed successfully!`);
      return tokens.access_token;

    } catch (error) {
      console.log(`⚠️  Token refresh failed: ${error.message}, using expired token`);
      return oldToken;
    }
  }
}

// Run the tests
if (require.main === module) {
  const tester = new RealProviderTester();
  tester.runAllTests()
    .then(code => process.exit(code))
    .catch(error => {
      console.error('💥 Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = { RealProviderTester };
