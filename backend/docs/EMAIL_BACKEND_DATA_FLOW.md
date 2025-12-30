# Email Backend Data Flow - Visual Architecture

**Date**: 2025-12-30
**Purpose**: Visual reference for understanding email sync data flow

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Frontend)                         │
│  GET /api/v1/emails?specialUse=INBOX                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EmailsController (REST API)                    │
│  • Authorization check                                           │
│  • Parameter validation                                          │
│  • Calls EmailsService                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EmailsService                               │
│  1. getFolderPathsBySpecialUse(specialUse='INBOX')              │
│     → folder.findMany({ where: { specialUse: 'INBOX' }})       │
│     → Returns: ['INBOX', 'Posta in arrivo']                    │
│  2. email.findMany({ where: { folder: { in: paths }}})         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Database (PostgreSQL)                      │
│                                                                  │
│  ┌─────────────────┐                 ┌──────────────────┐      │
│  │  folders        │                 │  emails          │      │
│  ├─────────────────┤                 ├──────────────────┤      │
│  │ path: "INBOX"   │◄────────────────│ folder: "INBOX"  │      │
│  │ name: "Posta..." │  string join    │ subject: "..."   │      │
│  │ specialUse:     │  (no FK!)       │ isRead: false    │      │
│  │   "INBOX"       │                 └──────────────────┘      │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Gmail Sync Flow (Detailed)

```
┌────────────────────────────────────────────────────────────────┐
│                    GMAIL API                                    │
│  GET /users/me/labels                                           │
│  GET /users/me/messages                                         │
└──────────┬─────────────────────────────────────────────────────┘
           │
           │ ┌─── labels ───────────────────────────────────────┐
           │ │ [{                                                │
           │ │   "id": "INBOX",                                  │
           │ │   "name": "Posta in arrivo",  ← Localized!       │
           │ │   "messagesTotal": 42,                            │
           │ │   "messagesUnread": 5                             │
           │ │ },                                                │
           │ │ {                                                 │
           │ │   "id": "CATEGORY_PERSONAL",  ← System category  │
           │ │   "name": "Primary",                              │
           │ │   "type": "system"                                │
           │ │ }]                                                │
           │ └───────────────────────────────────────────────────┘
           │
           │ ┌─── messages ─────────────────────────────────────┐
           │ │ [{                                                │
           │ │   "id": "abc123",                                 │
           │ │   "labelIds": ["INBOX", "CATEGORY_PERSONAL"],    │
           │ │   "payload": { ... }                              │
           │ │ }]                                                │
           │ └───────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                      SyncWorker (BullMQ)                          │
│  Queue: email-sync-high (concurrency: 17)                        │
└───────────┬──────────────────────────────────────────────────────┘
            │
            ├─────► 1. Folder Sync (with Redis lock)
            │       └─► GmailFolderService.syncGmailFolders()
            │
            ├─────► 2. Email Sync (provider-specific)
            │       └─► GoogleSyncService.syncProvider()
            │
            └─────► 3. Post-Sync Updates (atomic transaction)
                    └─► applyAllPostSyncUpdates()
```

### Step 1: Folder Sync

```
GmailFolderService.syncGmailFolders(gmail, tenantId, providerId)
│
├─► Fetch all labels from Gmail API
│   labels = gmail.users.labels.list({ userId: 'me' })
│
├─► For each label:
│   │
│   ├─► Skip CATEGORY_ labels (line 148-154)
│   │   if (label.id.startsWith('CATEGORY_')) continue;  ⚠️
│   │
│   ├─► Map label ID to folder path (line 159)
│   │   folderPath = labelIdToFolderPath(label.id, label.name)
│   │   │
│   │   ├─ INBOX → "INBOX"
│   │   ├─ SENT → "SENT"
│   │   ├─ DRAFT → "DRAFTS"
│   │   ├─ Label_12345 → labelName (e.g., "Work")
│   │   └─ CATEGORY_PERSONAL → SKIPPED ⚠️
│   │
│   └─► Upsert to database (line 170)
│       folder.upsert({
│         create: {
│           path: folderPath,        ← "INBOX"
│           name: label.name,         ← "Posta in arrivo"
│           externalId: label.id,     ← "INBOX"
│           specialUse: "INBOX",      ← Canonical type
│           totalCount: 42,
│           unreadCount: 5
│         }
│       })
│
└─► Delete folders that no longer exist (line 128-142)
    ⚠️ NO SAFEGUARD: Emails become orphaned!
```

