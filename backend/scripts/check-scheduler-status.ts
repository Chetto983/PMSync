/// <reference types="node" />
import 'dotenv/config';
import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD,
};

async function check() {
  const queue = new Queue('embedding-backfill', { connection });
  
  console.log('=== EMBEDDING BACKFILL QUEUE STATUS ===');
  
  // Check repeatable jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  console.log('Repeatable jobs:', repeatableJobs.length);
  for (const j of repeatableJobs) {
    console.log('  - ' + j.name + ' | pattern: ' + j.pattern + ' | next: ' + (j.next ? new Date(j.next).toISOString() : 'N/A'));
  }

  // Check waiting/active/completed
  const waiting = await queue.getWaiting();
  const active = await queue.getActive();
  const completed = await queue.getCompleted(0, 10);
  const failed = await queue.getFailed(0, 10);

  console.log('\nQueue counts:');
  console.log('  Waiting:', waiting.length);
  console.log('  Active:', active.length);
  console.log('  Completed (last 10):', completed.length);
  console.log('  Failed (last 10):', failed.length);

  if (completed.length > 0) {
    console.log('\nLast completed job:');
    const last = completed[0];
    console.log('  ID:', last.id);
    console.log('  Finished:', last.finishedOn ? new Date(last.finishedOn).toISOString() : 'N/A');
    console.log('  Result:', JSON.stringify(last.returnvalue));
  }

  if (failed.length > 0) {
    console.log('\nRecent failures:');
    for (const f of failed.slice(0, 3)) {
      console.log('  - ' + f.id + ': ' + f.failedReason);
    }
  }

  await queue.close();
}
check().catch(e => { console.error(e); process.exit(1); });
