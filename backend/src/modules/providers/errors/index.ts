export {
  GoogleProviderError,
  GoogleAuthError,
  GoogleRateLimitError,
  GoogleSyncError,
  GoogleApiError,
  isGoogleProviderError,
} from './google-provider.error';
export type { GoogleErrorRecovery } from './google-provider.error';

export {
  MicrosoftProviderError,
  MicrosoftAuthError,
  MicrosoftRateLimitError,
  MicrosoftSyncError,
  MicrosoftApiError,
  isMicrosoftProviderError,
} from './microsoft-provider.error';
export type { MicrosoftErrorRecovery } from './microsoft-provider.error';
