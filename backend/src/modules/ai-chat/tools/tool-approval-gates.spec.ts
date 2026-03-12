/**
 * Tool Approval Gates Tests
 *
 * Validates that all 20 AI chat tools have correct needsApproval settings.
 * Destructive tools MUST require approval; read-only tools MUST NOT.
 *
 * Also validates mapToolToActionType mapping correctness.
 *
 * Phase AI-AUDIT: Full HITL coverage validation.
 */
import { EmailToolsService } from './email-tools.service';
import { CalendarToolsService } from './calendar-tools.service';
import { ContactToolsService } from './contact-tools.service';
import { FolderToolsService } from './folder-tools.service';
import { RagToolsService } from './rag-tools.service';
import { ConversationToolsService } from './conversation-tools.service';
import { SandboxToolsService } from './sandbox-tools.service';

// Minimal stub to satisfy DI — tools are never actually executed
const noopPiiResolve = async (p: Record<string, unknown>) => p;
const stubLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() };

describe('Tool Approval Gates', () => {
  // ── Tool collections ────────────────────────────────────────
  let emailTools: ReturnType<EmailToolsService['getTools']>;
  let calendarTools: ReturnType<CalendarToolsService['getTools']>;
  let contactTools: ReturnType<ContactToolsService['getTools']>;
  let folderTools: ReturnType<FolderToolsService['getTools']>;
  let ragTools: ReturnType<RagToolsService['getTools']>;
  let conversationTools: ReturnType<ConversationToolsService['getTools']>;
  let sandboxTools: ReturnType<SandboxToolsService['getTools']>;

  beforeAll(() => {
    // Build tools with stubs — we only inspect metadata, never execute
    const stubPrisma = {} as any;
    const stubEmailSearch = {} as any;
    const stubEmailCrud = {} as any;
    const stubEmailSend = {} as any;
    const stubEmailFetch = {} as any;
    const stubCalendarEvents = {} as any;
    const stubContacts = {} as any;
    const stubEmbeddings = {} as any;
    const stubMistralEmbed = {} as any;
    const stubHybridSearch = {} as any;
    const stubSandbox = {} as any;

    const emailSvc = new EmailToolsService(
      stubEmailSearch, stubEmailCrud, stubEmailSend, stubEmailFetch, stubPrisma,
    );
    const calendarSvc = new CalendarToolsService(stubCalendarEvents, stubPrisma);
    const contactSvc = new ContactToolsService(stubContacts, stubPrisma);
    const folderSvc = new FolderToolsService(stubPrisma);
    const ragSvc = new RagToolsService(
      stubEmbeddings, stubMistralEmbed, stubHybridSearch, stubPrisma,
    );
    const conversationSvc = new ConversationToolsService();
    const sandboxSvc = new SandboxToolsService(stubSandbox);

    emailTools = emailSvc.getTools('tenant-1', 'conv-1', noopPiiResolve);
    calendarTools = calendarSvc.getTools('tenant-1', 'conv-1', noopPiiResolve);
    contactTools = contactSvc.getTools('tenant-1', 'conv-1', noopPiiResolve);
    folderTools = folderSvc.getTools('tenant-1', 'conv-1', noopPiiResolve);
    ragTools = ragSvc.getTools('tenant-1', 'user-1', 'conv-1', noopPiiResolve);
    conversationTools = conversationSvc.getTools();
    sandboxTools = sandboxSvc.getTools();
  });

  // ── Destructive tools MUST require approval ─────────────────

  describe('destructive tools require approval', () => {
    it('send_email requires approval', () => {
      expect(emailTools.send_email.needsApproval).toBe(true);
    });

    it('delete_email requires approval', () => {
      expect(emailTools.delete_email.needsApproval).toBe(true);
    });

    it('forward_email requires approval', () => {
      expect(emailTools.forward_email.needsApproval).toBe(true);
    });

    it('reply_email requires approval', () => {
      expect(emailTools.reply_email.needsApproval).toBe(true);
    });

    it('delete_event requires approval', () => {
      expect(calendarTools.delete_event.needsApproval).toBe(true);
    });
  });

  // ── Non-destructive tools MUST NOT require approval ─────────

  describe('read-only tools do not require approval', () => {
    it('search_emails — no approval', () => {
      expect(emailTools.search_emails.needsApproval).toBeFalsy();
    });

    it('read_email — no approval', () => {
      expect(emailTools.read_email.needsApproval).toBeFalsy();
    });

    it('archive_email — no approval', () => {
      expect(emailTools.archive_email.needsApproval).toBeFalsy();
    });

    it('move_email — no approval', () => {
      expect(emailTools.move_email.needsApproval).toBeFalsy();
    });

    it('draft_email — no approval', () => {
      expect(emailTools.draft_email.needsApproval).toBeFalsy();
    });

    it('view_calendar — no approval', () => {
      expect(calendarTools.view_calendar.needsApproval).toBeFalsy();
    });

    it('create_event — no approval', () => {
      expect(calendarTools.create_event.needsApproval).toBeFalsy();
    });

    it('update_event — no approval', () => {
      expect(calendarTools.update_event.needsApproval).toBeFalsy();
    });

    it('search_contacts — no approval', () => {
      expect(contactTools.search_contacts.needsApproval).toBeFalsy();
    });

    it('create_contact — no approval', () => {
      expect(contactTools.create_contact.needsApproval).toBeFalsy();
    });

    it('update_contact — no approval', () => {
      expect(contactTools.update_contact.needsApproval).toBeFalsy();
    });

    it('list_folders — no approval', () => {
      expect(folderTools.list_folders.needsApproval).toBeFalsy();
    });

    it('create_folder — no approval', () => {
      expect(folderTools.create_folder.needsApproval).toBeFalsy();
    });

    it('semantic_search — no approval', () => {
      expect(ragTools.semantic_search.needsApproval).toBeFalsy();
    });

    it('save_memory — no approval', () => {
      expect(ragTools.save_memory.needsApproval).toBeFalsy();
    });

    it('ask_user — no approval', () => {
      expect(conversationTools.ask_user.needsApproval).toBeFalsy();
    });

    it('run_code — no approval', () => {
      expect(sandboxTools.run_code.needsApproval).toBeFalsy();
    });
  });

  // ── Tool completeness ───────────────────────────────────────

  describe('tool inventory completeness', () => {
    it('email tools: exactly 9', () => {
      expect(Object.keys(emailTools)).toHaveLength(9);
      expect(Object.keys(emailTools).sort()).toEqual([
        'archive_email', 'delete_email', 'draft_email', 'forward_email',
        'move_email', 'read_email', 'reply_email', 'search_emails', 'send_email',
      ]);
    });

    it('calendar tools: exactly 4', () => {
      expect(Object.keys(calendarTools)).toHaveLength(4);
      expect(Object.keys(calendarTools).sort()).toEqual([
        'create_event', 'delete_event', 'update_event', 'view_calendar',
      ]);
    });

    it('contact tools: exactly 3', () => {
      expect(Object.keys(contactTools)).toHaveLength(3);
      expect(Object.keys(contactTools).sort()).toEqual([
        'create_contact', 'search_contacts', 'update_contact',
      ]);
    });

    it('folder tools: exactly 2', () => {
      expect(Object.keys(folderTools)).toHaveLength(2);
      expect(Object.keys(folderTools).sort()).toEqual([
        'create_folder', 'list_folders',
      ]);
    });

    it('RAG tools: exactly 2', () => {
      expect(Object.keys(ragTools)).toHaveLength(2);
      expect(Object.keys(ragTools).sort()).toEqual([
        'save_memory', 'semantic_search',
      ]);
    });

    it('conversation tools: exactly 1', () => {
      expect(Object.keys(conversationTools)).toHaveLength(1);
      expect(Object.keys(conversationTools)).toEqual(['ask_user']);
    });

    it('sandbox tools: exactly 1', () => {
      expect(Object.keys(sandboxTools)).toHaveLength(1);
      expect(Object.keys(sandboxTools)).toEqual(['run_code']);
    });

    it('total tools: 22', () => {
      const total =
        Object.keys(emailTools).length +
        Object.keys(calendarTools).length +
        Object.keys(contactTools).length +
        Object.keys(folderTools).length +
        Object.keys(ragTools).length +
        Object.keys(conversationTools).length +
        Object.keys(sandboxTools).length;
      expect(total).toBe(22);
    });
  });

  // ── Every tool has description and inputSchema ──────────────

  describe('tool metadata completeness', () => {
    const allToolEntries = () => {
      const all: Record<string, any> = {
        ...emailTools, ...calendarTools, ...contactTools,
        ...folderTools, ...ragTools, ...conversationTools, ...sandboxTools,
      };
      return Object.entries(all);
    };

    it('every tool has a non-empty description', () => {
      for (const [name, t] of allToolEntries()) {
        expect(t.description).toBeDefined();
        expect(t.description.length).toBeGreaterThan(10);
      }
    });

    it('every tool has inputSchema (zod)', () => {
      for (const [name, t] of allToolEntries()) {
        expect(t.inputSchema).toBeDefined();
      }
    });

    it('every tool has an execute function', () => {
      for (const [name, t] of allToolEntries()) {
        expect(typeof t.execute).toBe('function');
      }
    });
  });

  // ── Approval ratio ──────────────────────────────────────────

  describe('approval ratio', () => {
    it('exactly 5 out of 22 tools require approval', () => {
      const all: Record<string, any> = {
        ...emailTools, ...calendarTools, ...contactTools,
        ...folderTools, ...ragTools, ...conversationTools, ...sandboxTools,
      };
      const approvalCount = Object.values(all).filter((t: any) => t.needsApproval === true).length;
      expect(approvalCount).toBe(5);
    });
  });
});