### Step 2: Email Sync

```
GoogleSyncService.syncProvider(jobData)
│
├─► Create GoogleDriver with credentials
│   driver = new GoogleDriver()
│   await driver.connect({ accessToken, ... })
│
├─► Fetch messages from Gmail API
│   messages = await driver.listMessages({ folder: 'INBOX' })
│
├─► For each message:
│   │
│   ├─► Convert to CanonicalMessage
│   │   canonicalMsg = gmailMessageToCanonical(gmailMsg)
│   │   │
│   │   ├─ Determine folder from labelIds (line 795)
│   │   │  folder = determineFolderFromLabels(labelIds)
│   │   │  │
│   │   │  ├─ Priority order:
│   │   │  │  1. TRASH → "TRASH"
│   │   │  │  2. SPAM → "SPAM"
│   │   │  │  3. SENT → "SENT"
│   │   │  │  4. DRAFT → "DRAFTS"
│   │   │  │  5. CATEGORY_PERSONAL → "INBOX" ⚠️
│   │   │  │  6. INBOX → "INBOX"
│   │   │  │  7. Default → "INBOX"
│   │   │  │
│   │   │  └─ labelIds = ["INBOX", "CATEGORY_PERSONAL"]
│   │   │     → Returns "INBOX" ✅
│   │   │
│   │   └─ Return { folder: "INBOX", ... }
│   │
│   └─► Upsert email to database
│       email.upsert({
│         create: {
│           folder: "INBOX",  ← Canonical path
│           subject: "...",
│           isRead: false,
│           ...
│         }
│       })
│
└─► Process attachments (if any)
```

### Step 3: Post-Sync Updates

```
SyncWorker.applyAllPostSyncUpdates(providerId, tenantId, metadata)
│
└─► Atomic transaction (line 339-386)
    │
    ├─► 1. Update provider metadata
    │   providerConfig.update({
    │     lastSyncedAt: new Date(),
    │     metadata: { lastSyncToken, ... }
    │   })
    │
    └─► 2. Update folder counts ✅ FIXED
        executeRaw`
          UPDATE "folders"
          SET
            "totalCount" = (
              SELECT COUNT(*)
              FROM "emails"
              WHERE "emails"."providerId" = "folders"."providerId"
                AND "emails"."folder" = "folders"."path"  ✅ FIXED!
                AND "emails"."isDeleted" = false
            ),
            "unreadCount" = (...)
          WHERE "folders"."providerId" = ${providerId}
        `
```

---

## Critical Mapping: CATEGORY_PERSONAL

```
CATEGORY_PERSONAL Label Flow:

┌─────────────────────────────────────────────────────────────┐
│  Gmail API Response                                          │
│  {                                                           │
│    "id": "CATEGORY_PERSONAL",                               │
│    "name": "Primary",                                        │
│    "type": "system"                                          │
│  }                                                           │
└──────────────┬──────────────────────────────────────────────┘
               │
               ├─────► GmailFolderService.syncGmailFolders()
               │       │
               │       └─► if (label.id.startsWith('CATEGORY_'))
               │           continue;  ⚠️ NOT SYNCED AS FOLDER
               │
               ├─────► GoogleDriver.determineFolderFromLabels()
               │       │
               │       └─► CATEGORY_PERSONAL: 'INBOX' ✅
               │           Maps to canonical 'INBOX'
               │
               └─────► canonical.types.ts
                       │
                       └─► GMAIL_TO_CANONICAL = {
                             'CATEGORY_PERSONAL': 'PERSONAL' ❌
                           }
                           INCONSISTENCY!

Result:
  ✅ Emails synced with folder: "INBOX"
  ❌ No "PERSONAL" or "CATEGORY_PERSONAL" folder in database
  ⚠️ Canonical type definition doesn't match driver implementation
```

