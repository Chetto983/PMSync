# MailAgent Email Module - Comprehensive Testing Checklist

**Version**: 1.1
**Updated**: 2025-12-29
**Total Tests**: 138+

---

## Quick Start: Automated E2E Tests

### Running the E2E Test Suite

```bash
# Step 1: Get auth token (choose one method)

# Method A: Use helper script
cd backend
npx ts-node test/get-auth-token.ts your@email.com your-password

# Method B: Get from browser DevTools
# 1. Login to the app in your browser
# 2. Open DevTools (F12) > Application > Local Storage
# 3. Find "auth-storage" key
# 4. Copy the "token" value from the JSON

# Step 2: Run E2E tests
cd backend
TEST_AUTH_TOKEN="your-token" npm run test:e2e -- --testPathPattern=production-e2e

# Step 3: View test report
cat test-report.md
```

### E2E Test Coverage

- **Providers**: List, get, update, aliases
- **Emails**: CRUD, filters, bulk operations, threads
- **Labels**: CRUD, add/remove emails
- **Contacts**: CRUD, search, local contacts
- **AI/VoltAgent**: Briefing, memory, deadlines, follow-ups, action items
- **Sync**: Status, health, queues, webhooks
- **Drafts**: Save, get, update, delete
- **Calendar**: List, events

---

## How to Use This Checklist

1. Run through each section in order
2. Check the box `[x]` when test passes
3. Add notes for any failures
4. Report all failures before moving to next section

---

## 1. Smart Filters (8 tests)

### 1.1 Unread Filter

- [ ] **TEST**: Click "Unread" in smart filters
- **Steps**:
  1. Navigate to Email page
  2. Click "Unread" filter in left sidebar
  3. Verify list shows all unread emails
- **Expected**: Shows ALL unread emails except those in SPAM/JUNK/TRASH folders
- **Notes**: Stats counter should match filtered count

### 1.2 Today Filter

- [ ] **TEST**: Click "Today" in smart filters
- **Steps**:
  1. Click "Today" filter
  2. Check email dates in list
- **Expected**: Only emails received today are shown
- **Notes**: Passed

### 1.3 This Week Filter

- [ ] **TEST**: Click "This Week" in smart filters
- **Steps**:
  1. Click "This Week" filter
  2. Check email dates in list
- **Expected**: Only emails from current week are shown
- **Notes**: Passed

### 1.4 Attachments Filter

- [ ] **TEST**: Click "Attachments" in smart filters
- **Steps**:
  1. Click "Attachments" filter
  2. Verify all emails show paperclip icon
- **Expected**: Only emails with attachments are shown
- **Notes**: Passed

### 1.5 Important Filter

- [ ] **TEST**: Click "Important" in smart filters
- **Steps**:
  1. Click "Important" filter
  2. Verify all emails have important flag
- **Expected**: Only flagged/important emails shown
- **Notes**: Passed

### 1.9 Label Filter

- [ ] **TEST**: Click Label in sidebar
- **Steps**:
  1. Click a label (e.g., Pubblicità)
  2. Verify emails filtered by label
  3. Open email, verify label chip in toolbar
- **Expected**: Filter works, chip visible
- **Notes**: Fixed and Verified

### 1.7 Stats Counter Accuracy

- [ ] **TEST**: Verify header stats counter matches filter results
- **Steps**:
  1. Note the "X unread" count in header
  2. Click Unread filter
  3. Count emails in list
- **Expected**: Counter matches actual unread count (excluding SPAM/JUNK)
- **Notes**: Passed

### 1.8 Filter Switching

- [ ] **TEST**: Switch between filters rapidly
- **Steps**:
  1. Click Unread filter
  2. Immediately click Today filter
  3. Immediately click INBOX folder
- **Expected**: Each filter loads correctly, no stale data
- **Notes**: Passed

---

## 2. Email List View (12 tests)

### 2.1 List Rendering

- [] **TEST**: Email list renders correctly
- **Steps**:
  1. Navigate to INBOX
  2. Verify list items show sender, subject, date
- **Expected**: Clean 2-line layout with proper spacing
- **Notes**: Passed

### 2.2 Virtual Scrolling

- [] **TEST**: Scroll through large email list
- **Steps**:
  1. Open folder with 100+ emails
  2. Scroll rapidly up and down
  3. Check for stuttering or blank rows
