import * as fs from 'fs';
import * as path from 'path';
import { ToolRegistryService } from '../../../common/modules/tool-registry/tool-registry.service';
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
  'send_email',
  'delete_email',
  'forward_email',
  'reply_email',
  'delete_event',
  'delete_contact',
];

function buildPopulatedRegistry(): ToolRegistryService {
  const registry = new ToolRegistryService();
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

  for (const service of services) {
    (service as any).onModuleInit();
  }

  return registry;
}

describe('HITL Contract', () => {
  describe('AI SDK needsApproval wiring', () => {
    it('all HIGH-risk tool source files define dynamic needsApproval logic', () => {
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      const toolServiceFiles = fs.readdirSync(toolsDir)
        .filter((file) => file.endsWith('-tools.service.ts') && !file.endsWith('.spec.ts'));

      const toolsWithApproval: string[] = [];
      for (const file of toolServiceFiles) {
        const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
        const lines = content.split('\n');

        for (let index = 0; index < lines.length; index += 1) {
          if (lines[index].includes('needsApproval:') && lines[index].includes('sensitivity')) {
            for (let scan = index - 1; scan >= Math.max(0, index - 20); scan -= 1) {
              const buildMatch = lines[scan].match(/private\s+build(\w+)\(/);
              if (buildMatch) {
                const toolName = buildMatch[1]
                  .replace(/([A-Z])/g, '_$1')
                  .toLowerCase()
                  .replace(/^_/, '');
                toolsWithApproval.push(toolName);
                break;
              }
            }
          }
        }
      }

      for (const toolName of HIGH_RISK_TOOLS) {
        expect(
          toolsWithApproval.some((name) => (
            name === toolName || name.replace(/_/g, '') === toolName.replace(/_/g, '')
          )),
        ).toBe(true);
      }
    });

    it('email/calendar/contact tools no longer use the boolean needsApproval: true variant', () => {
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      for (const file of ['email-tools.service.ts', 'calendar-tools.service.ts', 'contact-tools.service.ts']) {
        const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
        expect(content).not.toContain('needsApproval: true');
      }
    });
  });

  describe('registry governance metadata', () => {
    const registry = buildPopulatedRegistry();

    it('marks send_email as HIGH-risk and approval-gated', () => {
      const tool = registry.getTool('send_email');
      expect(tool).toBeDefined();
      expect(tool!.domain).toBe('email');
      expect(tool!.riskLevel).toBe('HIGH');
      expect(tool!.requiresApproval).toBe(true);
    });

    it('marks search_emails as LOW-risk without approval', () => {
      const tool = registry.getTool('search_emails');
      expect(tool).toBeDefined();
      expect(tool!.domain).toBe('email');
      expect(tool!.riskLevel).toBe('LOW');
      expect(tool!.requiresApproval).toBe(false);
    });

    it('marks delete_event as HIGH-risk and approval-gated', () => {
      const tool = registry.getTool('delete_event');
      expect(tool).toBeDefined();
      expect(tool!.domain).toBe('calendar');
      expect(tool!.riskLevel).toBe('HIGH');
      expect(tool!.requiresApproval).toBe(true);
    });

    it('marks delete_contact as HIGH-risk and approval-gated', () => {
      const tool = registry.getTool('delete_contact');
      expect(tool).toBeDefined();
      expect(tool!.domain).toBe('contacts');
      expect(tool!.riskLevel).toBe('HIGH');
      expect(tool!.requiresApproval).toBe(true);
    });

    it('keeps every HIGH-risk registry tool approval-gated', () => {
      const highRiskTools = registry.getAllTools().filter((tool) => tool.riskLevel === 'HIGH');
      expect(highRiskTools).toHaveLength(HIGH_RISK_TOOLS.length);
      for (const tool of highRiskTools) {
        expect(tool.requiresApproval).toBe(true);
      }
    });
  });

  describe('Phase 108 sensitivity contracts', () => {
    it('HIGH-risk tools use sensitivity !== NONE', () => {
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      const toolServiceFiles = fs.readdirSync(toolsDir)
        .filter((file) => file.endsWith('-tools.service.ts') && !file.endsWith('.spec.ts'));

      for (const toolName of HIGH_RISK_TOOLS) {
        const pascalName = toolName
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join('');

        const found = toolServiceFiles.some((file) => {
          const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
          const buildRegex = new RegExp(
            `build${pascalName}[\\s\\S]*?needsApproval:\\s*\\(\\)\\s*=>\\s*sensitivity\\s*!==\\s*'NONE'`,
          );
          return buildRegex.test(content);
        });

        expect(found).toBe(true);
      }
    });

    it('MEDIUM-risk mutations use sensitivity === ALL_MUTATIONS', () => {
      const mediumRiskMutations = [
        'archive_email',
        'move_email',
        'draft_email',
        'create_event',
        'update_event',
        'create_contact',
        'update_contact',
      ];
      const toolsDir = path.resolve(__dirname, '..', 'tools');
      const toolServiceFiles = fs.readdirSync(toolsDir)
        .filter((file) => file.endsWith('-tools.service.ts') && !file.endsWith('.spec.ts'));

      for (const toolName of mediumRiskMutations) {
        const pascalName = toolName
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join('');

        const found = toolServiceFiles.some((file) => {
          const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
          const buildRegex = new RegExp(
            `build${pascalName}[\\s\\S]*?needsApproval:\\s*\\(\\)\\s*=>\\s*sensitivity\\s*===\\s*'ALL_MUTATIONS'`,
          );
          return buildRegex.test(content);
        });

        expect(found).toBe(true);
      }
    });
  });

  describe('SDK-native HITL contract', () => {
    it('does not include a HitlController or HitlService anymore', () => {
      expect(fs.existsSync(path.resolve(__dirname, '..', 'controllers', 'hitl.controller.ts'))).toBe(false);
      expect(fs.existsSync(path.resolve(__dirname, '..', 'services', 'hitl.service.ts'))).toBe(false);
      expect(fs.existsSync(path.resolve(__dirname, '..', 'dto', 'hitl.dto.ts'))).toBe(false);
    });

    it('AiChatModule no longer registers legacy HITL classes', () => {
      const modulePath = path.resolve(__dirname, '..', 'ai-chat.module.ts');
      const content = fs.readFileSync(modulePath, 'utf-8');
      expect(content).not.toContain('HitlController');
      expect(content).not.toContain('HitlService');
    });

    it('controllers no longer expose pending-actions or approve endpoints', () => {
      const controllersDir = path.resolve(__dirname, '..', 'controllers');
      const controllerFiles = fs.readdirSync(controllersDir)
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));

      for (const file of controllerFiles) {
        const content = fs.readFileSync(path.join(controllersDir, file), 'utf-8');
        expect(content).not.toContain('pending-actions');
        expect(content).not.toMatch(/\/approve\b/);
      }
    });

    it('ai-chat source no longer references ActionQueue in executable code', () => {
      const aiChatDir = path.resolve(__dirname, '..');
      for (const dir of ['controllers', 'services', 'dto', 'tools']) {
        const dirPath = path.join(aiChatDir, dir);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath)
          .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.test.ts'));

        for (const file of files) {
          const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
          const noComments = content
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
          expect(noComments).not.toContain('ActionQueue');
        }
      }
    });
  });
});
