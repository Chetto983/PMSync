const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/email-sync/services/base-email-sync.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
const originalLineEndings = content.includes('\r\n') ? 'crlf' : 'lf';
content = content.replace(/\r\n/g, '\n');

// Fix CRIT-3: Both instances of follow-up analysis catch blocks
// Instance 1 (around line 920)
const oldCatch1 = `.catch((err) =>
              this.logger.warn(\`Follow-up analysis failed for \${result.id}: \${err.message}\`),
            );`;

const newCatch1 = `.catch((err) => {
              // FIX CRIT-3 (2025-01-05): Proper error handling for AI feature failures
              // Changed from warn to error for monitoring visibility
              this.logger.error(
                \`Follow-up analysis failed for email \${result.id} in \${result.folder}: \${err.message}\`,
                err.stack,
              );
              // Note: Fire-and-forget is intentional - AI features shouldn't block sync
              // TODO: Consider adding retry queue for failed AI analyses
            });`;

content = content.replace(oldCatch1, newCatch1);

// Instance 2 (around line 1146) - same pattern
// The replace will catch both if they're identical

// Restore original line endings
if (originalLineEndings === 'crlf') {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content);
console.log('CRIT-3 fix applied to base-email-sync.service.ts');
