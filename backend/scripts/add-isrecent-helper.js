const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/email-sync/services/base-email-sync.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

const helper = `
/**
 * Check if email is recent enough for AI analysis
 * During full sync, old emails don't need follow-up detection
 * @param receivedAt Email received date
 * @param days Number of days to consider "recent" (default 14)
 */
function isRecentEmail(receivedAt: Date | null | undefined, days = 14): boolean {
  if (!receivedAt) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return receivedAt > cutoff;
}

`;

// Check if already exists
if (content.includes('function isRecentEmail')) {
  console.log('Helper already exists');
  process.exit(0);
}

// Find insertion point after last import
const importPattern = /import { WritingStyleService }[^\n]+\n/;
const match = content.match(importPattern);
if (match) {
  const insertPoint = content.indexOf(match[0]) + match[0].length;
  content = content.slice(0, insertPoint) + helper + content.slice(insertPoint);
  fs.writeFileSync(filePath, content);
  console.log('Added isRecentEmail helper function');
} else {
  console.error('Could not find insertion point');
  process.exit(1);
}
