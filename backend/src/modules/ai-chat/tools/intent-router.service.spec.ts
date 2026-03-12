/**
 * IntentRouterService Unit Tests
 *
 * Tests intent classification routing, tool map completeness,
 * and expansion rules for follow-up steps.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { IntentRouterService } from './intent-router.service';
import { IntentClassifierService } from '../../ai/nlp/intent-classifier.service';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { PRIMARY_INTENTS, type PrimaryIntent } from '../../ai/nlp/intent-taxonomy';

describe('IntentRouterService', () => {
  let service: IntentRouterService;
  let classifierMock: jest.Mocked<IntentClassifierService>;
  let mistralMock: jest.Mocked<MistralProviderService>;

  beforeEach(async () => {
    classifierMock = {
      classify: jest.fn(),
      classifyBatch: jest.fn(),
      classifyWithContext: jest.fn(),
      isModelLoaded: jest.fn().mockReturnValue(false),
      onModuleInit: jest.fn(),
    } as any;

    mistralMock = {
      getChatModel: jest.fn().mockReturnValue({}),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentRouterService,
        { provide: IntentClassifierService, useValue: classifierMock },
        { provide: MistralProviderService, useValue: mistralMock },
      ],
    }).compile();

    service = module.get<IntentRouterService>(IntentRouterService);
  });

  // ── Tool Map Structural Tests ──────────────────────────────────

  describe('INTENT_TOOL_MAP completeness', () => {
    it('every PrimaryIntent maps to an entry', async () => {
      for (const intent of PRIMARY_INTENTS) {
        classifierMock.classify.mockResolvedValueOnce({
          intent,
          confidence: 0.95,
          lang: 'en',
          alternatives: [],
          latencyMs: 1,
        });

        const result = await service.classifyAndRoute('test');
        expect(result.intent).toBe(intent);
        // activeTools should be an array (possibly empty for conversational intents)
        expect(Array.isArray(result.activeTools)).toBe(true);
      }
    });

    it('conversational intents return empty tool arrays', async () => {
      const conversationalIntents: PrimaryIntent[] = [
        'greeting', 'farewell', 'thanks', 'help', 'settings_view',
      ];

      for (const intent of conversationalIntents) {
        classifierMock.classify.mockResolvedValueOnce({
          intent,
          confidence: 0.95,
          lang: 'en',
          alternatives: [],
          latencyMs: 1,
        });

        const result = await service.classifyAndRoute('test');
        expect(result.activeTools).toEqual([]);
      }
    });

    it('all action intents include ask_user', async () => {
      const actionIntents: PrimaryIntent[] = PRIMARY_INTENTS.filter(
        (i) => !['greeting', 'farewell', 'thanks', 'help', 'settings_view'].includes(i),
      );

      for (const intent of actionIntents) {
        classifierMock.classify.mockResolvedValueOnce({
          intent,
          confidence: 0.95,
          lang: 'en',
          alternatives: [],
          latencyMs: 1,
        });

        const result = await service.classifyAndRoute('test');
        expect(result.activeTools).toContain('ask_user');
      }
    });

    it('email_summarize includes run_code', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'email_summarize',
        confidence: 0.95,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('summarize');
      expect(result.activeTools).toContain('run_code');
    });

    it('data_analysis includes run_code', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'data_analysis',
        confidence: 0.95,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('analyze');
      expect(result.activeTools).toContain('run_code');
    });

    it('status_check includes run_code', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'status_check',
        confidence: 0.95,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('status');
      expect(result.activeTools).toContain('run_code');
    });

    it('unknown intent includes broad tool coverage', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'unknown',
        confidence: 0.1,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('asdfghjkl');
      expect(result.activeTools).toContain('search_emails');
      expect(result.activeTools).toContain('semantic_search');
      expect(result.activeTools).toContain('ask_user');
      expect(result.activeTools).toContain('run_code');
    });
  });

  // ── Classification & Routing Tests ─────────────────────────────

  describe('classifyAndRoute', () => {
    it('returns high-confidence result directly from classifier', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'email_search',
        confidence: 0.92,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('find emails from Monica');
      expect(result.intent).toBe('email_search');
      expect(result.confidence).toBe(0.92);
      expect(result.activeTools).toContain('search_emails');
      expect(result.activeTools).toContain('semantic_search');
    });

    it('falls back to LLM when confidence is below threshold', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'unknown',
        confidence: 0.3,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      // LLM fallback will fail (mock not set up for generateText)
      // so it should use the FastText result
      const result = await service.classifyAndRoute('ambiguous query');
      expect(result).toBeDefined();
      expect(PRIMARY_INTENTS).toContain(result.intent);
    });

    it('email_compose includes draft_email and send_email', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'email_compose',
        confidence: 0.9,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('write an email');
      expect(result.activeTools).toContain('draft_email');
      expect(result.activeTools).toContain('send_email');
      expect(result.activeTools).toContain('search_contacts');
    });

    it('email_forward includes forward_email and search_contacts', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'email_forward',
        confidence: 0.9,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('forward this to Monica');
      expect(result.activeTools).toContain('forward_email');
      expect(result.activeTools).toContain('search_contacts');
      expect(result.activeTools).toContain('read_email');
    });

    it('email_delete includes delete_email and search_emails', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'email_delete',
        confidence: 0.9,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('delete the spam');
      expect(result.activeTools).toContain('delete_email');
      expect(result.activeTools).toContain('search_emails');
    });

    it('calendar_create includes create_event and view_calendar', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'calendar_create',
        confidence: 0.9,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('schedule a meeting');
      expect(result.activeTools).toContain('create_event');
      expect(result.activeTools).toContain('view_calendar');
    });

    it('email_move includes move_email and list_folders', async () => {
      classifierMock.classify.mockResolvedValueOnce({
        intent: 'email_move',
        confidence: 0.9,
        lang: 'en',
        alternatives: [],
        latencyMs: 1,
      });

      const result = await service.classifyAndRoute('move to Work folder');
      expect(result.activeTools).toContain('move_email');
      expect(result.activeTools).toContain('list_folders');
    });
  });

  // ── Tool Expansion Tests ───────────────────────────────────────

  describe('expandForFollowUp', () => {
    const allTools = [
      'search_emails', 'semantic_search', 'read_email', 'reply_email',
      'forward_email', 'archive_email', 'delete_email', 'move_email',
      'draft_email', 'send_email', 'search_contacts', 'create_contact',
      'update_contact', 'view_calendar', 'create_event', 'update_event',
      'delete_event', 'list_folders', 'create_folder', 'save_memory',
      'run_code', 'ask_user',
    ];

    it('after search_emails: expands to read, reply, forward, archive, delete, move', () => {
      const expanded = service.expandForFollowUp(
        [{ toolName: 'search_emails' }],
        allTools,
      );
      expect(expanded).toContain('search_emails');
      expect(expanded).toContain('read_email');
      expect(expanded).toContain('reply_email');
      expect(expanded).toContain('forward_email');
      expect(expanded).toContain('archive_email');
      expect(expanded).toContain('delete_email');
      expect(expanded).toContain('move_email');
    });

    it('after read_email: expands to reply, forward, archive, delete, move', () => {
      const expanded = service.expandForFollowUp(
        [{ toolName: 'read_email' }],
        allTools,
      );
      expect(expanded).toContain('reply_email');
      expect(expanded).toContain('forward_email');
      expect(expanded).toContain('archive_email');
      expect(expanded).toContain('delete_email');
      expect(expanded).toContain('move_email');
    });

    it('after draft_email: expands to send_email', () => {
      const expanded = service.expandForFollowUp(
        [{ toolName: 'draft_email' }],
        allTools,
      );
      expect(expanded).toContain('send_email');
    });

    it('after send_email: expands to save_memory', () => {
      const expanded = service.expandForFollowUp(
        [{ toolName: 'send_email' }],
        allTools,
      );
      expect(expanded).toContain('save_memory');
    });

    it('after view_calendar: expands to create, update, delete event', () => {
      const expanded = service.expandForFollowUp(
        [{ toolName: 'view_calendar' }],
        allTools,
      );
      expect(expanded).toContain('create_event');
      expect(expanded).toContain('update_event');
      expect(expanded).toContain('delete_event');
    });

    it('after list_folders: expands to create_folder and move_email', () => {
      const expanded = service.expandForFollowUp(
        [{ toolName: 'list_folders' }],
        allTools,
      );
      expect(expanded).toContain('create_folder');
      expect(expanded).toContain('move_email');
    });

    it('always includes save_memory and ask_user', () => {
      const expanded = service.expandForFollowUp(
        [{ toolName: 'search_emails' }],
        allTools,
      );
      expect(expanded).toContain('save_memory');
      expect(expanded).toContain('ask_user');
    });

    it('filters out tools not in allToolNames', () => {
      const limitedTools = ['search_emails', 'read_email', 'save_memory', 'ask_user'];
      const expanded = service.expandForFollowUp(
        [{ toolName: 'search_emails' }],
        limitedTools,
      );
      // reply_email should NOT be in result since it's not in limitedTools
      expect(expanded).not.toContain('reply_email');
      expect(expanded).toContain('read_email');
    });

    it('handles multiple tool calls in one step', () => {
      const expanded = service.expandForFollowUp(
        [{ toolName: 'search_emails' }, { toolName: 'view_calendar' }],
        allTools,
      );
      // Should have expansions from both
      expect(expanded).toContain('read_email'); // from search_emails
      expect(expanded).toContain('create_event'); // from view_calendar
    });

    it('handles unknown tool call gracefully', () => {
      const expanded = service.expandForFollowUp(
        [{ toolName: 'nonexistent_tool' }],
        allTools,
      );
      // Should at least have save_memory and ask_user
      expect(expanded).toContain('save_memory');
      expect(expanded).toContain('ask_user');
    });
  });

  // ── Tool count budget tests ────────────────────────────────────

  describe('tool budget per intent', () => {
    it('no action intent exceeds 8 tools', async () => {
      for (const intent of PRIMARY_INTENTS) {
        classifierMock.classify.mockResolvedValueOnce({
          intent,
          confidence: 0.95,
          lang: 'en',
          alternatives: [],
          latencyMs: 1,
        });

        const result = await service.classifyAndRoute('test');
        if (result.activeTools.length > 0) {
          expect(result.activeTools.length).toBeLessThanOrEqual(8);
        }
      }
    });
  });
});
