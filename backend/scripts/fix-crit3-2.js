const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/email-sync/services/base-email-sync.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Find remaining warn logs for follow-up analysis
const pattern = /\.catch\(\(err\) =>\s*\n\s*this\.logger\.warn\(`Follow-up analysis failed for \$\{result\.id\}: \$\{err\.message\}`\),?\s*\n\s*\);/g;

const replacement = `.catch((err) => {
              // FIX CRIT-3 (2025-01-05): Proper error handling for AI feature failures
              // Changed from warn to error for monitoring visibility
              this.logger.error(
                \`Follow-up analysis failed for email \${result.id} in \${result.folder}: \${err.message}\`,
                err.stack,
              );
              // Note: Fire-and-forget is intentional - AI features shouldn't block sync
              // TODO: Consider adding retry queue for failed AI analyses
            });`;

const count = (content.match(pattern) || []).length;
console.log(`Found ${count} remaining instances to fix`);

content = content.replace(pattern, replacement);
fs.writeFileSync(filePath, content);
console.log('CRIT-3 fix applied to remaining instances');
