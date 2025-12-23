# Email Sync Audit Findings

Scope
- Module: backend/src/modules/email-sync
- Focus: bugs, tenant safety, data correctness, duplicate code, and sync behavior

Key Findings
1) High - IMAP external ID mismatch breaks incremental delete and sync-back
   - IMAP canonical message IDs are stored as "folder:uid" while change events emit bare UID.
   - Deletion queries use externalId = messageId (UID only), so deletes do not match stored records.
   - Sync-back also parses externalIds as integers, which drops the folder prefix entirely.
   - References: backend/src/modules/email-sync/drivers/imap/imap.driver.ts, backend/src/modules/email-sync/services/base-email-sync.service.ts, backend/src/modules/email-sync/workers/sync-back.worker.ts

2) High - IMAP sync-back uses wrong credentials and is not tenant scoped
   - Looks up providers by email only, not by tenantId.
   - Decrypts provider.accessToken instead of imapPassword, likely failing for many IMAP accounts.
   - Always opens INBOX, even when external IDs refer to other folders.
   - References: backend/src/modules/email-sync/workers/sync-back.worker.ts, backend/src/modules/email-sync/services/provider-token.service.ts

3) High - Outbound Gmail/Microsoft send path drops attachments and Gmail Bcc
   - Worker builds ad-hoc send payloads and does not use driver compose logic.
   - Gmail path does not include Bcc, and Microsoft path ignores attachments.
   - References: backend/src/modules/email-sync/workers/email-send.worker.ts, backend/src/modules/email-sync/drivers/google/google.driver.ts, backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts

4) Medium - Email send idempotency is ineffective by default
   - Default idempotency keys include Date.now(), so retries almost never dedupe.
   - References: backend/src/modules/email-sync/services/email-send-queue.service.ts

5) Medium - Microsoft folder cache ignores nested folders
   - Only top-level /me/mailFolders are cached; child folders are not resolved.
   - parentFolderId mapping falls back to INBOX when cache misses, skewing folder data.
   - References: backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts

6) Medium - IMAP incremental sync only tracks INBOX
   - getChangesSince uses INBOX only; other folders never emit deltas.
   - References: backend/src/modules/email-sync/drivers/imap/imap.driver.ts

7) Low - Provider type in sync jobs is trusted without DB verification
   - Worker routes by jobData.providerType without re-checking provider config.
   - References: backend/src/modules/email-sync/workers/sync.worker.ts

Duplicate Code and Design Drift
- Gmail and Microsoft sync services duplicate attachment processing instead of using shared handlers.
  References: backend/src/modules/email-sync/services/gmail/google-sync.service.ts, backend/src/modules/email-sync/services/microsoft/microsoft-sync.service.ts, backend/src/modules/email-sync/services/base-attachment-handler.ts
- EmailSendWorker re-implements send logic already covered by drivers.
  References: backend/src/modules/email-sync/workers/email-send.worker.ts, backend/src/modules/email-sync/drivers/google/google.driver.ts, backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts
- Gmail/Microsoft batch processors overlap driver-based sync flows and parsing logic.
  References: backend/src/modules/email-sync/services/gmail/gmail-batch-processor.ts, backend/src/modules/email-sync/services/microsoft/microsoft-batch-processor.ts
- Message parsing exists in both provider parsers and driver canonical mappers.
  References: backend/src/modules/email-sync/services/gmail/gmail-message-parser.ts, backend/src/modules/email-sync/drivers/google/google.driver.ts, backend/src/modules/email-sync/services/microsoft/microsoft-message-parser.ts, backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts
- Queue services repeat Redis and QueueEvents boilerplate.
  References: backend/src/modules/email-sync/services/email-send-queue.service.ts, backend/src/modules/email-sync/services/bulk-operations-queue.service.ts, backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts, backend/src/modules/email-sync/services/folder-operations-queue.service.ts

Roadmap
Phase 1 - IMAP external ID consistency and repairs
- Choose canonical external ID format (recommend folder:uid) and apply uniformly.
- Update IMAP change/IDLE events to emit folder-qualified IDs.
- Update deletion and sync-back to accept both legacy and new formats.
- Backfill existing records where externalId lacks folder.
- Add tests for IMAP incremental delete and sync-back ID parsing.

Phase 2 - IMAP sync-back correctness and tenant safety
- Resolve provider by providerId and tenantId (not email only).
- Use ProviderTokenService.getImapCredentials and imapPassword for auth.
- Parse folder from externalId and open correct mailbox before actions.
- Add tests for cross-tenant guardrails and folder-scoped IMAP actions.

Phase 3 - Outbound send reliability and idempotency
- Route outbound sends through IEmailDriver.sendMessage to unify behavior.
- Ensure attachments and Bcc are respected for Gmail/Microsoft.
- Replace default idempotency with deterministic hash of message content + schedule.
- Add integration tests for Gmail, Microsoft, and IMAP sends with attachments.

Phase 4 - Microsoft folder cache completeness
- Fetch nested childFolders and populate folderId and path caches recursively.
- Add fallback fetch by parentFolderId on cache miss.
- Add tests for nested folder mappings and move operations.

Phase 5 - De-duplication and consolidation
- Use BaseAttachmentHandler across Gmail and Microsoft sync services.
- Retire or fence legacy batch processors, keep one sync path per provider.
- Consolidate queue boilerplate into a base queue service.
- Remove duplicate message parsing paths or make one the source of truth.

Phase 6 - Validation and observability
- Add regression tests for sync-back actions and IMAP incremental delete path.
- Add telemetry for externalId format mismatches and send failures.
- Run real-provider scripts after changes:
  - npx ts-node src/modules/email-sync/drivers/test-google-sync-modes.script.ts
  - npx ts-node src/modules/email-sync/drivers/test-microsoft-sync-modes.script.ts

