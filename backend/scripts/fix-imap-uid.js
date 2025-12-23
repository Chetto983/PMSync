const fs = require('fs');
const path = require('path').join(__dirname, '../src/modules/email/services/attachment-on-demand.service.ts');
let content = fs.readFileSync(path, 'utf8');

// Detect line ending style
const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

// Find and replace the old IMAP UID parsing pattern
const oldCode = [
  '      // Parse UID from externalMessageId',
  '      const uid = parseInt(externalMessageId, 10);',
  '      if (isNaN(uid)) {',
  '        throw new Error(`Invalid IMAP UID: ${externalMessageId}`);',
  '      }'
].join(lineEnding);

const newCode = [
  '      // Parse UID from externalMessageId',
  '      // IMAP externalId format is "folder:uid" (e.g., "INBOX:271")',
  '      // Extract just the numeric UID part',
  '      let rawUid = externalMessageId;',
  '      if (rawUid.includes(\':\')) {',
  '        rawUid = rawUid.split(\':\').pop() || rawUid;',
  '      }',
  '      const uid = parseInt(rawUid, 10);',
  '      if (isNaN(uid)) {',
  '        throw new Error(`Invalid IMAP UID: ${externalMessageId} (parsed: ${rawUid})`);',
  '      }'
].join(lineEnding);

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(path, content);
  console.log('IMAP UID parsing fix applied successfully');
} else {
  console.log('Pattern not found - checking file content...');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Parse UID')) {
      console.log('Found at line', i + 1);
      for (let j = i; j < Math.min(i + 6, lines.length); j++) {
        console.log(`  ${j + 1}: "${lines[j]}"`);
      }
    }
  }
}