- **Expected**: Smooth scrolling, no blank rows
- **Notes**: Passed

### 2.3 Thread Click Opens Detail

- [] **TEST**: Click email to open thread view
- **Steps**:
  1. Click any email in list
  2. Verify thread panel opens on right
- **Expected**: Email body and toolbar visible in detail pane
- **Notes**: Passed

### 2.4 Single Checkbox Select

- [] **TEST**: Select single email with checkbox
- **Steps**:
  1. Hover over email
  2. Click checkbox
  3. Verify bulk action bar appears
- **Expected**: Checkbox visible on hover, email selected, bulk bar shows "1 selected"
- **Notes**: Passed

### 2.5 Ctrl+Click Multi-Select

- [ ] **TEST**: Select multiple non-adjacent emails
- **Steps**:
  1. Click checkbox on email 1
  2. Ctrl+Click checkbox on email 5
- **Expected**: Both emails selected, bulk bar shows "2 selected"
- **Notes**: Fixed (Implemented in ThreadList - Pending Verification)

### 2.6 Shift+Click Range Select

- [ ] **TEST**: Select range of emails
- **Steps**:
  1. Click checkbox on email 1
  2. Shift+Click checkbox on email 5
- **Expected**: Emails 1-5 all selected, bulk bar shows "5 selected"
- **Notes**: Fixed (Implemented in ThreadList - Pending Verification)

### 2.7 Star Toggle from List

- [] **TEST**: Star/unstar email from list
- **Steps**:
  1. Click star icon on email
  2. Verify star fills with color
  3. Click again to unstar
- **Expected**: Star toggles visually and persists after refresh
- **Notes**: Passed (Unified with Flag)

### 2.8 Unread Bold Styling

- [] **TEST**: Unread emails appear bold
- **Steps**:
  1. Find unread email (blue dot or bold text)
  2. Click to read it
  3. Verify text becomes normal weight
- **Expected**: Unread = bold, read = normal weight
- **Notes**: Passed

### 2.9 Sent Folder Italic Styling

- [ ] **TEST**: Sent emails show recipient instead of sender
- **Steps**:
  1. Navigate to Sent folder
  2. Check first column shows "To: recipient"
- **Expected**: Sent emails show recipient in italic
- **Expected**: Sent emails show recipient in italic
- **Notes**: Fixed (Implemented in ThreadListItem - Pending Verification)

### 2.10 Attachment Icon

- [] **TEST**: Attachment paperclip icon visible
- **Steps**:
  1. Find email with attachment
  2. Verify paperclip icon in list item
- **Expected**: Paperclip icon visible next to date
- **Notes**: Passed

### 2.11 Empty State Display

- [] **TEST**: Empty folder shows message
- **Steps**:
  1. Navigate to empty folder (or create one)
  2. Verify empty state illustration
- **Expected**: Shows "No emails" message with illustration
- **Notes**: Passed

### 2.12 Infinite Scroll Pagination

- [] **TEST**: Scroll to load more emails
- **Steps**:
  1. Open folder with 50+ emails
  2. Scroll to bottom
  3. Verify more emails load
- **Expected**: Additional emails load, loading indicator shown
- **Notes**: Passed (Verified by code review)

---

## 3. Email Thread View (15 tests)

### 3.1 Thread Toolbar - Back Button

- [ ] **TEST**: Close thread with back button
- **Steps**:
  1. Open email thread
  2. Click back arrow (←)
- **Expected**: Thread closes, list remains visible
- **Notes**:

### 3.2 Thread Toolbar - Reply Button

- [ ] **TEST**: Reply button opens compose
- **Steps**:
  1. Open email thread
  2. Click Reply button
  3. Verify compose dialog opens
- **Expected**: Compose opens with To: filled, subject prefixed with "Re:"
- **Notes**:

### 3.3 Thread Toolbar - Reply All Button

- [ ] **TEST**: Reply All opens compose with all recipients
- **Steps**:
  1. Open email with multiple recipients
  2. Click Reply All button
- **Expected**: Compose opens with To: sender, Cc: all other recipients
- **Notes**:

### 3.4 Thread Toolbar - Forward Button

- [ ] **TEST**: Forward opens compose with body
- **Steps**:
  1. Open email thread
  2. Click Forward button
