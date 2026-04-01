import type { NextRouter } from 'next/router';
import { buildCommands, GROUP_ORDER, GROUP_LABELS } from './commands';
import type { AppTranslations } from '@/locales';

const push = jest.fn();

const router = {
  push,
} as unknown as NextRouter;

const t = {
  commandPalette: {
    navigation: 'Navigation',
    crmNavigation: 'CRM',
    actions: 'Actions',
    ai: 'AI',
    productivity: 'Productivity',
    system: 'System',
    commands: {
      goToDashboard: 'Go to Dashboard',
      goToInbox: 'Go to Inbox',
      goToCalendar: 'Go to Calendar',
      goToContacts: 'Go to Contacts',
      goToAiAssistant: 'Go to AI Assistant',
      goToAnalytics: 'Go to Analytics',
      goToSettings: 'Go to Settings',
      goToPipelines: 'Go to Pipelines',
      goToDeals: 'Go to Deals',
      goToTickets: 'Go to Tickets',
      goToAccounts: 'Go to Accounts',
      goToKB: 'Go to KB',
      goToForecast: 'Go to Forecast',
      goToChurn: 'Go to Churn',
      goToServiceAnalytics: 'Go to Service Analytics',
      goToAiGovernance: 'Go to AI Governance',
      goToReminders: 'Go to Reminders',
      goToAdmin: 'Go to Admin',
      composeEmail: 'Compose Email',
      searchEmails: 'Search Emails',
      createDeal: 'Create Deal',
      createTask: 'Create Task',
      createTicket: 'Create Ticket',
      createContact: 'Create Contact',
      aiSummarize: 'Summarize',
      aiQuickReply: 'Quick Reply',
      aiComposeContext: 'Compose with Context',
      viewFollowups: 'Follow-ups',
      viewDeadlines: 'Deadlines',
      viewStaleContacts: 'Stale Contacts',
      archiveSelected: 'Archive Selected',
      toggleStar: 'Toggle Star',
      deleteSelected: 'Delete Selected',
      searchAiMemories: 'Search AI Memories',
      searchDocuments: 'Search Documents',
      logout: 'Logout',
    },
  },
} as unknown as AppTranslations;

describe('buildCommands', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('includes CRM navigation and create actions', () => {
    const commands = buildCommands(router, t, jest.fn());

    expect(commands.find((command) => command.id === 'crm-pipelines')?.group).toBe('crm');
    expect(commands.find((command) => command.id === 'crm-deals')?.group).toBe('crm');
    expect(commands.find((command) => command.id === 'create-deal')?.group).toBe('actions');
    expect(commands.find((command) => command.id === 'create-ticket')?.group).toBe('actions');
  });

  it('exports stable group ordering and labels', () => {
    expect(GROUP_ORDER).toEqual(['navigation', 'crm', 'actions', 'ai', 'productivity', 'system']);
    expect(GROUP_LABELS.crm(t)).toBe('CRM');
    expect(GROUP_LABELS.navigation(t)).toBe('Navigation');
  });

  it('routes action commands to supported page contracts', () => {
    const commands = buildCommands(router, t, jest.fn());

    commands.find((command) => command.id === 'compose')?.action();
    commands.find((command) => command.id === 'create-task')?.action();
    commands.find((command) => command.id === 'deadlines')?.action();

    expect(push).toHaveBeenNthCalledWith(1, '/dashboard/email/compose');
    expect(push).toHaveBeenNthCalledWith(2, '/dashboard/reminders?action=create');
    expect(push).toHaveBeenNthCalledWith(3, '/dashboard/reminders');
  });
});
