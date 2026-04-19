'use client';

import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { ChevronRight, Code, Loader2 } from 'lucide-react';
import Box from '@mui/material/Box';
import { useTranslations } from '@/lib/hooks/use-translations';
import { HitlApprovalWrapper, HIGH_RISK_TOOLS } from '../HitlApprovalCard';

/**
 * Generic fallback tool renderer for ALL unregistered tools.
 *
 * Used as the Fallback in components.tools config on MessagePrimitive.Content. Handles:
 * - HITL approval (requires-action status -> HitlApprovalWrapper)
 * - Running state (spinner + tool name)
 * - Complete state (icon + collapsible details)
 */
export function FallbackToolRenderer({
  status,
  toolCallId,
  toolName,
  args,
  result,
  addResult,
  interrupt,
}: ToolCallMessagePartProps<unknown, unknown>) {
  // SDK-native HITL: show approval card when tool requires action
  if (status.type === 'requires-action') {
    return (
      <HitlApprovalWrapper
        status={status}
        addResult={addResult}
        toolCallId={toolCallId}
        toolName={toolName}
        args={(args ?? {}) as Record<string, unknown>}
        result={result}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interrupt={interrupt as any}
      />
    );
  }

  // Completed destructive tools get terminal state rendering
  if (status.type === 'complete' && HIGH_RISK_TOOLS.has(toolName)) {
    return (
      <HitlApprovalWrapper
        status={status}
        addResult={addResult}
        toolCallId={toolCallId}
        toolName={toolName}
        args={(args ?? {}) as Record<string, unknown>}
        result={result}
      />
    );
  }

  const t = useTranslations();
  const tu = t.ai.toolUi;
  const isRunning = status.type === 'running';

  return (
    <div className="chat-tool-fallback">
      <div className="chat-tool-fallback-header">
        {isRunning ? (
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              '@keyframes spin': {
                from: { transform: 'rotate(0deg)' },
                to: { transform: 'rotate(360deg)' },
              },
              animation: 'spin 1s linear infinite',
            }}
          >
            <Loader2 size={14} color="var(--mui-palette-primary-main)" />
          </Box>
        ) : (
          <Code size={14} color="var(--mui-palette-text-secondary)" />
        )}
        <span className="chat-tool-fallback-name">
          {toolName}
        </span>
        <span className="chat-tool-fallback-status">
          {isRunning ? (tu?.running ?? 'Running') : (tu?.complete ?? 'Complete')}
        </span>
      </div>
      <details className="chat-tool-fallback-details" aria-label={`${toolName} details`}>
        <summary className="chat-tool-fallback-summary">
          <ChevronRight size={14} />
          {isRunning ? (tu?.arguments ?? 'Arguments') : (tu?.details ?? 'Details')}
        </summary>
        <div className="chat-tool-fallback-body">
          {args != null && (
            <pre className="chat-tool-fallback-pre">
              {JSON.stringify(args, null, 2)}
            </pre>
          )}
          {result != null && (
            <pre className="chat-tool-fallback-pre">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </details>
    </div>
  );
}
