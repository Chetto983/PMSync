/**
 * Quick HITL Service Wiring Test
 * Verifies the refactored services are properly wired in NestJS
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { HitlService } from '../src/modules/ai/voltagent/services/hitl.service';
import { ActionExecutorService } from '../src/modules/ai/voltagent/services/action-executor.service';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { ApprovalWorkflowService } from '../src/modules/ai/voltagent/services/approval-workflow.service';
import { AgentPoolService } from '../src/modules/ai/voltagent/services/agent-pool.service';
import { AgentMetricsService } from '../src/modules/ai/voltagent/services/agent-metrics.service';

async function main() {
  console.log('\n===================================================');
  console.log('   HITL SERVICE WIRING VERIFICATION');
  console.log('===================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const services: [string, any][] = [
    ['HitlService', HitlService],
    ['ActionExecutorService', ActionExecutorService],
    ['VoltAgentService', VoltAgentService],
    ['ApprovalWorkflowService', ApprovalWorkflowService],
    ['AgentPoolService', AgentPoolService],
    ['AgentMetricsService', AgentMetricsService],
  ];

  const results: { name: string; status: string }[] = [];

  for (const [serviceName, ServiceClass] of services) {
    try {
      const service = app.get(ServiceClass);
      results.push({
        name: serviceName,
        status: service ? 'OK' : 'NULL',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 50) : String(e);
      results.push({
        name: serviceName,
        status: `FAIL: ${msg}`,
      });
    }
  }

  console.log('Service Wiring Check:');
  console.log('---------------------------------------------------\n');

  for (const r of results) {
    const icon = r.status === 'OK' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${r.name}: ${r.status}`);
  }

  const passed = results.filter((r) => r.status === 'OK').length;
  console.log(`\n---------------------------------------------------`);
  console.log(`Result: ${passed}/${results.length} services OK\n`);

  await app.close();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