- **Expected**: Compose opens with empty To:, subject prefixed with "Fwd:", original body quoted
- **Notes**:

### 3.5 Thread Toolbar - Delete Button

- [ ] **TEST**: Delete moves email to trash
- **Steps**:
  1. Open email thread
  2. Click Delete (red trash icon)
  3. Check Trash folder
- **Expected**: Email moved to Trash, success message shown
- **Notes**:

### 3.6 Thread Toolbar - Archive Button

- [ ] **TEST**: Archive moves email to Archive
- **Steps**:
  1. Open email thread
  2. Click Archive button
  3. Check Archive folder
- **Expected**: Email moved to Archive folder
- **Notes**:

### 3.7 Thread Toolbar - Star Toggle

- [ ] **TEST**: Star toggle in toolbar
- **Steps**:
  1. Open email
  2. Click star icon in toolbar
- **Expected**: Star fills with gold color, persists after refresh
- **Notes**:

### 3.8 Thread Toolbar - Important Toggle

- [ ] **TEST**: Flag/Important toggle in toolbar
- **Steps**:
  1. Open email
  2. Click flag icon in toolbar
- **Expected**: Flag fills with orange color, persists after refresh
- **Notes**:

### 3.9 Thread Toolbar - Read/Unread Toggle

- [ ] **TEST**: Toggle read/unread status
- **Steps**:
  1. Open read email
  2. Click mail icon (mark unread)
  3. Verify list shows bold
- **Expected**: Email marked unread, icon changes
- **Notes**:

### 3.10 Thread Toolbar - Move to Folder

- [ ] **TEST**: Move email to different folder
- **Steps**:
  1. Open email
  2. Click folder icon
  3. Select destination folder
- **Expected**: Email moved to selected folder
- **Notes**:

### 3.11 Expand/Collapse Messages

- [ ] **TEST**: Toggle message expansion in thread
- **Steps**:
  1. Open thread with multiple messages
  2. Click collapsed message header
- **Expected**: Message expands to show full body
- **Notes**:

### 3.12 Attachment Display

- [ ] **TEST**: Attachments shown in thread
- **Steps**:
  1. Open email with attachments
  2. Verify attachment chips visible
- **Expected**: File name, size, and type icon shown
- **Notes**:

### 3.13 Attachment Download

- [ ] **TEST**: Download attachment
- **Steps**:
  1. Open email with attachment
  2. Click attachment chip or download button
  3. Verify file downloads
- **Expected**: File downloads with correct name and content
- **Notes**:

### 3.14 Image Attachment Preview

- [ ] **TEST**: Preview image attachment
- **Steps**:
  1. Open email with image attachment
  2. Click image to preview
  3. Test zoom in/out and rotate
- **Expected**: Image opens in preview dialog with controls
- **Notes**:

### 3.15 Calendar Invite Display

- [ ] **TEST**: Calendar invite renders correctly
- **Steps**:
  1. Find email with calendar invite (.ics)
  2. Verify invite card shows event details
- **Expected**: Shows date, time, location, response buttons
- **Notes**:

---

## 4. Bulk Actions (14 tests)

### 4.1 Bulk Bar Appears

- [ ] **TEST**: Bulk action bar shows on selection
- **Steps**:
  1. Select one email with checkbox
  2. Verify bulk bar appears at top
- **Expected**: Bar shows with "1 selected" and action buttons
- **Notes**:

### 4.2 Selection Count Display

- [ ] **TEST**: Selection count updates correctly
- **Steps**:
  1. Select 3 emails
  2. Verify bar shows "3 selected"
- **Expected**: Count matches selected items
- **Notes**:

### 4.3 Max Selection Limit

- [ ] **TEST**: Cannot select more than 20 emails
- **Steps**:
  1. Try to select 25 emails
  2. Verify warning message appears
- **Expected**: Selection stops at 20, warning shown
- **Notes**: Microsoft Graph API limit

### 4.4 Clear Selection

- [ ] **TEST**: Clear all selections
- **Steps**:
  1. Select multiple emails
  2. Click X button in bulk bar
- **Expected**: All emails deselected, bar disappears
- **Notes**:

### 4.5 Bulk Mark as Read

