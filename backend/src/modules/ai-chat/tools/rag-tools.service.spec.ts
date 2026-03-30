import { RagToolsService } from "./rag-tools.service";

describe("RagToolsService", () => {
  let service: RagToolsService;
  let mockPrisma: any;
  let mockEmbeddingService: any;

  const piiResolve = async (payload: Record<string, unknown>) => payload;

  beforeEach(() => {
    mockPrisma = {
      aIMemory: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({
          id: "new-memory",
          createdAt: new Date("2026-03-30T10:00:00.000Z"),
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    mockEmbeddingService = {
      generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    service = new RagToolsService(
      mockEmbeddingService,
      mockPrisma,
      null as any,
      null as any,
      null as any,
      null as any,
      { registerTool: jest.fn() } as any,
    );
  });

  it("updates an exact-normalized duplicate instead of creating a new memory", async () => {
    mockPrisma.aIMemory.findMany.mockResolvedValue([
      {
        id: "mem-1",
        content: "I prefer reports on Monday mornings.",
        updatedAt: new Date("2026-03-29T10:00:00.000Z"),
      },
    ]);

    const tools = service.getTools("tenant-1", "user-1", piiResolve);
    const result = await (tools.save_memory as any).execute({
      content: "I prefer reports on Monday mornings",
      category: "preference",
    });

    expect(mockPrisma.aIMemory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-1" },
      }),
    );
    expect(mockPrisma.aIMemory.create).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.id).toBe("mem-1");
    expect(result.deduplicated).toBe(true);
  });

  it("deletes extra exact duplicates while keeping a single canonical memory", async () => {
    mockPrisma.aIMemory.findMany.mockResolvedValue([
      {
        id: "mem-1",
        content: "Monday morning reports",
        updatedAt: new Date("2026-03-30T09:00:00.000Z"),
      },
      {
        id: "mem-2",
        content: "Monday morning reports!!!",
        updatedAt: new Date("2026-03-29T09:00:00.000Z"),
      },
    ]);

    const tools = service.getTools("tenant-1", "user-1", piiResolve);
    const result = await (tools.save_memory as any).execute({
      content: "Monday morning reports",
      category: "workflow",
    });

    expect(mockPrisma.aIMemory.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        userId: "user-1",
        id: { in: ["mem-2"] },
      },
    });
    expect(result.mergedDuplicates).toBe(1);
  });

  it("requires delete_memory clarification when multiple memories could match", () => {
    const tools = service.getTools("tenant-1", "user-1", piiResolve);

    expect((tools.save_memory as any).description).toContain(
      "Do NOT call delete_memory to replace or deduplicate a memory",
    );
    expect((tools.delete_memory as any).description).toContain(
      "Delete exactly ONE memory per request.",
    );
    expect((tools.delete_memory as any).description).toContain(
      "instead of issuing multiple delete_memory calls",
    );
  });
});
