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
    it('all HIGH-risk tool source files have needsApproval: true on tool() definitions', () => {
      // Structural verification: scan the source files for tool() calls with needsApproval
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      const toolServiceFiles = fs.readdirSync(toolsDir)
        .filter((f) => f.endsWith('-tools.service.ts') && !f.endsWith('.spec.ts'));

      // Collect all needsApproval occurrences from source
      const toolsWithApproval: string[] = [];
      for (const file of toolServiceFiles) {
        const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
        // Find tool names near needsApproval: true
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('needsApproval: true')) {
            // Look backwards to find the tool name (buildXxx method or tool name)
            for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
              const buildMatch = lines[j].match(/private\s+build(\w+)\(/);
              if (buildMatch) {
                // Convert PascalCase to snake_case
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
        const snakeName = toolName;
        expect(
          toolsWithApproval.some((t) => t === snakeName || t.replace(/_/g, '') === snakeName.replace(/_/g, '')),
        ).toBe(true);
      }
    });

    it('non-HIGH-risk tools do NOT have needsApproval in their tool() definitions', () => {
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      const toolServiceFiles = fs.readdirSync(toolsDir)
        .filter((f) => f.endsWith('-tools.service.ts') && !f.endsWith('.spec.ts'));

      // Collect all tool build methods
      for (const file of toolServiceFiles) {
        const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
        // Find build methods that have needsApproval
        const methodBlocks = content.split(/private\s+build/);
        for (const block of methodBlocks.slice(1)) { // Skip first (before first build method)
          const methodName = block.match(/^(\w+)\(/)?.[1];
          if (!methodName) continue;
          const toolName = methodName
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '');

          // Only check non-HIGH-risk tools
          const isHighRisk = HIGH_RISK_TOOLS.some(
            (h) => h === toolName || h.replace(/_/g, '') === toolName.replace(/_/g, ''),
          );
          if (isHighRisk) continue;

          // Check that this method block doesn't have needsApproval: true
          // Take only the current method (up to next private build or end)
          const methodBody = block.split(/\n\s*private\s+build/)[0];
          if (methodBody.includes('needsApproval: true')) {
            throw new Error(
              `Non-HIGH-risk tool build${methodName} has needsApproval: true -- ` +
              `only HIGH-risk tools should have needsApproval`,
            );
          }
        }
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
