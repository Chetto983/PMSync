import {
  filterMessageContentBySuppressedToolCallIds,
  filterResponseMessagesBySuppressedToolCallIds,
  suppressDuplicateSingleCallToolEntries,
} from "./single-call-tools";

describe("single-call tool policy", () => {
  it("suppresses duplicate delete_memory entries after the first one", () => {
    const result = suppressDuplicateSingleCallToolEntries([
      { toolName: "delete_memory", toolCallId: "mem-1" },
      { toolName: "delete_memory", toolCallId: "mem-2" },
      { toolName: "list_memories", toolCallId: "list-1" },
    ]);

    expect(result.filteredEntries).toEqual([
      { toolName: "delete_memory", toolCallId: "mem-1" },
      { toolName: "list_memories", toolCallId: "list-1" },
    ]);
    expect(Array.from(result.suppressedToolCallIds)).toEqual(["mem-2"]);
  });

  it("filters suppressed tool-call and approval parts from message content", () => {
    const filtered = filterMessageContentBySuppressedToolCallIds(
      [
        {
          type: "tool-call",
          toolCallId: "mem-1",
          toolName: "delete_memory",
        },
        {
          type: "tool-approval-request",
          approvalId: "approval-1",
          toolCall: { toolCallId: "mem-1", toolName: "delete_memory" },
        },
        {
          type: "tool-call",
          toolCallId: "list-1",
          toolName: "list_memories",
        },
      ],
      new Set(["mem-1"]),
    ) as Array<Record<string, unknown>>;

    expect(filtered).toHaveLength(1);
    expect(filtered[0].toolCallId).toBe("list-1");
  });

  it("filters suppressed tool-call IDs from response messages", () => {
    const filtered = filterResponseMessagesBySuppressedToolCallIds(
      [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "mem-1",
              toolName: "delete_memory",
            },
            {
              type: "tool-call",
              toolCallId: "list-1",
              toolName: "list_memories",
            },
          ],
        },
      ],
      new Set(["mem-1"]),
    );

    expect(filtered).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "list-1",
            toolName: "list_memories",
          },
        ],
      },
    ]);
  });
});
