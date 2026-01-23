/**
 * VoltAgent Module Export
 *
 * Main export file for the VoltAgent integration.
 */

export { VoltAgentModule } from './voltagent.module';
export { VoltAgentController } from './voltagent.controller';
export {
  VoltAgentService,
  type ChatOptions,
  type ChatResult,
  type PendingAction,
  type SuspendedWorkflow,
} from './voltagent.service';
export { resolveLocale, type SupportedLocale } from './locales';
export * from './agents';
export * from './tools';
// Memory is handled directly in VoltAgentService with retry logic
export * from './workflows';
export * from './providers/mistral.provider';
