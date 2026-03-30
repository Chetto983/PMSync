// Public API
export { IMAPDriver } from './imap.driver';

// Internal services (exported for testing and DI)
export { ImapConnectionPoolService } from './services/imap-connection-pool.service';
export { ImapFolderService } from './services/imap-folder.service';
export { ImapMessageService } from './services/imap-message.service';
export { ImapIdleService } from './services/imap-idle.service';
export { ImapSendService } from './services/imap-send.service';

// Error hierarchy (T-1401)
export * from './imap-errors';

// Internal interfaces (exported for testing)
export * from './interfaces/imap-internal.interface';
