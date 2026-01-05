const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/email-sync/services/folder-sync.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
const originalLineEndings = content.includes('\r\n') ? 'crlf' : 'lf';
content = content.replace(/\r\n/g, '\n');

// Fix CRIT-4: Lock TTL 60s -> 300s
content = content.replace(
  'const lockTtl = 60000; // 60 seconds - folder sync should complete within this time',
  `// FIX CRIT-4 (2025-01-05): 60s was too short - nested folder fetching can take >60s
    // Lock expires mid-sync → concurrent sync starts → duplicate DB writes → P2002 errors
    const lockTtl = 300000; // 5 minutes - safe margin for large mailboxes`
);

// Fix CRIT-5: Move to TRASH not INBOX
content = content.replace(
  'Moving ${emailsInFolder} emails from folder "${folder.name}" to INBOX before deletion',
  'Moving ${emailsInFolder} emails from folder "${folder.name}" to TRASH before deletion'
);
content = content.replace(
  "data: { folder: 'INBOX' },",
  `// FIX CRIT-5 (2025-01-05): Move to TRASH not INBOX - prevents spam flooding inbox
          data: { folder: 'TRASH' },`
);
content = content.replace(
  'Moved ${emailsInFolder} emails to INBOX',
  'Moved ${emailsInFolder} emails to TRASH'
);

// Restore original line endings
if (originalLineEndings === 'crlf') {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content);
console.log('CRIT-4 and CRIT-5 fixes applied to folder-sync.service.ts');
