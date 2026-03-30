/**
 * Template Validation (INFRA-09)
 *
 * INFRA-09: Template CRUD + duplicate + default + categories.
 */
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  assertTrue,
  setResultsCollector,
} from './validation-helpers.mjs';

/**
 * Run template validation checks.
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token
 * @returns {Array} Results array for report()
 */
export async function validateTemplates(context, cookieHeader, csrfToken) {
  const results = [];
  const createdIds = [];

  const r = { name: 'INFRA-09: Template CRUD + Duplicate + Default', checks: 0, passed: 0, failed: 0, failures: [] };
  setResultsCollector(r);

  try {
    console.log('\n  --- INFRA-09: Template CRUD + duplicate + default ---');

    // Step 1: Create a template
    console.log('  Step 1: Creating template...');
    const createBody = {
      name: `Test Template ${Date.now()}`,
      subject: 'Template Subject',
      bodyHtml: '<p>Template body</p>',
      category: 'test',
      isDefault: true,
    };
    const createResult = await apiPost(context, '/api/v1/emails/templates', createBody, cookieHeader, csrfToken);
    const tpl1 = createResult?.data || createResult;
    console.log(`  Created: ${JSON.stringify(tpl1).substring(0, 200)}`);
    assertTrue(tpl1?.id, 'INFRA-09: Create template returns id');
    assertTrue(tpl1?.name?.includes('Test Template'), 'INFRA-09: Create template returns correct name');
    if (tpl1?.id) createdIds.push(tpl1.id);

    // Step 2: List templates
    console.log('  Step 2: Listing templates...');
    const listData = await apiGet(context, '/api/v1/emails/templates', cookieHeader);
    const tplList = listData?.data || listData;
    // Response shape: { templates: [...], total: N } or raw array
    const templates = tplList?.templates || (Array.isArray(tplList) ? tplList : []);
    console.log(`  Templates count: ${templates.length}`);
    const foundInList = templates.find(t => t.id === tpl1?.id);
    assertTrue(!!foundInList, 'INFRA-09: Created template appears in list');

    // Step 3: Get by ID
    console.log('  Step 3: Getting template by ID...');
    const getResult = await apiGet(context, `/api/v1/emails/templates/${tpl1?.id}`, cookieHeader);
    const tplGet = getResult?.data || getResult;
    assertTrue(tplGet?.id === tpl1?.id, 'INFRA-09: GET by ID returns correct template');

    // Step 4: Update template
    console.log('  Step 4: Updating template...');
    const updateResult = await apiPatch(
      context,
      `/api/v1/emails/templates/${tpl1?.id}`,
      { name: 'Updated Template' },
      cookieHeader,
      csrfToken,
    );
    const tplUpdated = updateResult?.data || updateResult;
    assertTrue(tplUpdated?.name === 'Updated Template', 'INFRA-09: Update template changes name');

    // Step 5: Duplicate template
    console.log('  Step 5: Duplicating template...');
    const dupResult = await apiPost(
      context,
      `/api/v1/emails/templates/${tpl1?.id}/duplicate`,
      null,
      cookieHeader,
      csrfToken,
    );
    const tplDup = dupResult?.data || dupResult;
    console.log(`  Duplicate: ${JSON.stringify(tplDup).substring(0, 200)}`);
    assertTrue(tplDup?.id, 'INFRA-09: Duplicate returns new template id');
    assertTrue(tplDup?.id !== tpl1?.id, 'INFRA-09: Duplicate id differs from original');
    const dupName = tplDup?.name || '';
    assertTrue(dupName.includes('Copy') || dupName.includes('copy'), 'INFRA-09: Duplicate name contains "Copy"');
    if (tplDup?.id) createdIds.push(tplDup.id);

    // Step 6: Get default template
    console.log('  Step 6: Getting default template...');
    const defaultResult = await apiGet(context, '/api/v1/emails/templates/default', cookieHeader);
    const tplDefault = defaultResult?.data || defaultResult;
    assertTrue(tplDefault?.id === tpl1?.id, 'INFRA-09: Default template matches created one');

    // Step 7: Set duplicate as default
    console.log('  Step 7: Setting duplicate as default...');
    const setDefaultResult = await apiPost(
      context,
      `/api/v1/emails/templates/${tplDup?.id}/set-default`,
      null,
      cookieHeader,
      csrfToken,
    );
    const tplNewDefault = setDefaultResult?.data || setDefaultResult;
    assertTrue(tplNewDefault?.id === tplDup?.id || tplNewDefault?.isDefault === true,
      'INFRA-09: Set-default returns the new default template');

    // Verify new default
    const default2Result = await apiGet(context, '/api/v1/emails/templates/default', cookieHeader);
    const tplDefault2 = default2Result?.data || default2Result;
    assertTrue(tplDefault2?.id === tplDup?.id, 'INFRA-09: Duplicate is now the default template');

    // Step 8: Get categories
    console.log('  Step 8: Getting template categories...');
    const catResult = await apiGet(context, '/api/v1/emails/templates/categories', cookieHeader);
    const categories = catResult?.data || catResult;
    const catList = Array.isArray(categories) ? categories : [];
    console.log(`  Categories: ${JSON.stringify(catList)}`);
    const hasTestCat = catList.includes('test');
    assertTrue(hasTestCat, 'INFRA-09: Categories include "test"');
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    assertTrue(false, `INFRA-09: Template CRUD completes without error: ${err.message}`);
  }

  results.push(r);

  // Cleanup: delete templates in reverse order
  for (const id of createdIds.reverse()) {
    try {
      console.log(`  Cleanup: Deleting template ${id}...`);
      await apiDelete(context, `/api/v1/emails/templates/${id}`, cookieHeader, csrfToken);
    } catch (err) {
      console.log(`  Cleanup warning: ${err.message}`);
    }
  }

  setResultsCollector(null);
  return results;
}
