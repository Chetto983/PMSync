const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/email-sync/drivers/microsoft/microsoft.driver.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings for consistent matching (Windows uses CRLF)
const originalLineEndings = content.includes('\r\n') ? 'crlf' : 'lf';
content = content.replace(/\r\n/g, '\n');

// Add failedIds declaration after messages declaration
const oldDecl = 'const messages: CanonicalMessage[] = [];\n\n    // MEMORY-OPTIMIZED';
const newDecl = 'const messages: CanonicalMessage[] = [];\n    const failedIds: Array<{ id: string; error: string; code?: number }> = [];\n\n    // MEMORY-OPTIMIZED';
content = content.replace(oldDecl, newDecl);

// Replace the double-catch fallback block with proper error handling
const oldCatch = `      } catch (error) {
        this.logger.warn(\`Batch request failed, falling back to sequential: \${error}\`);
        // Fallback to sequential with cleanup
        for (const id of batchIds) {
          try {
            const msg = await this.getMessage(id);
            if (msg) messages.push(msg);
          } catch {
            // Skip failed messages
          }
        }
      }`;

const newCatch = `      } catch (error: any) {
        // FIX CRIT-2 (2025-01-05): Distinguish systemic errors from individual failures
        const statusCode = error?.response?.status || error?.status;

        // Auth errors = don't fallback, throw immediately
        if (statusCode === 401 || statusCode === 403) {
          throw new Error(\`Authentication failed during batch fetch. Token may need refresh.\`);
        }

        // Rate limit = don't fallback, throw with backoff hint
        if (statusCode === 429) {
          throw new Error(\`Rate limited during batch fetch. Retry with backoff.\`);
        }

        this.logger.warn(\`Batch request failed, falling back to sequential: \${error}\`);
        // Fallback to sequential with error tracking
        for (const id of batchIds) {
          try {
            const msg = await this.getMessage(id);
            if (msg) messages.push(msg);
          } catch (seqError: any) {
            // FIX CRIT-2: Track failures instead of swallowing
            const seqStatusCode = seqError?.response?.status || seqError?.status;
            failedIds.push({
              id,
              error: seqError.message || 'Unknown error',
              code: typeof seqStatusCode === 'number' ? seqStatusCode : undefined,
            });
          }
        }
      }`;

content = content.replace(oldCatch, newCatch);

// Add error reporting before return in batchGetMessages
const oldReturn = `    return messages;\n  }\n\n  async batchSetReadStatus`;
const newReturn = `    // FIX CRIT-2 (2025-01-05): Report failures instead of silent swallowing
    if (failedIds.length > 0) {
      const failureRate = failedIds.length / messageIds.length;

      // High failure rate (>20%) = something wrong, throw
      if (failureRate > 0.2) {
        throw new Error(
          \`Batch fetch failed: \${failedIds.length}/\${messageIds.length} messages (\${Math.round(failureRate * 100)}% failure rate). IDs: \${failedIds.slice(0, 5).map((f) => f.id).join(', ')}\${failedIds.length > 5 ? '...' : ''}\`,
        );
      }

      // Low failure rate = log warning but continue
      this.logger.warn(
        \`batchGetMessages: \${failedIds.length}/\${messageIds.length} messages failed to fetch. \` +
          \`Continuing with \${messages.length} successful. Failed IDs: \${failedIds.map((f) => f.id).join(', ')}\`,
      );
    }

    return messages;
  }

  async batchSetReadStatus`;

content = content.replace(oldReturn, newReturn);

// Restore original line endings
if (originalLineEndings === 'crlf') {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content);
console.log('CRIT-2 fix applied to microsoft.driver.ts');
