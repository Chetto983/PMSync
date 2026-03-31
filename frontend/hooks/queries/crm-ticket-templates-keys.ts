export const crmTicketTemplateKeys = {
  all: ['crm-ticket-templates'] as const,
  list: (category?: string) =>
    [...crmTicketTemplateKeys.all, 'list', category ?? 'all'] as const,
};
