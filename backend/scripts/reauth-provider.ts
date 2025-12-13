/**
 * Re-authenticate Provider Script
 *
 * For providers with expired/revoked refresh tokens (invalid_grant),
 * this script generates a new OAuth URL for re-authentication.
 *
 * Usage:
 *   npx ts-node scripts/reauth-provider.ts <providerId>
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GoogleOAuthService } from '../src/modules/providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../src/modules/providers/services/microsoft-oauth.service';
import { OAuthStateService } from '../src/modules/providers/services/oauth-state.service';
import { CryptoService } from '../src/common/services/crypto.service';

async function main() {
  const providerId = process.argv[2];

  if (!providerId) {
    console.log('\n=== Re-authenticate Provider ===\n');
    console.log('Usage: npx ts-node scripts/reauth-provider.ts <providerId>\n');
    console.log('This script generates a new OAuth URL for providers with expired tokens.\n');

    // List providers that need re-auth
    console.log('Checking for providers needing re-authentication...\n');

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    const crypto = app.get(CryptoService);
    const googleOAuth = app.get(GoogleOAuthService);

    const providers = await prisma.providerConfig.findMany({
      where: { isActive: true, providerType: { in: ['google', 'microsoft'] } },
      select: { id: true, email: true, providerType: true, tenantId: true, refreshToken: true, refreshTokenEncryptionIv: true },
    });

    console.log(`Found ${providers.length} OAuth providers:\n`);

    for (const provider of providers) {
      let status = '✅ OK';

      if (!provider.refreshToken || !provider.refreshTokenEncryptionIv) {
        status = '❌ NO REFRESH TOKEN';
      } else {
        try {
          const refreshToken = crypto.decrypt(provider.refreshToken, provider.refreshTokenEncryptionIv);

          if (provider.providerType === 'google' && refreshToken) {
            await googleOAuth.refreshAccessToken(refreshToken);
          }
          // Microsoft would need similar check
        } catch (error: any) {
          if (error.message?.includes('Re-authentication required') ||
              error.message?.includes('invalid_grant')) {
            status = '❌ NEEDS RE-AUTH';
          } else {
            status = `⚠️ Error: ${error.message?.substring(0, 50)}`;
          }
        }
      }

      console.log(`  ${provider.providerType.toUpperCase()} ${provider.email}`);
      console.log(`    ID: ${provider.id}`);
      console.log(`    Status: ${status}\n`);
    }

    await app.close();
    return;
  }

  // Generate re-auth URL for specific provider
  console.log(`\n=== Generating Re-auth URL for Provider ${providerId} ===\n`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const googleOAuth = app.get(GoogleOAuthService);
  const microsoftOAuth = app.get(MicrosoftOAuthService);
  const oauthState = app.get(OAuthStateService);

  try {
    const provider = await prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { id: true, email: true, providerType: true, tenantId: true, userId: true },
    });

    if (!provider) {
      console.error(`❌ Provider not found: ${providerId}`);
      await app.close();
      process.exit(1);
    }

    console.log(`Provider: ${provider.email} (${provider.providerType})`);
    console.log(`Tenant: ${provider.tenantId}`);
    console.log(`User: ${provider.userId}\n`);

    let authUrl: string;

    if (provider.providerType === 'google') {
      const { state, pkce } = await oauthState.createState('google', {
        userId: provider.userId!,
        tenantId: provider.tenantId,
      });

      const result = googleOAuth.generateAuthUrl(undefined, {
        state,
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
      });
      authUrl = result.authUrl;

      console.log('=== Google OAuth Re-auth URL ===\n');
      console.log(authUrl);
      console.log('\n1. Open this URL in a browser');
      console.log('2. Login with the account: ' + provider.email);
      console.log('3. Grant permissions');
      console.log('4. You will be redirected back to the app\n');

    } else if (provider.providerType === 'microsoft') {
      const { state, pkce } = await oauthState.createState('microsoft', {
        userId: provider.userId!,
        tenantId: provider.tenantId,
      });

      const result = microsoftOAuth.generateAuthUrl(undefined, {
        state,
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
      });
      authUrl = result.authUrl;

      console.log('=== Microsoft OAuth Re-auth URL ===\n');
      console.log(authUrl);
      console.log('\n1. Open this URL in a browser');
      console.log('2. Login with the account: ' + provider.email);
      console.log('3. Grant permissions');
      console.log('4. You will be redirected back to the app\n');

    } else {
      console.error(`❌ Provider type ${provider.providerType} does not support OAuth re-auth`);
    }

  } finally {
    await app.close();
  }
}

main().catch(console.error);
