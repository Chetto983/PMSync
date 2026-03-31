/**
 * Tool Registry Governance Assertion Tests
 *
 * Validates that all registered tools have complete governance metadata:
 * domain, riskLevel, requiresApproval, inputSchema.
 *
 * Phase 77 Plan 03: AICP-03/04 coverage.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ToolRegistryService } from '../../../common/modules/tool-registry/tool-registry.service';
import { IAiTool } from '../../../common/interfaces/tool-registry.interface';

// Tool service imports
import { EmailToolsService } from './email-tools.service';
import { CalendarToolsService } from './calendar-tools.service';
import { ContactToolsService } from './contact-tools.service';
import { FolderToolsService } from './folder-tools.service';
import { RagToolsService } from './rag-tools.service';
import { ConversationToolsService } from './conversation-tools.service';
import { SandboxToolsService } from './sandbox-tools.service';
import { EmailProductivityToolsService } from './email-productivity-tools.service';
import { FollowUpToolsService } from './follow-up-tools.service';
import { ReminderToolsService } from './reminder-tools.service';

/**
 * Build a populated ToolRegistryService by calling onModuleInit() on all tool services.
 * Tool services only use toolRegistry in onModuleInit() -- other deps are not accessed.
 */
function buildPopulatedRegistry(): ToolRegistryService {
  const registry = new ToolRegistryService();

  // Construct each tool service with null deps except toolRegistry, then call onModuleInit()
  const services = [
    new EmailToolsService(null as any, null as any, null as any, null as any, null as any, registry),
    new CalendarToolsService(null as any, null as any, registry),
    new ContactToolsService(null as any, null as any, registry),
    new FolderToolsService(null as any, null as any, registry),
    new RagToolsService(null as any, null as any, null as any, null as any, null as any, null as any, registry),
    new ConversationToolsService(registry),
    new SandboxToolsService(null as any, null as any, registry),
    new EmailProductivityToolsService(null as any, null as any, null as any, registry),
    new FollowUpToolsService(null as any, registry),
    new ReminderToolsService(null as any, registry),
  ];

  for (const svc of services) {
    (svc as any).onModuleInit();
  }

  return registry;
}

// Expected complete tool inventory
const EXPECTED_TOOLS = [
  // Email domain (9 tools)
  'search_emails', 'read_email', 'send_email', 'delete_email',
  'forward_email', 'reply_email', 'draft_email', 'archive_email', 'move_email',
  // Folder domain (classified as email) (2 tools)
  'list_folders', 'create_folder',
  // Calendar domain (4 tools)
  'view_calendar', 'create_event', 'update_event', 'delete_event',
  // Contacts domain (4 tools)
  'search_contacts', 'create_contact', 'update_contact', 'delete_contact',
  // Knowledge domain (5 tools)
  'semantic_search', 'graph_context_search', 'save_memory', 'list_memories', 'delete_memory',
  // System domain (3 tools)
  'ask_user', 'run_code', 'code_assistant',
  // Productivity domain (8 tools)
  'list_email_index', 'star_email', 'mark_email_read', 'label_email',
  'list_follow_ups', 'update_follow_up', 'create_reminder', 'list_reminders',
].sort();

const VALID_DOMAINS = ['email', 'calendar', 'contacts', 'knowledge', 'productivity', 'system'];
const VALID_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

const HIGH_RISK_TOOLS = [
  'send_email', 'delete_email', 'forward_email', 'reply_email',
  'delete_event', 'delete_contact',
].sort();

// Email domain tools (including folder tools which are classified as email domain)
const EMAIL_DOMAIN_TOOLS = [
  'search_emails', 'read_email', 'send_email', 'delete_email',
  'forward_email', 'reply_email', 'draft_email', 'archive_email', 'move_email',
  'list_folders', 'create_folder',
].sort();

describe('Tool Registry Governance', () => {
  let registry: ToolRegistryService;
  let tools: IAiTool[];

  beforeAll(() => {
    registry = buildPopulatedRegistry();
    tools = registry.getAllTools();
  });

  it('should have exactly 35 tools registered', () => {
    expect(tools).toHaveLength(35);
  });

  it('every tool should have complete governance metadata', () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.domain).toBeDefined();
      expect(tool.riskLevel).toBeDefined();
      expect(tool.requiresApproval).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('domain values are valid', () => {
    for (const tool of tools) {
      expect(VALID_DOMAINS).toContain(tool.domain);
    }
  });

  it('riskLevel values are valid', () => {
    for (const tool of tools) {
      expect(VALID_RISK_LEVELS).toContain(tool.riskLevel);
    }
  });

  it('HIGH-risk tools require approval', () => {
    const highRisk = tools
      .filter((t) => t.riskLevel === 'HIGH')
      .map((t) => t.name)
      .sort();

    expect(highRisk).toEqual(HIGH_RISK_TOOLS);

    for (const t of tools.filter((t) => t.riskLevel === 'HIGH')) {
      expect(t.requiresApproval).toBe(true);
    }
  });

  it('no LOW-risk tool requires approval', () => {
    const lowRisk = tools.filter((t) => t.riskLevel === 'LOW');
    for (const t of lowRisk) {
      expect(t.requiresApproval).toBe(false);
    }
  });

  it('tool names match expected inventory', () => {
    const actualNames = tools.map((t) => t.name).sort();
    expect(actualNames).toEqual(EXPECTED_TOOLS);
  });

  it('email domain tools are classified correctly', () => {
    const emailTools = tools
      .filter((t) => t.domain === 'email')
      .map((t) => t.name)
      .sort();

    expect(emailTools).toEqual(EMAIL_DOMAIN_TOOLS);
  });

  it('no ActionType references remain in ai-chat source files', () => {
    const aiChatDir = path.resolve(__dirname, '..');
    const sourceFiles = getAllTsFiles(aiChatDir);

    const matches: string[] = [];
    for (const file of sourceFiles) {
      // Skip test files and node_modules
      if (file.includes('node_modules') || file.endsWith('.spec.ts') || file.endsWith('.test.ts')) {
        continue;
      }
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('ActionType') || content.includes('mapToolToActionType')) {
        matches.push(path.relative(aiChatDir, file));
      }
    }

    expect(matches).toEqual([]);
  });
});

/**
 * Recursively find all .ts files in a directory.
 */
function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__') {
        results.push(...getAllTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or permission error
  }
  return results;
}
