const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/email-sync/services/base-email-sync.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
const originalLineEndings = content.includes('\r\n') ? 'crlf' : 'lf';
content = content.replace(/\r\n/g, '\n');

// Problem: Follow-up analysis triggers for ALL new emails, even during full sync
// A full sync of 10,000 emails means 10,000 AI calls!
// Fix: Only analyze follow-ups for recent emails (last 14 days)

// Add isRecentEmail helper function after imports if not exists
const importSection = content.indexOf('import type { FollowUpService }');
if (importSection !== -1) {
  const afterImports = content.indexOf('\n\n', importSection + 50);
  if (afterImports !== -1 && !content.includes('isRecentEmail')) {
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
    // Find good insertion point (after imports, before class)
    const classIdx = content.indexOf('export abstract class BaseEmailSyncService');
    if (classIdx !== -1) {
      content = content.slice(0, classIdx) + helper + content.slice(classIdx);
    }
  }
}

// Modify follow-up trigger to check recency (both instances)
// Pattern 1: The original trigger
const oldTrigger1 = `        // TRIGGER FOLLOW-UP ANALYSIS
        if (userId && !isJunkFolder(result.folder)) {
          this.followUpService
            .analyzeAndCreateFollowUp(`;

const newTrigger1 = `        // TRIGGER FOLLOW-UP ANALYSIS (only for recent emails to avoid storm on full sync)
        // FIX (2025-01-05): Added recency check - old emails during full sync don't need AI analysis
        if (userId && !isJunkFolder(result.folder) && isRecentEmail(result.receivedAt)) {
          this.followUpService
            .analyzeAndCreateFollowUp(`;

content = content.replace(new RegExp(oldTrigger1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newTrigger1);

// Restore original line endings
if (originalLineEndings === 'crlf') {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content);
console.log('Follow-up full sync fix applied');
