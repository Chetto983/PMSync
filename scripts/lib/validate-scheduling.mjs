/**
 * Scheduling Validation (INFRA-06, INFRA-07)
 *
 * INFRA-06: POST /emails/send with scheduledAt creates a pending ScheduledEmail
 *           record instead of sending immediately.
 * INFRA-07: DELETE /emails/scheduled/:id cancels a pending scheduled email.
 */
import {
  apiGet,
  apiPost,
  apiDelete,
  assertTrue,
  setResultsCollector,
} from './validation-helpers.mjs';

/**
 * Run scheduling validation checks.
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token
 * @param {string} checkFlag - Which checks to run
 * @returns {Array} Results array for report()
 */
export async function validateScheduling(context, cookieHeader, csrfToken, checkFlag) {
  const results = [];
  let scheduledEmailId = null;

  // INFRA-06: Schedule-send
  if (checkFlag === 'all' || checkFlag === 'schedule-send') {
    const r = { name: 'INFRA-06: Schedule Send', checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(r);

    try {
      console.log('\n  --- INFRA-06: Schedule email for later delivery ---');

      // Step 1: Get a valid providerId
      console.log('  Step 1: Getting email providers...');
      const providersData = await apiGet(context, '/api/v1/providers', cookieHeader);
      const providers = providersData?.data || providersData;
      const providerList = Array.isArray(providers) ? providers : [];
      assertTrue(providerList.length > 0, 'INFRA-06: At least one email provider exists');

      if (providerList.length === 0) {
        console.log('  SKIP: No email providers available, cannot test scheduling');
        results.push(r);
        return results;
      }

      const providerId = providerList[0].id;
      console.log(`  Using provider: ${providerId}`);

      // Step 2: POST /emails/send with scheduledAt (10 minutes from now)
      console.log('  Step 2: Scheduling email...');
      const scheduledAt = new Date(Date.now() + 600000).toISOString();
      const sendBody = {
        providerId,
        to: ['test-scheduled@pmsync.local'],
        subject: `INFRA-06 Scheduled Test ${Date.now()}`,
        bodyHtml: '<p>Scheduled validation test</p>',
        bodyText: 'Scheduled validation test',
        scheduledAt,
      };

      const sendResult = await apiPost(context, '/api/v1/emails/send', sendBody, cookieHeader, csrfToken, { timeout: 60000 });
      const sendData = sendResult?.data || sendResult;
      console.log(`  Send response: ${JSON.stringify(sendData).substring(0, 200)}`);

      assertTrue(sendData?.id, 'INFRA-06: Schedule-send returns an id');
      assertTrue(sendData?.scheduledAt, 'INFRA-06: Schedule-send returns scheduledAt');
      scheduledEmailId = sendData?.id;

      // Step 3: GET /emails/scheduled -- verify scheduled email appears
      console.log('  Step 3: Verifying scheduled email in list...');
      const listData = await apiGet(context, '/api/v1/emails/scheduled', cookieHeader);
      const scheduledList = listData?.data || listData;
      const list = Array.isArray(scheduledList) ? scheduledList : [];
      console.log(`  Scheduled emails count: ${list.length}`);

      const found = list.find(e => e.id === scheduledEmailId);
      assertTrue(found, 'INFRA-06: Scheduled email appears in GET /emails/scheduled');
      assertTrue(found?.status === 'pending', 'INFRA-06: Scheduled email has status pending');
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      assertTrue(false, `INFRA-06: Schedule-send completes without error: ${err.message}`);
    }

    results.push(r);
  }

  // INFRA-07: Schedule-cancel
  if (checkFlag === 'all' || checkFlag === 'schedule-cancel') {
    const r = { name: 'INFRA-07: Schedule Cancel', checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(r);

    try {
      console.log('\n  --- INFRA-07: Cancel a scheduled email ---');

      // If no scheduledEmailId from INFRA-06, create one
      if (!scheduledEmailId) {
        console.log('  Step 0: Creating a scheduled email for cancel test...');
        const providersData = await apiGet(context, '/api/v1/providers', cookieHeader);
        const providers = providersData?.data || providersData;
        const providerList = Array.isArray(providers) ? providers : [];

        if (providerList.length === 0) {
          console.log('  SKIP: No email providers available');
          r.skipped = 'No email providers available';
          results.push(r);
          return results;
        }

        const scheduledAt = new Date(Date.now() + 600000).toISOString();
        const sendResult = await apiPost(context, '/api/v1/emails/send', {
          providerId: providerList[0].id,
          to: ['test-cancel@pmsync.local'],
          subject: `INFRA-07 Cancel Test ${Date.now()}`,
          bodyHtml: '<p>Cancel test</p>',
          bodyText: 'Cancel test',
          scheduledAt,
        }, cookieHeader, csrfToken, { timeout: 60000 });

        const sendData = sendResult?.data || sendResult;
        scheduledEmailId = sendData?.id;
        assertTrue(!!scheduledEmailId, 'INFRA-07: Created scheduled email for cancel test');
      }

      // Step 1: DELETE /emails/scheduled/:id
      console.log(`  Step 1: Cancelling scheduled email ${scheduledEmailId}...`);
      const cancelResult = await apiDelete(
        context,
        `/api/v1/emails/scheduled/${scheduledEmailId}`,
        cookieHeader,
        csrfToken,
      );
      const cancelData = cancelResult?.data || cancelResult;
      console.log(`  Cancel response: ${JSON.stringify(cancelData).substring(0, 200)}`);
      assertTrue(cancelData?.success === true, 'INFRA-07: Cancel returns { success: true }');

      // Step 2: GET /emails/scheduled -- verify email is gone
      console.log('  Step 2: Verifying email no longer in list...');
      const listData = await apiGet(context, '/api/v1/emails/scheduled', cookieHeader);
      const scheduledList = listData?.data || listData;
      const list = Array.isArray(scheduledList) ? scheduledList : [];
      const stillExists = list.find(e => e.id === scheduledEmailId);
      assertTrue(!stillExists, 'INFRA-07: Cancelled email no longer in scheduled list');
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      assertTrue(false, `INFRA-07: Schedule-cancel completes without error: ${err.message}`);
    }

    results.push(r);
  }

  // INFRA-06 Gap Closure: Timed delivery via BullMQ cron
  if (checkFlag === 'all' || checkFlag === 'timed-delivery') {
    const r = { name: 'INFRA-06: Timed Delivery (BullMQ)', checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(r);
    let timedEmailId = null;

    try {
      console.log('\n  --- INFRA-06 Gap Closure: Timed delivery via BullMQ cron ---');

      // Step 1: Get provider
      const providersData = await apiGet(context, '/api/v1/providers', cookieHeader);
      const providers = providersData?.data || providersData;
      const providerList = Array.isArray(providers) ? providers : [];
      assertTrue(providerList.length > 0, 'INFRA-06-TD: At least one email provider exists');

      if (providerList.length === 0) {
        console.log('  SKIP: No providers');
        results.push(r);
      } else {
        const providerId = providerList[0].id;

        // Step 2: Schedule email 2 minutes from now
        const scheduledAt = new Date(Date.now() + 120000).toISOString();
        console.log(`  Step 2: Scheduling email for ${scheduledAt} (2min from now)...`);
        const sendResult = await apiPost(context, '/api/v1/emails/send', {
          providerId,
          to: ['timed-delivery-test@pmsync.local'],
          subject: `INFRA-06 Timed Test ${Date.now()}`,
          bodyHtml: '<p>Timed delivery test</p>',
          bodyText: 'Timed delivery test',
          scheduledAt,
        }, cookieHeader, csrfToken, { timeout: 60000 });
        const sendData = sendResult?.data || sendResult;
        timedEmailId = sendData?.id;
        assertTrue(!!timedEmailId, 'INFRA-06-TD: Scheduled email created with id');

        // Step 3: Verify initial status is pending
        const initList = await apiGet(context, '/api/v1/emails/scheduled', cookieHeader);
        const initItems = Array.isArray(initList?.data || initList) ? (initList?.data || initList) : [];
        const initFound = initItems.find(e => e.id === timedEmailId);
        assertTrue(initFound?.status === 'pending', 'INFRA-06-TD: Initial status is pending');

        // Step 4: Poll every 30s for up to 4 minutes for status change
        console.log('  Step 4: Polling for BullMQ cron processing (up to 4 minutes)...');
        const maxWait = 240000; // 4 minutes
        const pollInterval = 30000; // 30 seconds
        const startTime = Date.now();
        let finalStatus = 'pending';
        let statusChanged = false;

        while (Date.now() - startTime < maxWait) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`  ... polling (${elapsed}s elapsed)`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));

          const pollList = await apiGet(context, '/api/v1/emails/scheduled', cookieHeader);
          const pollItems = Array.isArray(pollList?.data || pollList) ? (pollList?.data || pollList) : [];
          const found = pollItems.find(e => e.id === timedEmailId);

          if (!found) {
            // Record was deleted (possible if sent successfully and cleaned up)
            finalStatus = 'deleted';
            statusChanged = true;
            console.log('  Status: record no longer in list (likely sent and cleaned up)');
            break;
          }
          if (found.status !== 'pending') {
            finalStatus = found.status;
            statusChanged = true;
            console.log(`  Status changed to: ${found.status}`);
            break;
          }
          // Check retryCount if available
          if (found.retryCount && found.retryCount > 0) {
            finalStatus = `pending (retryCount=${found.retryCount})`;
            statusChanged = true;
            console.log(`  BullMQ processed: retryCount=${found.retryCount}`);
            break;
          }
        }

        assertTrue(statusChanged, `INFRA-06-TD: BullMQ cron processed scheduled email (final status: ${finalStatus})`);
        // Accept any status change as proof: 'sent', 'failed', 'deleted', or 'pending' with retryCount > 0
        assertTrue(
          finalStatus !== 'pending',
          `INFRA-06-TD: Status is no longer pending (got: ${finalStatus})`
        );
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      assertTrue(false, `INFRA-06-TD: Timed delivery check: ${err.message}`);
    } finally {
      // Cleanup: cancel if still exists
      if (timedEmailId) {
        try {
          await apiDelete(context, `/api/v1/emails/scheduled/${timedEmailId}`, cookieHeader, csrfToken);
          console.log('  Cleanup: cancelled timed delivery test email');
        } catch { /* already processed or deleted */ }
      }
    }

    results.push(r);
  }

  setResultsCollector(null);
  return results;
}
