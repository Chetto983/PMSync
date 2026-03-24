/**
 * HITL Contract Tests
 *
 * Validates:
 * 1. All HIGH-risk tools have needsApproval on their AI SDK tool() objects
 * 2. Non-HIGH-risk tools do NOT have needsApproval
 * 3. Registry returns correct governance metadata
 * 4. AICP-01: No REST pending-actions endpoint (HitlController deleted)
 * 5. AICP-02: No REST approve endpoint (SDK-native flow replaces REST)
 *
 * Phase 77 Plan 03: AICP-01, AICP-02, AICP-12 coverage.
 *
 * NOTE (Phase 108): After Task 2, needsApproval changes from boolean `true`
 * to function variants. Tests below updated to check for function or boolean.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ToolRegistryService } from '../../../common/modules/tool-registry/tool-registry.service';

// Tool service imports for registry population
import { EmailToolsService } from '../tools/email-tools.service';
import { CalendarToolsService } from '../tools/calendar-tools.service';
import { ContactToolsService } from '../tools/contact-tools.service';
import { FolderToolsService } from '../tools/folder-tools.service';
import { RagToolsService } from '../tools/rag-tools.service';
import { ConversationToolsService } from '../tools/conversation-tools.service';
import { SandboxToolsService } from '../tools/sandbox-tools.service';
import { EmailProductivityToolsService } from '../tools/email-productivity-tools.service';
import { FollowUpToolsService } from '../tools/follow-up-tools.service';
import { ReminderToolsService } from '../tools/reminder-tools.service';

const HIGH_RISK_TOOLS = [
  'send_email', 'delete_email', 'forward_email', 'reply_email',
  'delete_event', 'delete_contact',
];

/**
 * Build a populated registry by calling onModuleInit() on all tool services.
 */
