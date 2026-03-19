'use client';

import React, { useEffect } from 'react';
import { ChainOfThoughtPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import { ChevronDown } from 'lucide-react';
import Box from '@mui/material/Box';
import { useTranslations } from '@/lib/hooks/use-translations';
import { TOOL_RENDERERS, FallbackToolRenderer } from './tool-uis';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';

/**
 * Dispatching tool renderer: routes tool calls to specific renderers by name,
 * falling back to FallbackToolRenderer for unregistered tools.
 */
function ToolDispatcher(props: ToolCallMessagePartProps) {
  const Renderer = (TOOL_RENDERERS as Record<string, React.ComponentType<ToolCallMessagePartProps> | undefined>)[props.toolName];
  if (Renderer) return <Renderer {...props} />;
  return <FallbackToolRenderer {...props} />;
}

/**
 * Chain of thought collapsible accordion for AI reasoning steps.
 * Uses ChainOfThoughtPrimitive per locked user decision (not hand-rolled).
 *
 * Renders as a component for MessagePrimitive.Content's `ChainOfThought` slot.
 */
export function ChatChainOfThought() {
  const t = useTranslations();
  const aui = useAui();
  const hasPendingApproval = useAuiState((s) =>
    s.chainOfThought.parts.some(
      (part) => part.type === 'tool-call' && part.status?.type === 'requires-action',
    ),
  );

  useEffect(() => {
    if (hasPendingApproval) {
      aui.chainOfThought().setCollapsed(false);
    }
  }, [aui, hasPendingApproval]);

  return (
    <ChainOfThoughtPrimitive.Root className="chat-cot-root">
      <ChainOfThoughtPrimitive.AccordionTrigger className="chat-cot-trigger">
        <Box
          component={ChevronDown}
          sx={{
            width: 14,
            height: 14,
            flexShrink: 0,
            transition: 'transform 200ms ease',
          }}
        />
        {t.chat.reasoning.label}
      </ChainOfThoughtPrimitive.AccordionTrigger>
      <ChainOfThoughtPrimitive.Parts
        components={{
          tools: {
            Fallback: ToolDispatcher,
          },
          Layout: ({ children }) => (
            <div className="chat-cot-content">
              {children}
            </div>
          ),
        }}
      />
    </ChainOfThoughtPrimitive.Root>
  );
}
