import { test, expect } from '@playwright/test';

test('debug: org create API response', async ({ page }) => {
  await page.goto('/dashboard/admin/organizations', { waitUntil: 'networkidle' });
  
  // Direct API call with session cookies
  const createResponse = await page.request.post('/api/auth/organization/create', {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    data: { name: 'Debug Org ' + Date.now(), slug: 'debug-org-' + Date.now() },
  });
  
  console.log('CREATE STATUS:', createResponse.status());
  console.log('CREATE BODY:', await createResponse.text());
  
  const listResponse = await page.request.get('/api/auth/organization/list', {
    headers: { Accept: 'application/json' },
  });
  console.log('LIST STATUS:', listResponse.status());
  console.log('LIST BODY:', await listResponse.text());
  
  expect(createResponse.status()).toBe(200);
});