- [ ] **TEST**: Mark multiple emails as read
- **Steps**:
  1. Select 3 unread emails
  2. Click "Mark Read" in bulk bar
- **Expected**: All 3 marked as read, text no longer bold
- **Notes**:

### 4.6 Bulk Mark as Unread

- [ ] **TEST**: Mark multiple emails as unread
- **Steps**:
  1. Select 3 read emails
  2. Click "Mark Unread" in bulk bar
- **Expected**: All 3 marked as unread, text becomes bold
- **Notes**:

### 4.7 Bulk Delete

- [ ] **TEST**: Delete multiple emails
- **Steps**:
  1. Select 3 emails
  2. Click Delete in bulk bar
  3. Check Trash folder
- **Expected**: All 3 moved to Trash
- **Notes**:

### 4.8 Bulk Archive

- [ ] **TEST**: Archive multiple emails
- **Steps**:
  1. Select 3 emails
  2. Click Archive in bulk bar
- **Expected**: All 3 moved to Archive folder
- **Notes**:

### 4.9 Bulk Star

- [ ] **TEST**: Star multiple emails
- **Steps**:
  1. Select 3 unstarred emails
  2. Click Star in More menu
- **Expected**: All 3 starred
- **Notes**:

### 4.10 Bulk Unstar

- [ ] **TEST**: Unstar multiple emails
- **Steps**:
  1. Select 3 starred emails
  2. Click Unstar in More menu
- **Expected**: All 3 unstarred
- **Notes**:

### 4.11 Bulk Flag/Important

- [ ] **TEST**: Flag multiple emails
- **Steps**:
  1. Select 3 emails
  2. Click Flag in More menu
- **Expected**: All 3 marked important
- **Notes**:

### 4.12 Bulk Move to Folder

- [ ] **TEST**: Move multiple emails to folder
- **Steps**:
  1. Select 3 emails
  2. Click Move to Folder
  3. Select destination
- **Expected**: All 3 moved to destination folder
- **Notes**:

### 4.13 Bulk Add Labels

- [ ] **TEST**: Add label to multiple emails
- **Steps**:
  1. Select 3 emails
  2. Click Add Labels
  3. Select a label
- **Expected**: Label added to all 3 emails
- **Notes**:

### 4.14 Loading States

- [ ] **TEST**: Loading spinner during bulk operations
- **Steps**:
  1. Select 10 emails
  2. Click Mark Read
  3. Observe button
- **Expected**: Spinner shows while processing, buttons disabled
- **Notes**:

---

## 5. Compose Dialog (18 tests)

### 5.1 New Compose Opens Empty

- [ ] **TEST**: Compose new email
- **Steps**:
  1. Click Compose button
  2. Verify all fields empty
- **Expected**: To, Subject, Body all empty, cursor in To field
- **Notes**:

### 5.2 Reply Prefills Correctly

- [ ] **TEST**: Reply prefills sender
- **Steps**:
  1. Open email
  2. Click Reply
  3. Check To field
- **Expected**: To: contains original sender, Subject: "Re: original subject"
- **Notes**:

### 5.3 Reply-All Prefills All Recipients

- [ ] **TEST**: Reply-All includes all recipients
- **Steps**:
  1. Open email with CC recipients
  2. Click Reply All
  3. Check To and Cc fields
- **Expected**: To: sender, Cc: all other recipients (excluding self)
- **Notes**:

### 5.4 Forward Prefills Body

- [ ] **TEST**: Forward includes original content
- **Steps**:
  1. Open email
  2. Click Forward
  3. Check body field
- **Expected**: Body contains "---- Forwarded message ----" with original content
- **Notes**:

### 5.5 Recipient Validation

- [ ] **TEST**: Invalid email addresses rejected
- **Steps**:
  1. Open compose
  2. Enter "invalid-email" in To field
  3. Try to send
- **Expected**: Validation error shown, send prevented
- **Notes**:

### 5.6 Subject Field

- [ ] **TEST**: Subject field accepts text
- **Steps**:
  1. Open compose
  2. Type in subject field
- **Expected**: Text appears, no character limit issues
- **Notes**:

### 5.7 Body Editor Formatting

- [ ] **TEST**: Rich text formatting works
- **Steps**:
  1. Open compose
  2. Type text, select it
  3. Click Bold, Italic, List buttons
