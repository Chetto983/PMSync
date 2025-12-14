/**
 * VoltAgent Agents Export
 *
 * Exports all agent factory functions and their option types.
 */

export { createEmailAgent, type EmailAgentOptions } from './email.agent';
export { createCalendarAgent, type CalendarAgentOptions } from './calendar.agent';
export { createContactsAgent, type ContactsAgentOptions } from './contacts.agent';
export { createKnowledgeAgent, type KnowledgeAgentOptions } from './knowledge.agent';
export { createGeneralAgent, type GeneralAgentOptions } from './general.agent';
export {
  createSupervisorAgent,
  buildDynamicInstructions,
  type SupervisorAgentOptions,
  type UserContext,
  type ConnectedProvider,
} from './supervisor.agent';
