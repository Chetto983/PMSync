"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  XCircleIcon,
  AlertCircleIcon,
} from "lucide-react";
import { motion } from "framer-motion";
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
  list_follow_ups: "Checking follow-ups",
  manage_label: "Managing label",
  list_folders: "Loading folders",
  manage_folder: "Managing folder",
  get_events: "Checking calendar",
  manage_event: "Managing event",
  search_contacts: "Searching contacts",
  manage_contact: "Managing contact",
  memory_search: "Recalling memory",
  search_memory: "Recalling memory",
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
  return toolName
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

export type ToolProps = ComponentProps<typeof Collapsible>;

/**
 * Tool wrapper - matches assistant-ui ToolFallback design.
 * Clean rounded-lg border, no shadow, minimal chrome.
 * Subtle fade-in animation on render (framer-motion).
 */
export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    asChild
    className={cn(
      "group not-prose w-full rounded-lg border py-3",
      "[--animation-duration:200ms]",
      className,
    )}
    style={{ "--animation-duration": "200ms" } as React.CSSProperties}
  >
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      {...props}
    />
  </Collapsible>
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
 * Status icon based on tool state.
 * Matches assistant-ui: spinner for running, check for complete, X for error.
 */
function StatusIcon({ state }: { state: ToolPart["state"] }) {
  const isRunning =
    state === "input-streaming" || state === "input-available";
  const isError = state === "output-error" || state === "output-denied";
  const isComplete =
    state === "output-available" || state === "approval-responded";

  if (isRunning) {
    return <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />;
  }
  if (isComplete) {
    return <CheckIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (isError) {
    return <XCircleIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <AlertCircleIcon className="size-4 shrink-0 text-muted-foreground" />;
}

/**
 * ToolHeader - matches assistant-ui ToolFallback trigger.
 * Clean: status icon + tool name (bold) + chevron.
 */
export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
}: ToolHeaderProps) => {
  const rawName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  const displayName = title ?? formatToolName(rawName);

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 px-4 text-sm transition-colors",
        className,
      )}
    >
      <StatusIcon state={state} />
      <span className="relative inline-block grow text-left leading-none">
        <span className="text-muted-foreground">Used tool: </span>
        <b className="text-foreground">{displayName}</b>
      </span>
      <ChevronDownIcon
        className={cn(
          "size-4 shrink-0 text-muted-foreground",
          "transition-transform duration-200 ease-out",
          "group-data-[state=closed]:-rotate-90",
          "group-data-[state=open]:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

/**
 * ToolContent - matches assistant-ui collapsible content.
 * Uses border-t separator with smooth animation.
 */
export const ToolContent = ({ className, children, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "relative overflow-hidden text-sm outline-none",
      "ease-out",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2",
      "data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
      className,
    )}
    {...props}
  >
    <div className="mt-3 border-t pt-2">
      {children}
    </div>
  </CollapsibleContent>
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden px-4", className)} {...props}>
    <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
      {JSON.stringify(input, null, 2)}
    </pre>
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
    <div className={cn("space-y-2 border-t border-dashed px-4 pt-2", className)} {...props}>
      <p className="font-semibold text-sm">
        {errorText ? "Error:" : "Result:"}
      </p>
      <div
        className={cn(
          "overflow-x-auto text-sm",
          errorText ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {errorText && <div>{errorText}</div>}
        <pre className="whitespace-pre-wrap">{Output}</pre>
      </div>
    </div>
  );
};

/* Re-export getStatusBadge for backward compatibility */
export const getStatusBadge = (_status: ToolPart["state"]) => null;