---

## Database Schema Relationship

```
┌─────────────────────────────────────────────────────────────┐
│                      Current Schema                          │
└─────────────────────────────────────────────────────────────┘

  folders                          emails
┌──────────────────┐            ┌───────────────────┐
│ id (PK)          │            │ id (PK)           │
│ tenantId         │            │ tenantId          │
│ providerId       │            │ providerId        │
│ path             │◄───────────│ folder (String)   │  ⚠️ No FK!
│ name             │  String    │ subject           │
│ externalId       │  join      │ isRead            │
│ specialUse       │            │ ...               │
│ isSystem         │            └───────────────────┘
│ totalCount       │
│ unreadCount      │
└──────────────────┘

Unique constraint: (providerId, path)

⚠️ ISSUES:
1. No foreign key constraint
2. emails.folder can reference non-existent path
3. Folder deletion orphans emails
4. No cascade rules
```

### Proposed Schema (Option A: Add specialUse to Email)

```
  folders                          emails
┌──────────────────┐            ┌───────────────────┐
│ id (PK)          │            │ id (PK)           │
│ path             │◄───────────│ folder (String)   │
│ specialUse       │            │ specialUse ✨NEW │
│ ...              │            │ ...               │
└──────────────────┘            └───────────────────┘

Index: (providerId, specialUse)

Benefits:
  ✅ Fast queries: WHERE specialUse = 'INBOX'
  ✅ No joins needed
  ✅ Denormalized for performance
```

### Proposed Schema (Option B: Foreign Key)

```
  folders                          emails
┌──────────────────┐            ┌───────────────────┐
│ id (PK)          │◄───────────│ folderId (FK) ✨  │
│ path             │  ON DELETE │ ...               │
│ specialUse       │  SET NULL  │                   │
│ ...              │            │                   │
└──────────────────┘            └───────────────────┘

Benefits:
  ✅ Referential integrity
  ✅ Cascade delete protection
  ✅ Type safety
  ❌ Migration complexity
```

---

## Query Flow: Frontend to Database

```
Frontend Request:
  GET /api/v1/emails?specialUse=INBOX&page=1&limit=50

    ↓

EmailsController:
  validateAuth()
  validateParams()
  emailsService.listEmails({ specialUse: 'INBOX', ... })

    ↓

EmailsService (lines 246-262):
  1. Fetch folder paths for specialUse='INBOX'
     foldersWithSpecialUse = folder.findMany({
       where: { specialUse: 'INBOX' }
     })
     → Returns: [
         { path: 'INBOX', name: 'Posta in arrivo' },
         { path: 'INBOX', name: 'Inbox' }
       ]

  2. Extract paths
     folderPaths = ['INBOX', 'Posta in arrivo']

  3. Query emails
     emails = email.findMany({
       where: {
         folder: { in: folderPaths },  ← String IN clause
         isDeleted: false
       },
       orderBy: { receivedAt: 'desc' },
       skip: 0,
       take: 50
     })

    ↓

Database:
  SELECT * FROM emails
  WHERE folder IN ('INBOX', 'Posta in arrivo')
    AND "isDeleted" = false
  ORDER BY "receivedAt" DESC
  LIMIT 50;

    ↓

Response:
  {
    "emails": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 142
    }
  }
```

---

## Folder Count Calculation (Worker)

