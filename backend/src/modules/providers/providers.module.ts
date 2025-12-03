import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CryptoService } from '../../common/services/crypto.service';
import { EmailSyncModule } from '../email-sync/email-sync.module';
import { EmailModule } from '../email/email.module';
import { CalendarModule } from '../calendar/calendar.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AiModule } from '../ai/ai.module';

// Services
import { GoogleOAuthService } from './services/google-oauth.service';
import { MicrosoftOAuthService } from './services/microsoft-oauth.service';
import { OAuthStateService } from './services/oauth-state.service';
import { ImapService } from './services/imap.service';
import { CalDavService } from './services/caldav.service';
import { ProviderConfigService } from './services/provider-config.service';
import { AuthDebugMiddleware } from '../../common/middleware/auth-debug.middleware';

// Controllers
import { ProvidersController } from './controllers/providers.controller';
import { OAuthCallbackController } from './controllers/oauth-callback.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => EmailSyncModule),
    forwardRef(() => EmailModule),
    forwardRef(() => AiModule),
    forwardRef(() => CalendarModule),
    forwardRef(() => ContactsModule),
  ],
  providers: [
    // Common services
    CryptoService,

    // OAuth security services
    OAuthStateService,

    // Provider-specific services
    GoogleOAuthService,
    MicrosoftOAuthService,
    ImapService,
    CalDavService,
    ProviderConfigService,
  ],
  controllers: [ProvidersController, OAuthCallbackController],
  exports: [
    CryptoService,
    OAuthStateService,
    GoogleOAuthService,
    MicrosoftOAuthService,
    ImapService,
    CalDavService,
    ProviderConfigService,
  ],
})
export class ProvidersModule {
  configure(consumer: any) {
    if ((process.env.DEBUG_AUTH_LOG || '').toLowerCase() === 'true') {
      consumer.apply(AuthDebugMiddleware).forRoutes(ProvidersController);
    }
  }
}
