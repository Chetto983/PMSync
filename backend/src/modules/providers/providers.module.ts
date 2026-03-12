import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CryptoService } from '../../common/services/crypto.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { CRYPTO_SERVICE } from '../../common/interfaces/crypto.interface';

// Services
import { GoogleOAuthService } from './services/google-oauth.service';
import { MicrosoftOAuthService } from './services/microsoft-oauth.service';
import { OAuthStateService } from './services/oauth-state.service';
import { ImapService } from './services/imap.service';
import { CalDavService } from './services/caldav.service';
import { ProviderConfigService } from './services/provider-config.service';
import { GmailClientManagerService } from './services/gmail-client-manager.service';
import { AuthDebugMiddleware } from '../../common/middleware/auth-debug.middleware';

// Controllers
import { ProvidersController } from './controllers/providers.controller';

/**
 * ProvidersModule - OAuth, IMAP, CalDAV provider management.
 *
 * Phase 32: All forwardRef to domain modules eliminated.
 * - ProviderConnectedEvent replaces direct triggerInitialSync (consumed by EmailSync, Calendar)
 * - ProviderDisconnectedEvent replaces direct cleanup calls (consumed by EmailSync, Calendar, Contacts, Ai)
 * - CRYPTO_SERVICE symbol exported for interface injection
 */
@Module({
  imports: [
    PrismaModule,
    SubscriptionModule,
    // Phase 32: No forwardRef imports to domain modules.
    // EventEmitterModule is globally available via AppModule.
  ],
  providers: [
    // Common services
    CryptoService,

    // Phase 32: Interface injection providers
    { provide: CRYPTO_SERVICE, useExisting: CryptoService },

    // OAuth security services
    OAuthStateService,

    // Provider-specific services
    GoogleOAuthService,
    MicrosoftOAuthService,
    ImapService,
    CalDavService,
    ProviderConfigService,
    GmailClientManagerService,
  ],
  controllers: [ProvidersController],
  exports: [
    CryptoService,
    CRYPTO_SERVICE, // Phase 32: Symbol export for interface injection
    OAuthStateService,
    GoogleOAuthService,
    MicrosoftOAuthService,
    ImapService,
    CalDavService,
    ProviderConfigService,
    GmailClientManagerService,
  ],
})
export class ProvidersModule {
  configure(consumer: any) {
    if ((process.env.DEBUG_AUTH_LOG || '').toLowerCase() === 'true') {
      consumer.apply(AuthDebugMiddleware).forRoutes(ProvidersController);
    }
  }
}
