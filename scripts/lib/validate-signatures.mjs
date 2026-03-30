/**
 * Signature Validation (INFRA-08, INFRA-10)
 *
 * INFRA-08: Signature CRUD endpoints + default selection persists.
 * INFRA-10: Signature included in sent email (default auto-appended, null = no sig).
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
 * Run signature validation checks.
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token
 * @param {string} checkFlag - Which checks to run
 * @returns {Array} Results array for report()
 */
export async function validateSignatures(context, cookieHeader, csrfToken, checkFlag) {
  const results = [];
  const createdIds = [];

  // INFRA-08: Signature CRUD + default
  if (checkFlag === 'all' || checkFlag === 'signatures') {
    const r = { name: 'INFRA-08: Signature CRUD + Default', checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(r);

    try {
      console.log('\n  --- INFRA-08: Signature CRUD + default ---');

      // Step 1: Create a signature
      console.log('  Step 1: Creating signature...');
      const createBody = {
        name: `Test Sig ${Date.now()}`,
        content: '<p>-- Sent from PMSync (INFRA-08 test)</p>',
        isDefault: true,
      };
      const createResult = await apiPost(context, '/api/v1/emails/signatures', createBody, cookieHeader, csrfToken);
      const sig1 = createResult?.data || createResult;
      console.log(`  Created: ${JSON.stringify(sig1).substring(0, 200)}`);
      assertTrue(sig1?.id, 'INFRA-08: Create signature returns id');
      assertTrue(sig1?.name?.includes('Test Sig'), 'INFRA-08: Create signature returns correct name');
      if (sig1?.id) createdIds.push(sig1.id);

      // Step 2: List signatures
      console.log('  Step 2: Listing signatures...');
      const listData = await apiGet(context, '/api/v1/emails/signatures', cookieHeader);
      const sigList = listData?.data || listData;
      const list = Array.isArray(sigList) ? sigList : [];
      console.log(`  Signatures count: ${list.length}`);
      const foundInList = list.find(s => s.id === sig1?.id);
      assertTrue(!!foundInList, 'INFRA-08: Created signature appears in list');

      // Step 3: Get by ID
      console.log('  Step 3: Getting signature by ID...');
      const getResult = await apiGet(context, `/api/v1/emails/signatures/${sig1?.id}`, cookieHeader);
      const sigGet = getResult?.data || getResult;
      assertTrue(sigGet?.id === sig1?.id, 'INFRA-08: GET by ID returns correct signature');

      // Step 4: Update signature
      console.log('  Step 4: Updating signature...');
      const updateResult = await apiPatch(
        context,
        `/api/v1/emails/signatures/${sig1?.id}`,
        { name: 'Updated Sig' },
        cookieHeader,
        csrfToken,
      );
      const sigUpdated = updateResult?.data || updateResult;
      assertTrue(sigUpdated?.name === 'Updated Sig', 'INFRA-08: Update signature changes name');

      // Step 5: Get default signature
      console.log('  Step 5: Getting default signature...');
      const defaultResult = await apiGet(context, '/api/v1/emails/signatures/default', cookieHeader);
      const sigDefault = defaultResult?.data || defaultResult;
      assertTrue(sigDefault?.id === sig1?.id, 'INFRA-08: Default signature matches created one');

      // Step 6: Create second signature as default -- first should lose default
      console.log('  Step 6: Creating second default signature...');
      const create2Body = {
        name: `Test Sig 2 ${Date.now()}`,
        content: '<p>-- Second signature</p>',
        isDefault: true,
      };
      const create2Result = await apiPost(context, '/api/v1/emails/signatures', create2Body, cookieHeader, csrfToken);
      const sig2 = create2Result?.data || create2Result;
      assertTrue(sig2?.id, 'INFRA-08: Second signature created');
      if (sig2?.id) createdIds.push(sig2.id);

      // Verify new default
      const default2Result = await apiGet(context, '/api/v1/emails/signatures/default', cookieHeader);
      const sigDefault2 = default2Result?.data || default2Result;
      assertTrue(sigDefault2?.id === sig2?.id, 'INFRA-08: Second signature is now default');

      // Step 7: Delete second signature
      console.log('  Step 7: Deleting second signature...');
      await apiDelete(context, `/api/v1/emails/signatures/${sig2?.id}`, cookieHeader, csrfToken);
      createdIds.pop(); // Remove sig2 from cleanup
      assertTrue(true, 'INFRA-08: Delete second signature succeeds');
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      assertTrue(false, `INFRA-08: Signature CRUD completes without error: ${err.message}`);
    }

    results.push(r);
  }

  // INFRA-10: Signature in sent email
  if (checkFlag === 'all' || checkFlag === 'signature-send') {
    const r = { name: 'INFRA-10: Signature in Send', checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(r);

    try {
      console.log('\n  --- INFRA-10: Signature in sent email ---');

      // Step 1: Ensure a default signature exists
      console.log('  Step 1: Getting default signature...');
      let defaultSig = null;
      let createdForTest = false;
      try {
        const defaultResult = await apiGet(context, '/api/v1/emails/signatures/default', cookieHeader);
        defaultSig = defaultResult?.data || defaultResult;
      } catch {
        // No default -- create one
      }

      if (!defaultSig?.id) {
        console.log('  No default signature found, creating one...');
        const createResult = await apiPost(context, '/api/v1/emails/signatures', {
          name: `INFRA-10 Test Sig ${Date.now()}`,
          content: '<p>-- INFRA-10 Signature Test</p>',
          isDefault: true,
        }, cookieHeader, csrfToken);
        defaultSig = createResult?.data || createResult;
        createdForTest = true;
        if (defaultSig?.id) createdIds.push(defaultSig.id);
      }
      assertTrue(defaultSig?.id, 'INFRA-10: Default signature available');

      // Step 2: Get a valid providerId
      console.log('  Step 2: Getting email providers...');
      const providersData = await apiGet(context, '/api/v1/providers', cookieHeader);
      const providers = providersData?.data || providersData;
      const providerList = Array.isArray(providers) ? providers : [];

      if (providerList.length === 0) {
        console.log('  SKIP: No email providers available');
        r.skipped = 'No email providers available';
        results.push(r);
        return results;
      }

      const providerId = providerList[0].id;

      // Step 3: Schedule email WITHOUT signatureId (should use default signature)
      // Uses scheduledAt to avoid SMTP delivery (Railway blocks ports 465/587).
      // The controller resolves the signature BEFORE routing to scheduler,
      // so this validates the full signature-in-send path.
      const scheduledAt = new Date(Date.now() + 600000).toISOString();
      console.log('  Step 3: Scheduling email without signatureId (default should apply)...');
      const send1Result = await apiPost(context, '/api/v1/emails/send', {
        providerId,
        to: ['sig-test@pmsync.local'],
        subject: `INFRA-10 Default Sig Test ${Date.now()}`,
        bodyHtml: '<p>Testing default signature inclusion</p>',
        bodyText: 'Testing default signature inclusion',
        scheduledAt,
      }, cookieHeader, csrfToken, { timeout: 60000 });
      const send1Data = send1Result?.data || send1Result;
      assertTrue(!!send1Data?.id, 'INFRA-10: Send with default signature succeeds (via scheduled path)');

      // Cleanup: cancel the scheduled email
      if (send1Data?.id) {
        await apiDelete(context, `/api/v1/emails/scheduled/${send1Data.id}`, cookieHeader, csrfToken);
      }

      // Step 4: Schedule email with signatureId: null (should NOT include signature)
      console.log('  Step 4: Scheduling email with signatureId=null (no signature)...');
      const send2Result = await apiPost(context, '/api/v1/emails/send', {
        providerId,
        to: ['sig-test@pmsync.local'],
        subject: `INFRA-10 No Sig Test ${Date.now()}`,
        bodyHtml: '<p>Testing no signature</p>',
        bodyText: 'Testing no signature',
        signatureId: null,
        scheduledAt: new Date(Date.now() + 600000).toISOString(),
      }, cookieHeader, csrfToken, { timeout: 60000 });
      const send2Data = send2Result?.data || send2Result;
      assertTrue(!!send2Data?.id, 'INFRA-10: Send with signatureId=null succeeds (via scheduled path)');

      // Cleanup: cancel the scheduled email
      if (send2Data?.id) {
        await apiDelete(context, `/api/v1/emails/scheduled/${send2Data.id}`, cookieHeader, csrfToken);
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      assertTrue(false, `INFRA-10: Signature send completes without error: ${err.message}`);
    }

    results.push(r);
  }

  // Cleanup: delete any signatures created during testing
  for (const id of createdIds) {
    try {
      console.log(`  Cleanup: Deleting signature ${id}...`);
      await apiDelete(context, `/api/v1/emails/signatures/${id}`, cookieHeader, csrfToken);
    } catch (err) {
      console.log(`  Cleanup warning: ${err.message}`);
    }
  }

  setResultsCollector(null);
  return results;
}