- **Expected**: Formatting applies correctly
- **Notes**:

### 5.8 Attachment Upload

- [ ] **TEST**: Upload attachment via button
- **Steps**:
  1. Open compose
  2. Click attachment button
  3. Select file
- **Expected**: File appears in attachment area with name and size
- **Notes**:

### 5.9 Drag-Drop Attachments

- [ ] **TEST**: Drag file to compose
- **Steps**:
  1. Open compose
  2. Drag file from desktop to compose area
- **Expected**: Overlay appears, file attaches after drop
- **Notes**:

### 5.10 Send Email

- [ ] **TEST**: Send email successfully
- **Steps**:
  1. Compose email with To, Subject, Body
  2. Click Send
  3. Check Sent folder
- **Expected**: Email sent, appears in Sent folder
- **Notes**:

### 5.11 Save Draft

- [ ] **TEST**: Draft auto-saves
- **Steps**:
  1. Compose email with content
  2. Wait 30 seconds
  3. Check Drafts folder
- **Expected**: Draft saved automatically
- **Notes**:

### 5.12 Delete Draft

- [ ] **TEST**: Draft deleted after send
- **Steps**:
  1. Start composing (let it save draft)
  2. Send email
  3. Check Drafts folder
- **Expected**: Draft no longer in Drafts folder
- **Notes**:

### 5.13 Fullscreen Toggle

- [ ] **TEST**: Toggle fullscreen compose
- **Steps**:
  1. Open compose
  2. Click fullscreen button
- **Expected**: Dialog expands to full screen
- **Notes**:

### 5.14 Provider Selection

- [ ] **TEST**: Select email account/provider
- **Steps**:
  1. Open compose (with multiple accounts)
  2. Click From dropdown
  3. Select different account
- **Expected**: Sender changes to selected account
- **Notes**:

### 5.15 AI Compose Toggle

- [ ] **TEST**: AI compose panel opens
- **Steps**:
  1. Open compose
  2. Click AI button (if available)
- **Expected**: AI panel opens on right side
- **Notes**:

### 5.16 Smart Reply Suggestions

- [ ] **TEST**: Smart reply suggestions appear
- **Steps**:
  1. Reply to email
  2. Look for suggestion chips
- **Expected**: 2-3 smart reply suggestions visible (if enabled)
- **Notes**:

### 5.17 Error Handling

- [ ] **TEST**: Send error shows message
- **Steps**:
  1. Disconnect network
  2. Try to send email
- **Expected**: Error message shown, email not lost
- **Notes**:

### 5.18 Cancel Closes Dialog

- [ ] **TEST**: Cancel button closes compose
- **Steps**:
  1. Open compose
  2. Click X or Cancel
- **Expected**: Dialog closes, draft saved if content exists
- **Notes**:

---

## 6. Advanced Search (16 tests)

### 6.1 Text Search

- [ ] **TEST**: Search by keyword in subject/body
- **Steps**:
  1. Click search icon
  2. Click Advanced
  3. Enter keyword in search field
  4. Click Search
- **Expected**: Results show emails containing keyword
- **Notes**:

### 6.2 From Filter

- [ ] **TEST**: Filter by sender email
- **Steps**:
  1. Open advanced search
  2. Enter sender email in From field
  3. Click Search
- **Expected**: Only emails from that sender shown
- **Notes**:

### 6.3 To Filter

- [ ] **TEST**: Filter by recipient
- **Steps**:
  1. Open advanced search
  2. Enter recipient in To field
  3. Click Search
- **Expected**: Only emails to that recipient shown
- **Notes**:

### 6.4 Subject Filter

- [ ] **TEST**: Filter by subject keyword
- **Steps**:
  1. Open advanced search
  2. Enter keyword in Subject field
- **Expected**: Only emails with matching subject shown
- **Notes**:

### 6.5 Label Filter

- [ ] **TEST**: Filter by label
- **Steps**:
  1. Open advanced search
  2. Click label dropdown
  3. Select one or more labels
- **Expected**: Only emails with selected labels shown
- **Notes**:

### 6.6 Date Range Filter

- [ ] **TEST**: Filter by date range
- **Steps**:
  1. Open advanced search
  2. Set start date and end date
- **Expected**: Only emails within date range shown
- **Notes**:

