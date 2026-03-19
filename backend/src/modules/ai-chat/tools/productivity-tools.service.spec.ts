import { ProductivityToolsService } from './productivity-tools.service';

describe('ProductivityToolsService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  const createService = () => {
    const prisma = {
      email: {
        findFirst: jest.fn(),
      },
      userLabel: {
        findMany: jest.fn(),
      },
    } as any;

    const emailCrudService = {
      getEmailById: jest.fn(),
      updateEmail: jest.fn(),
    } as any;

    const emailBulkService = {
      bulkAddLabels: jest.fn(),
      bulkRemoveLabels: jest.fn(),
    } as any;

    const service = new ProductivityToolsService(
      prisma,
      emailCrudService,
      emailBulkService,
    );

    return { service, prisma, emailCrudService, emailBulkService };
  };

  it('maps fuzzy label names to real tenant labels and uses bulk label flow', async () => {
    const { service, prisma, emailCrudService, emailBulkService } = createService();
    prisma.email.findFirst.mockResolvedValue({ id: 'email-1' });
    prisma.userLabel.findMany.mockResolvedValue([
      { id: 'label-urgent', name: 'Urgente' },
      { id: 'label-trash', name: 'Da eliminare' },
    ]);
    emailCrudService.getEmailById.mockResolvedValue({
      id: 'email-1',
      emailLabels: [
        { label: { name: 'Urgente' } },
      ],
    });

    const tools = service.getTools(tenantId, userId);
    const result = await (tools.label_email as any).execute({
      emailId: 'email-1',
      addLabels: ['urgent'],
    });

    expect(emailBulkService.bulkAddLabels).toHaveBeenCalledWith(
      ['email-1'],
      tenantId,
      ['label-urgent'],
    );
    expect(result).toMatchObject({
      success: true,
      emailId: 'email-1',
      addedLabels: ['Urgente'],
      currentLabels: ['Urgente'],
    });
  });

  it('returns available labels when no requested labels match the workspace', async () => {
    const { service, prisma, emailBulkService } = createService();
    prisma.email.findFirst.mockResolvedValue({ id: 'email-1' });
    prisma.userLabel.findMany.mockResolvedValue([
      { id: 'label-urgent', name: 'Urgente' },
      { id: 'label-spam', name: 'Spam' },
    ]);

    const tools = service.getTools(tenantId, userId);
    const result = await (tools.label_email as any).execute({
      emailId: 'email-1',
      addLabels: ['reference'],
    });

    expect(emailBulkService.bulkAddLabels).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: 'No matching labels found',
      unmatchedLabels: ['reference'],
      availableLabels: ['Urgente', 'Spam'],
    });
  });
});