function buildPopulatedRegistry(): ToolRegistryService {
  const registry = new ToolRegistryService();
  const services = [
    new EmailToolsService(null as any, null as any, null as any, null as any, null as any, registry),
    new CalendarToolsService(null as any, null as any, registry),
    new ContactToolsService(null as any, null as any, registry),
    new FolderToolsService(null as any, registry),
    new RagToolsService(null as any, null as any, null as any, null as any, registry),
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

describe('HITL Contract', () => {
  describe('AI SDK needsApproval on tool() calls', () => {
    it('all HIGH-risk tool source files have needsApproval function on tool() definitions', () => {
      // Phase 108: needsApproval changed from boolean to function.
      // Structural verification: scan the source files for needsApproval in HIGH-risk build methods.
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      const toolServiceFiles = fs.readdirSync(toolsDir)
        .filter((f) => f.endsWith('-tools.service.ts') && !f.endsWith('.spec.ts'));

      const toolsWithApproval: string[] = [];
      for (const file of toolServiceFiles) {
        const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('needsApproval:') && lines[i].includes('sensitivity')) {
            for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
              const buildMatch = lines[j].match(/private\s+build(\w+)\(/);
              if (buildMatch) {
                const name = buildMatch[1]
                  .replace(/([A-Z])/g, '_$1')
                  .toLowerCase()
                  .replace(/^_/, '');
                toolsWithApproval.push(name);
                break;
              }
            }
          }
        }
      }

      // Verify all HIGH-risk tools are in the list
      for (const toolName of HIGH_RISK_TOOLS) {
        expect(
          toolsWithApproval.some((t) => t === toolName || t.replace(/_/g, '') === toolName.replace(/_/g, '')),
        ).toBe(true);
      }
    });

    it('email/calendar/contact tool files do not contain needsApproval: true (all use function variant)', () => {
      // Phase 108: Email, calendar, and contact tools use function-based needsApproval.
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      const targetFiles = ['email-tools.service.ts', 'calendar-tools.service.ts', 'contact-tools.service.ts'];

      for (const file of targetFiles) {
        const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
        expect(content).not.toContain('needsApproval: true');
      }
    });
  });

  describe('Registry governance metadata', () => {
    const registry = buildPopulatedRegistry();

    it('getTool("send_email") returns correct HIGH-risk email metadata', () => {
      const tool = registry.getTool('send_email');
      expect(tool).toBeDefined();
      expect(tool!.domain).toBe('email');
      expect(tool!.riskLevel).toBe('HIGH');
      expect(tool!.requiresApproval).toBe(true);
    });

    it('getTool("search_emails") returns correct LOW-risk email metadata', () => {
      const tool = registry.getTool('search_emails');
      expect(tool).toBeDefined();
      expect(tool!.domain).toBe('email');
      expect(tool!.riskLevel).toBe('LOW');
      expect(tool!.requiresApproval).toBe(false);
    });

    it('getTool("delete_event") returns correct HIGH-risk calendar metadata', () => {
      const tool = registry.getTool('delete_event');
      expect(tool).toBeDefined();
      expect(tool!.domain).toBe('calendar');
      expect(tool!.riskLevel).toBe('HIGH');
      expect(tool!.requiresApproval).toBe(true);
    });

    it('getTool("delete_contact") returns correct HIGH-risk contacts metadata', () => {
      const tool = registry.getTool('delete_contact');
      expect(tool).toBeDefined();
      expect(tool!.domain).toBe('contacts');
      expect(tool!.riskLevel).toBe('HIGH');
      expect(tool!.requiresApproval).toBe(true);
    });

    it('all HIGH-risk registry tools have requiresApproval: true', () => {
      const allTools = registry.getAllTools();
      const highRisk = allTools.filter((t) => t.riskLevel === 'HIGH');

      expect(highRisk).toHaveLength(HIGH_RISK_TOOLS.length);
      for (const tool of highRisk) {
        expect(tool.requiresApproval).toBe(true);
      }
    });
  });

  describe('needsApproval function variant (Phase 108)', () => {
    it('HIGH-risk tools use needsApproval function with sensitivity !== NONE', () => {
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      const toolServiceFiles = fs.readdirSync(toolsDir)
        .filter((f) => f.endsWith('-tools.service.ts') && !f.endsWith('.spec.ts'));

      // Find HIGH-risk build methods and verify they use sensitivity !== 'NONE'
      for (const toolName of HIGH_RISK_TOOLS) {
        let found = false;
        for (const file of toolServiceFiles) {
          const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
          const pascalName = toolName
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join('');
          const buildRegex = new RegExp(`build${pascalName}[\\s\\S]*?needsApproval:\\s*\\(\\)\\s*=>\\s*sensitivity\\s*!==\\s*'NONE'`);
          if (buildRegex.test(content)) {
            found = true;
            break;
          }
        }
        expect(found).toBe(true);
      }
    });

    it('MEDIUM-risk mutation tools use needsApproval function with sensitivity === ALL_MUTATIONS', () => {
      const MEDIUM_RISK_MUTATIONS = [
        'archive_email', 'move_email', 'draft_email',
        'create_event', 'update_event',
        'create_contact', 'update_contact',
      ];
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      const toolServiceFiles = fs.readdirSync(toolsDir)
        .filter((f) => f.endsWith('-tools.service.ts') && !f.endsWith('.spec.ts'));

      for (const toolName of MEDIUM_RISK_MUTATIONS) {
        let found = false;
        for (const file of toolServiceFiles) {
          const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
          const pascalName = toolName
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join('');
          const buildRegex = new RegExp(`build${pascalName}[\\s\\S]*?needsApproval:\\s*\\(\\)\\s*=>\\s*sensitivity\\s*===\\s*'ALL_MUTATIONS'`);
          if (buildRegex.test(content)) {
            found = true;
            break;
          }
        }
        expect(found).toBe(true);
      }
    });
  });

  describe('AICP-01: SDK ToolInvocation state replaces pending-actions DTO', () => {
    it('HitlController file does not exist (deleted)', () => {
      const hitlControllerPath = path.resolve(
        __dirname, '..', 'controllers', 'hitl.controller.ts',
      );
      expect(fs.existsSync(hitlControllerPath)).toBe(false);
    });

    it('HitlService file does not exist (deleted)', () => {
      const hitlServicePath = path.resolve(
        __dirname, '..', 'services', 'hitl.service.ts',
      );
      expect(fs.existsSync(hitlServicePath)).toBe(false);
    });

    it('hitl.dto.ts file does not exist (deleted)', () => {
      const hitlDtoPath = path.resolve(
        __dirname, '..', 'dto', 'hitl.dto.ts',
      );
      expect(fs.existsSync(hitlDtoPath)).toBe(false);
    });

    it('AiChatModule does not register HitlController', () => {
      const modulePath = path.resolve(__dirname, '..', 'ai-chat.module.ts');
      const content = fs.readFileSync(modulePath, 'utf-8');
      expect(content).not.toContain('HitlController');
      expect(content).not.toContain('HitlService');
    });
  });

  describe('AICP-02: No REST approval endpoint exists', () => {
    it('no pending-actions route in ai-chat controllers', () => {
      const controllersDir = path.resolve(__dirname, '..', 'controllers');
      const controllerFiles = fs.readdirSync(controllersDir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

      for (const file of controllerFiles) {
        const content = fs.readFileSync(path.join(controllersDir, file), 'utf-8');
        expect(content).not.toContain('pending-actions');
        expect(content).not.toMatch(/\/approve\b/);
      }
    });

    it('no functional ActionQueue references in ai-chat source', () => {
      const aiChatDir = path.resolve(__dirname, '..');
      const sourceDirs = ['controllers', 'services', 'dto', 'tools'];

      for (const dir of sourceDirs) {
        const dirPath = path.join(aiChatDir, dir);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath)
          .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.test.ts'));

        for (const file of files) {
          const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
          // Strip comments before checking -- historical comments mentioning removal are acceptable
          const noComments = content
            .replace(/\/\/.*$/gm, '') // single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, ''); // multi-line comments
          expect(noComments).not.toContain('ActionQueue');
        }
      }
    });
  });
});
