const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/email-sync/drivers/google/google.driver.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings for consistent matching (Windows uses CRLF)
const originalLineEndings = content.includes('\r\n') ? 'crlf' : 'lf';
content = content.replace(/\r\n/g, '\n');

// Replace the catch block
const oldCatch = `          } catch (error: any) {
            this.logger.debug(\`Failed to fetch message \${id}: \${error.message}\`);
            return null;
          }`;

const newCatch = `          } catch (error: any) {
            // FIX CRIT-1 (2025-01-05): Accumulate failures instead of swallowing
            const statusCode = error?.response?.status || error?.code;
            failedIds.push({
              id,
              error: error.message || 'Unknown error',
              code: typeof statusCode === 'number' ? statusCode : undefined,
            });
            return null;
          }`;

content = content.replace(oldCatch, newCatch);

// Add error reporting before return
const oldReturn = `    return messages;
  }

  async batchSetReadStatus`;

const newReturn = `    // FIX CRIT-1 (2025-01-05): Report failures instead of silent swallowing
    if (failedIds.length > 0) {
      const failureRate = failedIds.length / messageIds.length;
      const authErrors = failedIds.filter((f) => f.code === 401 || f.code === 403);
      const rateLimitErrors = failedIds.filter((f) => f.code === 429);

      // Auth errors = systemic issue, throw immediately
      if (authErrors.length > 0) {
        throw new Error(
          \`Authentication failed during batch fetch: \${authErrors.length} auth errors. Token may need refresh.\`,
        );
      }

      // Rate limit = back off needed
      if (rateLimitErrors.length > 0) {
        throw new Error(
          \`Rate limited during batch fetch: \${rateLimitErrors.length} messages hit 429. Retry with backoff.\`,
        );
      }

      // High failure rate (>20%) = something wrong, throw
      if (failureRate > 0.2) {
        throw new Error(
          \`Batch fetch failed: \${failedIds.length}/\${messageIds.length} messages (\${Math.round(failureRate * 100)}% failure rate). IDs: \${failedIds.slice(0, 5).map((f) => f.id).join(', ')}\${failedIds.length > 5 ? '...' : ''}\`,
        );
      }

      // Low failure rate = log warning but continue (messages may have been deleted)
      this.logger.warn(
        \`batchGetMessages: \${failedIds.length}/\${messageIds.length} messages failed to fetch. \` +
          \`Continuing with \${messages.length} successful. Failed IDs: \${failedIds.map((f) => f.id).join(', ')}\`,
      );
    }

    return messages;
  }

  async batchSetReadStatus`;

content = content.replace(oldReturn, newReturn);

// Also add failedIds declaration
const oldDecl = 'const messages: CanonicalMessage[] = [];\n\n    // SENIOR-LEVEL OPTIMIZATION';
const newDecl = 'const messages: CanonicalMessage[] = [];\n    const failedIds: Array<{ id: string; error: string; code?: number }> = [];\n\n    // SENIOR-LEVEL OPTIMIZATION';
content = content.replace(oldDecl, newDecl);

// Restore original line endings
if (originalLineEndings === 'crlf') {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content);
console.log('CRIT-1 fix applied to google.driver.ts');