### 6.7 Has Attachments Filter

- [ ] **TEST**: Filter to emails with attachments
- **Steps**:
  1. Open advanced search
  2. Check "Has attachments" checkbox
- **Expected**: Only emails with attachments shown
- **Notes**:

### 6.8 Starred Only Filter

- [ ] **TEST**: Filter to starred emails
- **Steps**:
  1. Open advanced search
  2. Check "Starred only" checkbox
- **Expected**: Only starred emails shown
- **Notes**:

### 6.9 Important Only Filter

- [ ] **TEST**: Filter to important emails
- **Steps**:
  1. Open advanced search
  2. Check "Important only" checkbox
- **Expected**: Only flagged/important emails shown
- **Notes**:

### 6.10 Unread Only Filter

- [ ] **TEST**: Filter to unread emails
- **Steps**:
  1. Open advanced search
  2. Check "Unread only" checkbox
- **Expected**: Only unread emails shown
- **Notes**:

### 6.11 Read Only Filter

- [ ] **TEST**: Filter to read emails
- **Steps**:
  1. Open advanced search
  2. Check "Read only" checkbox
- **Expected**: Only read emails shown
- **Notes**:

### 6.12 AI Semantic Search Tab

- [ ] **TEST**: AI search tab works
- **Steps**:
  1. Open advanced search
  2. Click "AI" tab
  3. Enter natural language query
- **Expected**: Semantic search returns relevant results
- **Notes**:

### 6.13 Active Filter Count

- [ ] **TEST**: Filter count updates
- **Steps**:
  1. Open advanced search
  2. Set 3 filters
  3. Check filter count badge
- **Expected**: Badge shows "3" active filters
- **Notes**:

### 6.14 Reset All Filters

- [ ] **TEST**: Reset clears all filters
- **Steps**:
  1. Open advanced search
  2. Set multiple filters
  3. Click Reset button
- **Expected**: All filters cleared, count = 0
- **Notes**:

### 6.15 Search Button Triggers Search

- [ ] **TEST**: Search button applies filters
- **Steps**:
  1. Open advanced search
  2. Set filters
  3. Click Search
- **Expected**: Dialog closes, filtered results shown
- **Notes**:

### 6.16 Cancel Closes Dialog

- [ ] **TEST**: Cancel without searching
- **Steps**:
  1. Open advanced search
  2. Set filters
  3. Click Cancel
- **Expected**: Dialog closes, previous results unchanged
- **Notes**:

---

## 7. Attachment Handling (10 tests)

### 7.1 Panel Variant Display

- [ ] **TEST**: Attachments panel in thread view
- **Steps**:
  1. Open email with attachments
  2. Check for attachments panel
- **Expected**: Panel shows list of attachments with icons
- **Notes**:

### 7.2 Inline Variant Display

- [ ] **TEST**: Attachment chips in compact view
- **Steps**:
  1. Check attachment display in list item
- **Expected**: Compact chips with file name
- **Notes**:

### 7.3 File Type Icon Detection

- [ ] **TEST**: Icons match file types
- **Steps**:
  1. Open email with PDF, image, doc attachments
  2. Check icons for each
- **Expected**: Different icon for each file type
- **Notes**:

### 7.4 File Size Formatting

- [ ] **TEST**: File sizes formatted correctly
- **Steps**:
  1. Open email with large attachment
  2. Check size display
- **Expected**: Shows KB, MB, or GB appropriately
- **Notes**:

### 7.5 Image Preview Dialog

- [ ] **TEST**: Click image opens preview
- **Steps**:
  1. Open email with image attachment
  2. Click image
- **Expected**: Full preview dialog opens
- **Notes**:

### 7.6 Zoom In/Out

- [ ] **TEST**: Zoom controls in preview
- **Steps**:
  1. Open image preview
  2. Click + and - buttons
- **Expected**: Image scales up/down, % indicator updates
- **Notes**:

### 7.7 Rotate Image

- [ ] **TEST**: Rotate button works
- **Steps**:
  1. Open image preview
  2. Click rotate button
- **Expected**: Image rotates 90 degrees
- **Notes**:

### 7.8 Download File

- [ ] **TEST**: Download attachment
- **Steps**:
  1. Open email with attachment
  2. Click download button
- **Expected**: File downloads with correct name
- **Notes**:

