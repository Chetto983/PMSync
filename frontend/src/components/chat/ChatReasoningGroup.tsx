'use client';

import { useState, type PropsWithChildren } from 'react';
import { ChevronDown } from 'lucide-react';
import Box from '@mui/material/Box';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Collapsible wrapper for grouped reasoning parts.
 * Used as ReasoningGroup component in MessagePrimitive.Content's StandardComponents.
 *
 * Renders a toggle header + collapsible content area for AI thinking tokens.
 */
export function ChatReasoningGroup({ children }: PropsWithChildren<{ startIndex: number; endIndex: number }>) {
  const t = useTranslations();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="chat-cot-root">
      <button
        type="button"
        className="chat-cot-trigger"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <Box
          component={ChevronDown}
          sx={{
            width: 14,
            height: 14,
            flexShrink: 0,
            transition: 'transform 200ms ease',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
        />
        <span className="chat-cot-label">{t.chat.reasoning.label}</span>
      </button>
      {!collapsed && (
        <div className="chat-cot-content">
          {children}
        </div>
      )}
    </div>
  );
}
