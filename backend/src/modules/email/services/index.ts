/**
 * Email Services Barrel Export
 *
 * Phase 4: Service Splits - Exports facade and sub-services
 */

// Facade (thin wrapper delegating to sub-services)
export { EmailsService } from './emails.service';
export type { EmailListParams, EmailListFilters } from './emails.service';

// Sub-services (internal implementation)
export { EmailCrudService } from './email-crud.service';
export { EmailBulkService } from './email-bulk.service';
export { EmailSearchService } from './email-search.service';
export { EmailFolderService } from './email-folder.service';
