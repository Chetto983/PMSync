import { ReminderController } from './reminder.controller';

describe('ReminderController', () => {
  const mockReminder = {
    id: 'rem-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    titolo: 'Test reminder',
    descrizione: 'Test description',
    status: 'attivo',
    priorita: 'media',
    scadenzaDatetime: new Date('2026-04-01'),
    condizioneTipo: 'sempre',
    monitoraEmail: false,
    messaggioTelegram: null,
  };

  const reminderService = {
    createReminder: jest.fn(),
    listReminders: jest.fn(),
    getReminder: jest.fn(),
    updateReminder: jest.fn(),
    completeReminder: jest.fn(),
    deleteReminder: jest.fn(),
    bulkDeleteReminders: jest.fn(),
  };

  const req = { user: { id: 'user-1', tenantId: 'tenant-1' } } as any;

  let controller: ReminderController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ReminderController(reminderService as any);
  });

  describe('POST /reminders', () => {
    it('creates a structured reminder', async () => {
      reminderService.createReminder.mockResolvedValue({
        reminder: mockReminder,
        rispostaChat: null,
        failed: false,
      });

      const dto = { titolo: 'Test reminder', priorita: 'media' as const };
      const result = await controller.create(req, dto as any);

      expect(reminderService.createReminder).toHaveBeenCalledWith('tenant-1', 'user-1', dto);
      expect(result.data.reminder).toEqual(mockReminder);
      expect(result.data.failed).toBe(false);
    });

    it('creates an AI-parsed reminder from natural language', async () => {
      reminderService.createReminder.mockResolvedValue({
        reminder: mockReminder,
        rispostaChat: 'Promemoria creato per lunedì',
        failed: false,
      });

      const dto = { inputUtente: 'Ricordami lunedi di chiamare Omron' };
      const result = await controller.create(req, dto as any);

      expect(reminderService.createReminder).toHaveBeenCalledWith('tenant-1', 'user-1', dto);
      expect(result.data.rispostaChat).toBe('Promemoria creato per lunedì');
    });
  });

  describe('GET /reminders', () => {
    it('lists reminders with default pagination', async () => {
      reminderService.listReminders.mockResolvedValue({
        reminders: [mockReminder],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.list(req);

      expect(reminderService.listReminders).toHaveBeenCalledWith('tenant-1', 'user-1', {
        status: undefined,
        priorita: undefined,
        periodo: undefined,
        page: 1,
        limit: 20,
      });
      expect(result.data).toEqual([mockReminder]);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
    });

    it('passes status and priority filters', async () => {
      reminderService.listReminders.mockResolvedValue({
        reminders: [],
        total: 0,
        page: 1,
        limit: 10,
      });

      await controller.list(req, 'completato' as any, 'alta', undefined, '1', '10');

      expect(reminderService.listReminders).toHaveBeenCalledWith('tenant-1', 'user-1', {
        status: 'completato',
        priorita: 'alta',
        periodo: undefined,
        page: 1,
        limit: 10,
      });
    });
  });

  describe('GET /reminders/:id', () => {
    it('returns a single reminder', async () => {
      reminderService.getReminder.mockResolvedValue(mockReminder);

      const result = await controller.get(req, 'rem-1');

      expect(reminderService.getReminder).toHaveBeenCalledWith('tenant-1', 'user-1', 'rem-1');
      expect(result.data).toEqual(mockReminder);
    });
  });

  describe('PATCH /reminders/:id', () => {
    it('updates reminder fields', async () => {
      const updated = { ...mockReminder, titolo: 'Updated title' };
      reminderService.updateReminder.mockResolvedValue(updated);

      const dto = { titolo: 'Updated title' };
      const result = await controller.update(req, 'rem-1', dto as any);

      expect(reminderService.updateReminder).toHaveBeenCalledWith('tenant-1', 'user-1', 'rem-1', dto);
      expect(result.data.titolo).toBe('Updated title');
    });
  });

  describe('POST /reminders/:id/complete', () => {
    it('marks reminder as completed', async () => {
      const completed = { ...mockReminder, status: 'completato' };
      reminderService.completeReminder.mockResolvedValue(completed);

      const result = await controller.complete(req, 'rem-1');

      expect(reminderService.completeReminder).toHaveBeenCalledWith('tenant-1', 'user-1', 'rem-1');
      expect(result.data.status).toBe('completato');
    });
  });

  describe('DELETE /reminders/:id', () => {
    it('deletes a reminder', async () => {
      reminderService.deleteReminder.mockResolvedValue(mockReminder);

      const result = await controller.delete(req, 'rem-1');

      expect(reminderService.deleteReminder).toHaveBeenCalledWith('tenant-1', 'user-1', 'rem-1');
      expect(result.data).toEqual(mockReminder);
    });
  });

  describe('DELETE /reminders/bulk', () => {
    it('bulk deletes reminders', async () => {
      reminderService.bulkDeleteReminders.mockResolvedValue({ deleted: 3 });

      const result = await controller.bulkDelete(req, { ids: ['r1', 'r2', 'r3'] });

      expect(reminderService.bulkDeleteReminders).toHaveBeenCalledWith('tenant-1', 'user-1', ['r1', 'r2', 'r3']);
      expect(result.data.deleted).toBe(3);
    });
  });

  describe('tenant isolation', () => {
    it('passes tenantId from req.user to all service calls', async () => {
      const otherReq = { user: { id: 'user-2', tenantId: 'tenant-2' } } as any;
      reminderService.listReminders.mockResolvedValue({ reminders: [], total: 0, page: 1, limit: 20 });

      await controller.list(otherReq);

      expect(reminderService.listReminders).toHaveBeenCalledWith(
        'tenant-2', 'user-2',
        expect.any(Object),
      );
    });
  });
});