```
BEFORE FIX (BROKEN):
┌────────────────────────────────────────────────────────────┐
│ UPDATE folders                                              │
│ SET totalCount = (                                          │
│   SELECT COUNT(*)                                           │
│   FROM emails                                               │
│   WHERE emails.folder = folders.name  ❌ WRONG JOIN!       │
│     AND emails.isDeleted = false                            │
│ )                                                           │
└────────────────────────────────────────────────────────────┘

Example:
  folder.path = "INBOX"
  folder.name = "Posta in arrivo"
  email.folder = "INBOX"

  "INBOX" = "Posta in arrivo" → FALSE
  Count = 0 ❌


AFTER FIX (CORRECT):
┌────────────────────────────────────────────────────────────┐
│ UPDATE folders                                              │
│ SET totalCount = (                                          │
│   SELECT COUNT(*)                                           │
│   FROM emails                                               │
│   WHERE emails.folder = folders.path  ✅ CORRECT!          │
│     AND emails.isDeleted = false                            │
│ )                                                           │
└────────────────────────────────────────────────────────────┘

Example:
  folder.path = "INBOX"
  folder.name = "Posta in arrivo"
  email.folder = "INBOX"

  "INBOX" = "INBOX" → TRUE
  Count = 42 ✅
```

---

## Race Condition Protection

### Folder Sync Lock (RC-4) ✅ Fixed

```
Worker A                           Worker B
   │                                  │
   ├─► syncFoldersWithLock()          │
   │   │                              │
   │   ├─► redisLock.acquire(         │
   │   │     'folder-sync:abc123'     │
   │   │   ) ✅ SUCCESS               │
   │   │                              │
   │   ├─► syncProviderFolders()      │
   │   │   (updating folder counts)   │
   │   │                              ├─► syncFoldersWithLock()
   │   │                              │   │
   │   │                              │   ├─► redisLock.acquire(
   │   │                              │   │     'folder-sync:abc123'
   │   │                              │   │   ) ❌ LOCKED
   │   │                              │   │
   │   │                              │   └─► WAIT or SKIP
   │   │                              │
   │   ├─► redisLock.release()        │
   │   │   ✅ RELEASED                │
   │   │                              │
   │   │                              ├─► redisLock.acquire() ✅
   │   │                              │
   │   │                              └─► syncProviderFolders()
```

### Post-Sync Update Transaction (RC-3) ✅ Fixed

```
Transaction Atomicity:

BEGIN TRANSACTION;
  -- 1. Update metadata
  UPDATE provider_config
  SET lastSyncedAt = NOW(),
      metadata = { lastSyncToken: '12345' };

  -- 2. Update folder counts
  UPDATE folders
  SET totalCount = (...), unreadCount = (...);

COMMIT;  ← ALL or NOTHING

If crash occurs:
  ✅ Both updates rolled back
  ❌ No partial state
```

---

## Performance Characteristics

### Folder Path Lookup (N+1 Pattern)

```
Request: List emails for INBOX

  ├─► Query 1: Get folder paths
  │   SELECT path FROM folders
  │   WHERE specialUse = 'INBOX'
  │   → 1 query, 10ms
  │
  └─► Query 2: Get emails
      SELECT * FROM emails
      WHERE folder IN ('INBOX', 'Posta in arrivo')
      → 1 query, 50ms

Total: 2 queries, 60ms ✅ Acceptable

BUT if called multiple times per request (e.g., stats + list):
  ├─► getStats() → getFolderPathsBySpecialUse()
  └─► listEmails() → getFolderPathsBySpecialUse()

  4 queries, 120ms ⚠️ Redundant
```

**Recommended Fix**: Cache in Redis with 5min TTL

---

## Key Takeaways

1. **Fixed Bug**: Folder count SQL now correctly joins `email.folder = folder.path`

2. **CATEGORY_PERSONAL Inconsistency**:
   - Folder sync: SKIPS category labels
   - Email sync: Maps to 'INBOX'
   - Canonical types: Defines as 'PERSONAL'
   - **Recommendation**: Align all to map to 'INBOX'

3. **No Foreign Key**:
   - `email.folder` is string, not FK
   - Folder deletion orphans emails
   - **Recommendation**: Add ON DELETE protection

4. **Race Conditions Protected**:
   - ✅ Folder sync uses Redis lock
   - ✅ Post-sync updates use transactions
   - ⚠️ Email upsert may have lost-update risk

5. **Performance Optimization Needed**:
   - Cache folder paths by specialUse
   - Update only affected folders, not all
   - Add composite indexes

---

**Document Status**: Complete
**Next Action**: Review Priority 1 fixes from main audit