### 7.9 Filter Inline (CID) Attachments

- [ ] **TEST**: Inline images not shown as attachments
- **Steps**:
  1. Open email with inline images in body
  2. Check attachment list
- **Expected**: Inline images NOT listed as downloadable attachments
- **Notes**:

### 7.10 Blob URL Cleanup

- [ ] **TEST**: Memory cleanup after preview close
- **Steps**:
  1. Open image preview
  2. Close preview
  3. Check browser memory (DevTools)
- **Expected**: Blob URLs revoked, no memory leak
- **Notes**:

---

## 8. API Integration (25 tests)

### 8.1 List Emails

- [ ] **TEST**: GET /emails loads list
- **Expected**: Paginated email list loads

### 8.2 Get Single Email

- [ ] **TEST**: GET /emails/:id loads email
- **Expected**: Full email content loads

### 8.3 Get Email Stats

- [ ] **TEST**: GET /emails/stats returns counts
- **Expected**: Unread, starred, important counts

### 8.4 Search Emails

- [ ] **TEST**: GET /emails/search returns results
- **Expected**: Search results match query

### 8.5 Update Email Flags

- [ ] **TEST**: PATCH /emails/:id updates flags
- **Expected**: Read, star, flag update and sync

### 8.6 Delete Email

- [ ] **TEST**: DELETE /emails/:id removes email
- **Expected**: Email moves to trash or hard deletes

### 8.7 Bulk Mark Read

- [ ] **TEST**: PATCH /emails/bulk/read
- **Expected**: Multiple emails marked read

### 8.8 Bulk Delete

- [ ] **TEST**: DELETE /emails/bulk
- **Expected**: Multiple emails deleted

### 8.9 Bulk Star

- [ ] **TEST**: PATCH /emails/bulk/star
- **Expected**: Multiple emails starred

### 8.10 Bulk Flag

- [ ] **TEST**: PATCH /emails/bulk/flag
- **Expected**: Multiple emails flagged

### 8.11 Bulk Move

- [ ] **TEST**: PATCH /emails/bulk/move
- **Expected**: Multiple emails moved

### 8.12 Bulk Add Labels

- [ ] **TEST**: PATCH /emails/bulk/labels/add
- **Expected**: Labels added to emails

### 8.13 Bulk Remove Labels

- [ ] **TEST**: PATCH /emails/bulk/labels/remove
- **Expected**: Labels removed from emails

### 8.14 Save Draft

- [ ] **TEST**: POST /emails/drafts
- **Expected**: Draft saved with content

### 8.15 Get Draft

- [ ] **TEST**: GET /emails/drafts/:id
- **Expected**: Draft content loaded

### 8.16 Delete Draft

- [ ] **TEST**: DELETE /emails/drafts/:id
- **Expected**: Draft removed

### 8.17 Send Email

- [ ] **TEST**: POST /emails/send
- **Expected**: Email sent successfully

### 8.18 Reply to Email

- [ ] **TEST**: POST /emails/:id/reply
- **Expected**: Reply sent with threading

### 8.19 Forward Email

- [ ] **TEST**: POST /emails/:id/forward
- **Expected**: Email forwarded

### 8.20 Download Attachment

- [ ] **TEST**: GET /email/attachments/:id/download
- **Expected**: File downloads correctly

### 8.21 Get Calendar Invite

- [ ] **TEST**: GET /emails/:id/calendar-invite
- **Expected**: Invite data parsed

### 8.22 Respond to Calendar Invite

- [ ] **TEST**: POST /emails/:id/calendar-invite/respond
- **Expected**: Response sent (accept/decline)

### 8.23 Get Conversations

- [ ] **TEST**: GET /emails/conversations
- **Expected**: Threaded conversations returned

### 8.24 Get Thread

- [ ] **TEST**: GET /emails/thread/:threadId
- **Expected**: All messages in thread

### 8.25 Sync Provider

- [ ] **TEST**: POST /email-sync/sync/:providerId
- **Expected**: Sync triggered successfully

---

## 9. Translation Verification (8 tests)

### 9.1 English Locale

- [ ] **TEST**: English translations load
- **Steps**:
  1. Set browser to English
  2. Navigate through email UI
- **Expected**: All text in English, no translation keys visible
- **Notes**:

