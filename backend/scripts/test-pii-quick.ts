import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PiiDetectionService } from '../src/modules/ai/guards/pii-detection-sentinel.service';

async function test() {
  console.log('Starting PII Detection Test...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn']
  });

  const piiService = app.get(PiiDetectionService);

  const testEmail = 'secret.debug.test@example.com';
  const testPhone = '+1-555-999-8888';
  const testSsn = '999-88-7777';

  console.log('--- EMAIL TEST ---');
  const emailResult = piiService.detect(`Contact ${testEmail}`);
  console.log('Input: Contact ' + testEmail);
  console.log('hasPii:', emailResult.hasPii);
  console.log('detectedTypes:', emailResult.detectedTypes);
  console.log('Redacted:', emailResult.redactedText);
  console.log('');

  console.log('--- PHONE TEST ---');
  const phoneResult = piiService.detect(`Call ${testPhone}`);
  console.log('Input: Call ' + testPhone);
  console.log('hasPii:', phoneResult.hasPii);
  console.log('detectedTypes:', phoneResult.detectedTypes);
  console.log('Redacted:', phoneResult.redactedText);
  console.log('');

  console.log('--- SSN TEST ---');
  const ssnResult = piiService.detect(`SSN: ${testSsn}`);
  console.log('Input: SSN: ' + testSsn);
  console.log('hasPii:', ssnResult.hasPii);
  console.log('detectedTypes:', ssnResult.detectedTypes);
  console.log('Redacted:', ssnResult.redactedText);
  console.log('');

  console.log('--- COMBINED TEST ---');
  const combined = `Email ${testEmail}, phone ${testPhone}, SSN ${testSsn}`;
  const combinedResult = piiService.detect(combined);
  console.log('Input:', combined);
  console.log('hasPii:', combinedResult.hasPii);
  console.log('detectedTypes:', combinedResult.detectedTypes);
  console.log('piiCount:', combinedResult.piiCount);
  console.log('Redacted:', combinedResult.redactedText);

  await app.close();
  console.log('\nDone!');
}

test().catch(e => { console.error('ERROR:', e); process.exit(1); });
