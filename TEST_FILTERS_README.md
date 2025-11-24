# Email Filters and AI Search Tests

This directory contains test scripts to verify the new email filtering and AI search functionality.

## Test Files

### 1. `test-email-filters.js`
Tests the new backend email filters:
- **Recipient filter (to)**: Filter emails by recipient email address
- **Subject filter**: Filter emails by subject keywords
- **Label filter (labelIds)**: Filter emails by one or more labels
- **Combined filters**: Test multiple filters working together

### 2. `test-ai-search.js`
Tests the AI-powered semantic search:
- Natural language queries
- Topic-based search
- Sender + topic combinations
- Time-based queries
- Result quality analysis

## Prerequisites

Before running the tests, ensure:

1. ✅ Backend server is running on `http://localhost:3000`
2. ✅ You have a valid JWT authentication token
3. ✅ Test data exists in the database (emails, labels, etc.)
4. ✅ For AI tests: Knowledge base is populated with embeddings

## Getting Your JWT Token

### Option 1: From Browser DevTools
1. Open the frontend in your browser
2. Log in to your account
3. Open DevTools (F12)
4. Go to **Application** tab → **Local Storage**
5. Find the key `auth-storage`
6. Copy the `token` value from the JSON

### Option 2: From Network Tab
1. Open DevTools (F12)
2. Go to **Network** tab
3. Make any API request (e.g., refresh email list)
4. Click on the request
5. Check **Request Headers** → **Authorization**
6. Copy the token after `Bearer `

## Running the Tests

### Test Email Filters

```bash
# 1. Install dependencies (if needed)
npm install node-fetch

# 2. Edit the test file
# Open test-email-filters.js
# Update TOKEN constant with your JWT token

# 3. Run the test
node test-email-filters.js
```

### Test AI Search

```bash
# 1. Install dependencies (if needed)
npm install node-fetch

# 2. Edit the test file
# Open test-ai-search.js
# Update TOKEN constant with your JWT token

# 3. Ensure knowledge base is populated
# Make a POST request to /ai/knowledge-base/emails/backfill

# 4. Run the test
node test-ai-search.js
```

## Expected Output

### Email Filters Test
```
======================================================================
  Email Filters Test Suite
======================================================================

──────────────────────────────────────────────────────────────────────
Test 1: Filter by recipient (to)
──────────────────────────────────────────────────────────────────────

🔍 Testing: http://localhost:3000/emails?to=example@gmail.com

✅ Filter by recipient (to)
   Total emails: 15
   Returned: 15
   Sample results:
     1. Project Update
        From: john@company.com
        To: example@gmail.com, team@company.com
     2. Meeting Notes
        From: sarah@company.com
        To: example@gmail.com
   ✓ All results match the filter
```

### AI Search Test
```
======================================================================
  AI Semantic Search Test Suite
======================================================================

──────────────────────────────────────────────────────────────────────

🤖 Query: "Show me urgent emails from last week"
   Query used: "urgent emails last week"
   Results found: 5
   Top results:
     1. [87%] URGENT: Server Down
        From: ops@company.com
        Date: 1/20/2025
        Snippet: We are experiencing critical server issues that need immediate attention...
        Email ID: abc-123
     2. [82%] Time-sensitive: Client Response Needed
        From: sales@company.com
        Date: 1/19/2025
        Snippet: The client is waiting for our response by end of day...
        Email ID: def-456
   📊 Average relevance score: 84%
   ✅ High quality results
```

## Troubleshooting

### "Unauthorized" Error
- Your JWT token expired. Get a fresh token from the browser
- Token is invalid. Make sure you copied it correctly

### No Results Found
- Check if test data exists in your database
- Verify filters are case-insensitive (backend uses Prisma `mode: 'insensitive'`)
- For AI search: ensure embeddings are generated

### AI Search Returns Poor Results
- Run embeddings backfill: `POST /ai/knowledge-base/emails/backfill`
- Check AI service configuration (Mistral API key)
- Ensure emails have sufficient text content (not just empty emails)

### TypeScript/Import Errors
- The tests use CommonJS `require()` for Node.js compatibility
- If using ES modules, convert to `import` syntax

## Customizing Tests

### Add Custom Label Test
```javascript
// In test-email-filters.js, uncomment and update:
await testLabelFilter('your-actual-label-id-here');
await testMultipleLabelFilter(['label-id-1', 'label-id-2']);
```

### Add Custom AI Query
```javascript
// In test-ai-search.js, add to TEST_QUERIES array:
const TEST_QUERIES = [
  // ... existing queries
  'Your custom natural language query here',
];
```

## Integration with CI/CD

To run these tests in CI/CD:

```bash
# Run all tests
npm run test:filters

# Or manually:
node test-email-filters.js && node test-ai-search.js
```

Add to `package.json`:
```json
{
  "scripts": {
    "test:filters": "node test-email-filters.js",
    "test:ai": "node test-ai-search.js"
  }
}
```

## Next Steps

After verifying the tests pass:

1. ✅ Test filters via the **Advanced Search Dialog** in the UI
2. ✅ Test AI search via the **AI Search Bar** in the header
3. ✅ Verify real-time updates still work with filters applied
4. ✅ Test combinations of filters (e.g., labels + date range + subject)
5. ✅ Test edge cases (empty results, special characters, etc.)

## Support

If tests fail or you encounter issues:
- Check backend logs for errors
- Verify database schema is up to date (`npx prisma generate`)
- Ensure all services are running (backend, database, AI service)
- Check CORS settings if running from different origin
