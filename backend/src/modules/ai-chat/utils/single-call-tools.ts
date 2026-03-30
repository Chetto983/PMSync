export const SINGLE_CALL_PER_TURN_TOOLS = new Set(["delete_memory"]);

export interface ToolCallLike {
  toolName: string;
  toolCallId: string;
}

export function suppressDuplicateSingleCallToolEntries<T extends ToolCallLike>(
  entries: readonly T[] | undefined,
  seenToolNames: Set<string> = new Set<string>(),
): {
  filteredEntries: T[];
  suppressedToolCallIds: Set<string>;
} {
  if (!entries?.length) {
    return {
      filteredEntries: [],
      suppressedToolCallIds: new Set<string>(),
    };
  }

  const filteredEntries: T[] = [];
  const suppressedToolCallIds = new Set<string>();

  for (const entry of entries) {
    if (!SINGLE_CALL_PER_TURN_TOOLS.has(entry.toolName)) {
      filteredEntries.push(entry);
      continue;
    }

    if (seenToolNames.has(entry.toolName)) {
      suppressedToolCallIds.add(entry.toolCallId);
      continue;
    }

    seenToolNames.add(entry.toolName);
    filteredEntries.push(entry);
  }

  return { filteredEntries, suppressedToolCallIds };
}

export function filterMessageContentBySuppressedToolCallIds(
  content: unknown,
  suppressedToolCallIds: ReadonlySet<string>,
): unknown {
  if (!Array.isArray(content) || suppressedToolCallIds.size === 0) {
    return content;
  }

  return content.filter((part) => {
    if (!part || typeof part !== "object") {
      return true;
    }

    const record = part as Record<string, unknown>;

    if (
      (record.type === "tool-call" ||
        record.type === "tool-result" ||
        record.type === "tool-error") &&
      typeof record.toolCallId === "string"
    ) {
      return !suppressedToolCallIds.has(record.toolCallId);
    }

    if (record.type === "tool-approval-request") {
      const toolCall =
        record.toolCall && typeof record.toolCall === "object"
          ? (record.toolCall as Record<string, unknown>)
          : undefined;
      return !(
        typeof toolCall?.toolCallId === "string" &&
        suppressedToolCallIds.has(toolCall.toolCallId)
      );
    }

    return true;
  });
}

export function filterResponseMessagesBySuppressedToolCallIds(
  messages: Array<{ role: string; content: unknown }> | undefined,
  suppressedToolCallIds: ReadonlySet<string>,
): Array<{ role: string; content: unknown }> | undefined {
  if (!messages || suppressedToolCallIds.size === 0) {
    return messages;
  }

  return messages.flatMap((message) => {
    const filteredContent = filterMessageContentBySuppressedToolCallIds(
      message.content,
      suppressedToolCallIds,
    );

    if (Array.isArray(filteredContent) && filteredContent.length === 0) {
      return [];
    }

    return [{ ...message, content: filteredContent }];
  });
}
