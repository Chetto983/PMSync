# Mail API Reference

Complete documentation for all mail-related API endpoints.

**Base URL:** `http://localhost:3000`
**Authentication:** Bearer Token (JWT)
**Swagger UI:** `http://localhost:3000/api/docs`

---

## Table of Contents

1. [Email Endpoints](#email-endpoints)
2. [Folder Endpoints](#folder-endpoints)
3. [Sync Endpoints](#sync-endpoints)
4. [Label Endpoints](#label-endpoints)
5. [Attachment Endpoints](#attachment-endpoints)

---

## Email Endpoints

### List Emails

```
GET /emails
```

Get paginated list of emails with optional filters.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 50, max: 1000) |
| providerId | string | No | Filter by provider ID |
| folder | string | No | Filter by folder path (e.g., "Posta in arrivo") |
| specialUse | string | No | RFC 6154 folder type: INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE |
| isRead | boolean | No | Filter by read status |
| isStarred | boolean | No | Filter by starred status |
| hasAttachments | boolean | No | Filter emails with attachments |
| search | string | No | Search in subject, from, body |
| from | string | No | Filter by sender |
| to | string | No | Filter by recipient |
| subject | string | No | Filter by subject |
| labelIds | string | No | Comma-separated label IDs |
| startDate | string | No | Filter from date (ISO 8601) |
| endDate | string | No | Filter to date (ISO 8601) |

**Response:**

```json
{
  "emails": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "hasMore": true
  }
}
```

---

### Get Email by ID

```
GET /emails/:id
```

Get a single email with full details including attachments.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Email ID |

**Response:** Email object with attachments

---

### Search Emails

```
GET /emails/search
```

Search emails across subject, from, and body. Excludes TRASH and SPAM folders using RFC 6154 specialUse lookup.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | Yes | Search query |
| providerId | string | No | Filter by provider |
| limit | number | No | Max results (default: 20) |

---

### Get Email Statistics

```
GET /emails/stats
```

Get email statistics for the current tenant.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| providerId | string | No | Filter by provider |

**Response:**

```json
{
  "total": 100,
  "unread": 20,
  "starred": 10,
  "byFolder": {
    "INBOX": 80,
    "SENT": 20
  }
}
```

---

### Update Email

```
PATCH /emails/:id
```

Update email properties (read, starred, folder, labels).

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Email ID |

**Request Body:**

```json
{
  "isRead": true,
  "isStarred": false,
  "isFlagged": false,
  "folder": "Archivio",
  "labelIds": ["label-1", "label-2"]
}
```

**Note:** Folder changes are synced to the email provider.

---

### Delete Email

```
DELETE /emails/:id
```

Soft delete an email (moves to trash, syncs to provider).

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Email ID |

---

### Send Email

```
POST /emails/send
```

Send a new email.

**Request Body:**

```json
{
  "providerId": "uuid",
  "to": ["recipient@example.com"],
  "cc": ["cc@example.com"],
  "bcc": ["bcc@example.com"],
  "subject": "Subject",
  "bodyText": "Plain text body",
  "bodyHtml": "<p>HTML body</p>",
  "attachments": [
    {
      "filename": "file.pdf",
      "contentType": "application/pdf",
      "contentBase64": "base64..."
    }
  ]
}
```

---

### Save Draft

```
POST /emails/drafts
```

Save a new draft email.

**Request Body:** Same as Send Email

---

### Update Draft

```
PATCH /emails/drafts/:id
```

Update an existing draft.

---

### Send Draft

```
POST /emails/drafts/:id/send
```

Send an existing draft.

---

## Bulk Operations

### Bulk Mark Read/Unread

```
POST /emails/bulk/read
```

**Request Body:**

```json
{
  "ids": ["email-1", "email-2"],
  "isRead": true
}
```

---

### Bulk Star/Unstar

```
POST /emails/bulk/star
```

**Request Body:**

```json
{
  "ids": ["email-1", "email-2"],
  "isStarred": true
}
```

---

### Bulk Move to Folder

```
POST /emails/bulk/move
```

**Request Body:**

```json
{
  "ids": ["email-1", "email-2"],
  "folder": "Archivio"
}
```

**Note:** Use actual folder path (e.g., "Cestino" for Italian TRASH), not normalized names.

---

### Bulk Delete

```
POST /emails/bulk/delete
```

**Request Body:**

```json
{
  "ids": ["email-1", "email-2"]
}
```

---

### Bulk Add Labels

```
POST /emails/bulk/labels
```

**Request Body:**

```json
{
  "ids": ["email-1", "email-2"],
  "labelIds": ["label-1", "label-2"]
}
```

---

## Folder Endpoints

### List Folders

```
GET /folders
```

Get all folders for the current tenant.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| providerId | string | No | Filter by provider |

**Response:**

```json
[
  {
    "id": "uuid",
    "providerId": "uuid",
    "path": "Posta in arrivo",
    "name": "Posta in arrivo",
    "specialUse": "INBOX",
    "totalCount": 100,
    "unreadCount": 10
  }
]
```

**Note:** `specialUse` is the RFC 6154 folder type (INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE). Use this for folder type detection instead of comparing path names.

---

### Create Folder

```
POST /folders
```

Create a new folder.

**Request Body:**

```json
{
  "providerId": "uuid",
  "name": "My Folder",
  "parentPath": "optional-parent-path"
}
```

---

### Rename Folder

```
PATCH /folders/:id
```

Rename an existing folder.

**Request Body:**

```json
{
  "name": "New Name"
}
```

**Note:** System folders (INBOX, SENT, DRAFTS, TRASH, SPAM) cannot be renamed.

---

### Delete Folder

```
DELETE /folders/:id
```

Delete a folder and its contents.

**Note:** System folders cannot be deleted.

---

### Sync Folder

```
POST /folders/:id/sync
```

Force sync a specific folder from the provider.

---

### Audit Folder Sync

```
GET /folders/audit/:providerId
```

Audit folder sync status between database and mail server.

**Response:**

```json
{
  "success": true,
  "providerId": "uuid",
  "providerEmail": "user@example.com",
  "dbFolderCount": 10,
  "serverFolderCount": 10,
  "inSync": true,
  "onlyInDb": [],
  "onlyOnServer": [],
  "recommendations": ["All folders are in sync."]
}
```

---

### Cleanup Orphaned Folders

```
POST /folders/cleanup/:providerId
```

Delete folders that exist in database but not on mail server.

**Response:**

```json
{
  "success": true,
  "providerId": "uuid",
  "providerEmail": "user@example.com",
  "deletedCount": 2,
  "deletedPaths": ["Test", "OldFolder"]
}
```

---

## Sync Endpoints

### Get Sync Status

```
GET /email-sync/status
```

Get sync status for all providers.

---

### Trigger Sync

```
POST /email-sync/trigger
```

Trigger a sync for a provider.

**Request Body:**

```json
{
  "providerId": "uuid",
  "priority": "high"
}
```

---

### Get Sync Stats

```
GET /email-sync/stats
```

Get sync statistics.

---

## Label Endpoints

### List Labels

```
GET /labels
```

Get all user-defined labels.

---

### Create Label

```
POST /labels
```

**Request Body:**

```json
{
  "name": "Important",
  "color": "#FF0000"
}
```

---

### Update Label

```
PATCH /labels/:id
```

---

### Delete Label

```
DELETE /labels/:id
```

---

## Attachment Endpoints

### Get Attachment

```
GET /emails/:emailId/attachments/:attachmentId
```

Download an attachment.

---

### Upload Attachment

```
POST /emails/:emailId/attachments
```

Upload an attachment to a draft.

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "statusCode": 400,
  "message": "Error description",
  "timestamp": "2025-12-06T10:00:00.000Z"
}
```

| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing JWT |
| 403 | Forbidden - Access denied |
| 404 | Not Found - Resource not found |
| 500 | Internal Server Error |

---

## RFC 6154 Special Use Folders

The `specialUse` field identifies folder type regardless of locale:

| specialUse | Description | Italian Example |
|------------|-------------|-----------------|
| INBOX | Main inbox | Posta in arrivo |
| SENT | Sent mail | Posta Inviata |
| DRAFTS | Draft emails | Bozze |
| TRASH | Deleted emails | Cestino |
| SPAM | Spam/Junk | Spam |
| ARCHIVE | Archived emails | Archivio |

**Important:** Always use `specialUse` for folder type detection, not path/name comparison.

---

## Realtime Events (WebSocket)

Connect to WebSocket for real-time updates:

```
ws://localhost:3000/realtime
```

### Events

| Event | Description |
|-------|-------------|
| `email:update` | Email updated (read, starred, etc.) |
| `email:new` | New email received |
| `email:delete` | Email deleted |
| `folder:counts` | Folder counts updated |
| `sync:progress` | Sync progress update |
| `sync:complete` | Sync completed |

---

## Testing

### Swagger UI

Access interactive API documentation at:

```
http://localhost:3000/api/docs
```

### Health Check

```
GET /health
```

Returns server health status.
