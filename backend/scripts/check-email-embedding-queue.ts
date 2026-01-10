/// <reference types="node" />
import 'dotenv/config';
import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD,
};

async function check() {
  // The actual embedding work queue
  const queue = new Queue('email-embedding', { connection });
  
  console.log('=== EMAIL EMBEDDING QUEUE STATUS ===');
  
  const waiting = await queue.getWaiting();
  const active = await queue.getActive();
  const completed = await queue.getCompleted(0, 10);
  const failed = await queue.getFailed(0, 20);
  const delayed = await queue.getDelayed();

  console.log('Queue counts:');
  console.log('  Waiting:', waiting.length);
  console.log('  Active:', active.length);
  console.log('  Completed (last 10):', completed.length);
  console.log('  Failed:', failed.length);
  console.log('  Delayed:', delayed.length);

  if (failed.length > 0) {
    console.log('\n=== FAILED JOBS ===');
    for (const f of failed.slice(0, 5)) {
      console.log('- ID:', f.id);
      console.log('  Reason:', f.failedReason?.slice(0, 150));
      console.log('  Attempts:', f.attemptsMade);
      console.log('');
    }
  }

  if (completed.length > 0) {
    console.log('\n=== LAST COMPLETED ===');
    const last = completed[0];
    console.log('ID:', last.id);
    console.log('Finished:', last.finishedOn ? new Date(last.finishedOn).toISOString() : 'N/A');
    console.log('Result:', JSON.stringify(last.returnvalue)?.slice(0, 200));
  }

  await queue.close();
}
check().catch(e => { console.error(e); process.exit(1); });
