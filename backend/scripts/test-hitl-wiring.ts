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
import { VoltAgentController } from '../src/modules/ai/voltagent/voltagent.controller';
import {
  MemoryController,
  FollowUpController,
  AnalyticsController,
  KnowledgeController,
  CrmController,
  SchedulingController,
  ConversationController,
  DocumentLibraryController,
} from '../src/modules/ai/voltagent/controllers';

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

  const controllers: [string, any][] = [
    ['VoltAgentController', VoltAgentController],
    ['MemoryController', MemoryController],
    ['FollowUpController', FollowUpController],
    ['AnalyticsController', AnalyticsController],
    ['KnowledgeController', KnowledgeController],
    ['CrmController', CrmController],
    ['SchedulingController', SchedulingController],
    ['ConversationController', ConversationController],
    ['DocumentLibraryController', DocumentLibraryController],
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

  // Test controllers
  const controllerResults: { name: string; status: string }[] = [];

  for (const [controllerName, ControllerClass] of controllers) {
    try {
      const controller = app.get(ControllerClass);
      controllerResults.push({
        name: controllerName,
        status: controller ? 'OK' : 'NULL',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 50) : String(e);
      controllerResults.push({
        name: controllerName,
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
  console.log(`Services: ${passed}/${results.length} OK\n`);

  console.log('Controller Wiring Check:');
  console.log('---------------------------------------------------\n');

  for (const r of controllerResults) {
    const icon = r.status === 'OK' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${r.name}: ${r.status}`);
  }

  const ctrlPassed = controllerResults.filter((r) => r.status === 'OK').length;
  console.log(`\n---------------------------------------------------`);
  console.log(`Controllers: ${ctrlPassed}/${controllerResults.length} OK\n`);

  const totalPassed = passed + ctrlPassed;
  const totalCount = results.length + controllerResults.length;

  console.log('===================================================');
  console.log(`TOTAL: ${totalPassed}/${totalCount} components OK`);
  console.log('===================================================\n');

  await app.close();
  process.exit(totalPassed === totalCount ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