### 9.2 Italian Locale

- [ ] **TEST**: Italian translations load
- **Steps**:
  1. Set browser to Italian
  2. Navigate through email UI
- **Expected**: All text in Italian, no translation keys visible
- **Notes**:

### 9.3 Button Labels

- [ ] **TEST**: All buttons translated
- **Steps**:
  1. Check Reply, Forward, Delete, Archive buttons
- **Expected**: Proper language on all buttons
- **Notes**:

### 9.4 Form Labels

- [ ] **TEST**: Form labels translated
- **Steps**:
  1. Open advanced search
  2. Check all field labels
- **Expected**: To, From, Subject, etc. translated
- **Notes**:

### 9.5 Error Messages

- [ ] **TEST**: Error messages translated
- **Steps**:
  1. Trigger validation error
  2. Check message text
- **Expected**: Error in current locale language
- **Notes**:

### 9.6 Placeholder Text

- [ ] **TEST**: Input placeholders translated
- **Steps**:
  1. Check search bar placeholder
  2. Check compose To field placeholder
- **Expected**: Placeholders in current language
- **Notes**:

### 9.7 Dynamic Text with Placeholders

- [ ] **TEST**: "X unread" displays correctly
- **Steps**:
  1. Check header stats
  2. Verify number + text format
- **Expected**: "4 unread" or "4 non lette" based on locale
- **Notes**:

### 9.8 Date Formatting

- [ ] **TEST**: Dates respect locale
- **Steps**:
  1. Check email dates in Italian locale
- **Expected**: "29 dic" not "Dec 29"
- **Notes**:

---

## 10. Edge Cases (12 tests)

### 10.1 Empty Inbox

- [ ] **TEST**: Empty inbox shows message
- **Expected**: Friendly empty state, not error

### 10.2 Very Long Subjects

- [ ] **TEST**: Long subject truncates properly
- **Expected**: Ellipsis, no layout break

### 10.3 Very Long Recipient Lists

- [ ] **TEST**: Many CC recipients display
- **Expected**: Shows first few + "and X more"

### 10.4 Large Attachments

- [ ] **TEST**: Large file upload (>10MB)
- **Expected**: Progress indicator, successful upload

### 10.5 Malformed HTML

- [ ] **TEST**: Bad HTML in email body
- **Expected**: Renders safely, no XSS

### 10.6 Invalid Sender Format

- [ ] **TEST**: Email without proper From header
- **Expected**: Falls back to "Unknown sender"

### 10.7 Missing Subject

- [ ] **TEST**: Email with no subject
- **Expected**: Shows "(No Subject)" placeholder

### 10.8 Network Error

- [ ] **TEST**: API call fails
- **Expected**: Error toast, retry option

### 10.9 Optimistic Update Rollback

- [ ] **TEST**: Star fails, rolls back
- **Steps**:
  1. Star email
  2. Disconnect network immediately
- **Expected**: Star reverts after error

### 10.10 Session Expiry

- [ ] **TEST**: Token expires mid-session
- **Expected**: Redirect to login, no data loss

### 10.11 Concurrent Edits

- [ ] **TEST**: Star same email in two tabs
- **Expected**: Last write wins, no corruption

### 10.12 Provider Sync Errors

- [ ] **TEST**: Gmail API returns error
- **Expected**: Error displayed, local data preserved

---

## Test Summary

| Section | Total Tests | Passed | Failed |
|---------|-------------|--------|--------|
| 1. Smart Filters | 8 | | |
| 2. Email List View | 12 | | |
| 3. Email Thread View | 15 | | |
| 4. Bulk Actions | 14 | | |
| 5. Compose Dialog | 18 | | |
| 6. Advanced Search | 16 | | |
| 7. Attachment Handling | 10 | | |
| 8. API Integration | 25 | | |
| 9. Translation Verification | 8 | | |
| 10. Edge Cases | 12 | | |
| **TOTAL** | **138** | | |

---

## Known Issues Log

| Issue | Description | Status | Fix Date |
|-------|-------------|--------|----------|

---

## Testing Environment

- **Browser**: Chrome/Firefox/Safari
- **Date**:
- **Tester**:
- **Build Version**:
- **Backend Status**: Running / Not Running
- **Provider Connected**: Gmail / Outlook / IMAP
