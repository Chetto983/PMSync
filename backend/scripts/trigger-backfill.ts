/// <reference types="node" />
import 'dotenv/config';
import { Queue, QueueEvents } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD,
};

async function trigger() {
  const queue = new Queue('embedding-backfill', { connection });
  const queueEvents = new QueueEvents('embedding-backfill', { connection });
  
  console.log('Adding manual backfill job...');
  const job = await queue.add('manual-backfill', {
    type: 'manual',
    batchSize: 20
  }, {
    jobId: 'manual-' + Date.now()
  });
  
  console.log('Job added:', job.id);
  console.log('Waiting for completion (15s timeout)...');
  
  try {
    const result = await job.waitUntilFinished(queueEvents, 15000);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.log('Timeout or error:', e.message);
    const state = await job.getState();
    console.log('Job state:', state);
  }
  
  await queueEvents.close();
  await queue.close();
}
trigger().catch(e => { console.error(e); process.exit(1); });
