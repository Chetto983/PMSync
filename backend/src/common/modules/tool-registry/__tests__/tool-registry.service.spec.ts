import { Test, TestingModule } from '@nestjs/testing';
import { ToolRegistryService } from '../tool-registry.service';
import { ToolRegistryModule } from '../tool-registry.module';
import {
  IAiTool,
  IToolContext,
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../interfaces/tool-registry.interface';

function makeMockTool(name: string): IAiTool {
  return {
    name,
    description: `Mock tool: ${name}`,
    parameters: { input: { type: 'string' } },
    execute: jest.fn().mockResolvedValue({ ok: true }),
  };
}

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;
  let serviceViaToken: IToolRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ToolRegistryModule],
    }).compile();

    service = module.get<ToolRegistryService>(ToolRegistryService);
    serviceViaToken = module.get<IToolRegistryService>(TOOL_REGISTRY_SERVICE);
  });

  it('should be defined and same instance via token', () => {
    expect(service).toBeDefined();
    expect(serviceViaToken).toBe(service);
  });

  it('registerTool stores tool by name; getTool returns it', () => {
    const tool = makeMockTool('email-search');
    service.registerTool(tool);

    const retrieved = service.getTool('email-search');
    expect(retrieved).toBe(tool);
  });

  it('registerTool with duplicate name overwrites and logs warning', () => {
    const tool1 = makeMockTool('send-email');
    const tool2 = makeMockTool('send-email');

    // Spy on the NestJS logger's warn method
    const warnSpy = jest.spyOn((service as any).logger, 'warn');

    service.registerTool(tool1);
    service.registerTool(tool2);

    expect(service.getTool('send-email')).toBe(tool2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('send-email'),
    );
  });

  it('getTool for unknown name returns undefined', () => {
    expect(service.getTool('nonexistent')).toBeUndefined();
  });

  it('getAllTools returns all registered tools', () => {
    const t1 = makeMockTool('a');
    const t2 = makeMockTool('b');
    const t3 = makeMockTool('c');

    service.registerTool(t1);
    service.registerTool(t2);
    service.registerTool(t3);

    const all = service.getAllTools();
    expect(all).toHaveLength(3);
    expect(all).toEqual(expect.arrayContaining([t1, t2, t3]));
  });

  it('getToolNames returns all tool names', () => {
    service.registerTool(makeMockTool('x'));
    service.registerTool(makeMockTool('y'));

    const names = service.getToolNames();
    expect(names).toHaveLength(2);
    expect(names).toEqual(expect.arrayContaining(['x', 'y']));
  });

  it('empty registry returns empty arrays for getAllTools/getToolNames', () => {
    expect(service.getAllTools()).toEqual([]);
    expect(service.getToolNames()).toEqual([]);
  });
});
