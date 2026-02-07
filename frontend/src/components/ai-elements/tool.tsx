"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  Loader2Icon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { CodeBlock } from "./code-block";

/**
 * Human-readable tool name mapping for VoltAgent tools.
 * Maps snake_case tool names to user-friendly action descriptions.
 */
const TOOL_NAME_MAP: Record<string, string> = {
  list_emails: "Searching emails",
  list_email_index: "Loading inbox",
  get_email_content: "Reading email",
  search_emails: "Searching emails",
  semantic_search_emails: "Smart searching",
  manage_email: "Managing email",
  bulk_email_actions: "Processing emails",
  count_emails: "Counting emails",
  analyze_email: "Analyzing email",
  compose_reply: "Drafting reply",
  search_knowledge_base: "Searching knowledge",
  manage_follow_up: "Managing follow-up",
  manage_label: "Managing label",
  list_folders: "Loading folders",
  manage_folder: "Managing folder",
  get_events: "Checking calendar",
  manage_event: "Managing event",
  search_contacts: "Searching contacts",
  manage_contact: "Managing contact",
  memory_search: "Recalling memory",
  memory_store: "Saving to memory",
  web_search: "Searching web",
  ask_user_clarification: "Asking for clarification",
};

/**
 * Formats a tool name for display.
 * Uses human-readable mapping if available, otherwise formats the raw name.
 */
function formatToolName(toolName: string): string {
  if (TOOL_NAME_MAP[toolName]) {
    return TOOL_NAME_MAP[toolName];
  }
  // Fallback: replace underscores with spaces and capitalize first letter
  return toolName
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("group not-prose mb-4 w-full rounded-md border", className)}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

/**
 * Returns a badge showing tool execution state with appropriate icon and label.
 * Uses spinning loader for active states, checkmark for success, X for errors.
 */
export const getStatusBadge = (status: ToolPart["state"]) => {
  const labels: Record<ToolPart["state"], string> = {
    "input-streaming": "Preparing...",
    "input-available": "Running...",
    "approval-requested": "Awaiting Approval",
    "approval-responded": "Responded",
    "output-available": "Complete",
    "output-error": "Failed",
    "output-denied": "Denied",
  };

  const icons: Record<ToolPart["state"], ReactNode> = {
    // Use spinning loader for active/streaming states
    "input-streaming": <Loader2Icon className="size-4 animate-spin" />,
    "input-available": <Loader2Icon className="size-4 animate-spin" />,
    "approval-requested": <Loader2Icon className="size-4 text-yellow-600 animate-spin" />,
    "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
    "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
    "output-error": <XCircleIcon className="size-4 text-red-600" />,
    "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
  };

  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {icons[status]}
      {labels[status]}
    </Badge>
  );
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  // Get raw tool name from type or toolName prop
  const rawName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  // Format to human-readable name
  const displayName = title ?? formatToolName(rawName);

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-4 p-3",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <WrenchIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{displayName}</span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden p-4", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Parameters
    </h4>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2 p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
