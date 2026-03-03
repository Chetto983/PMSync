'use client';

import { ChainOfThoughtPrimitive } from '@assistant-ui/react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Chain of thought collapsible accordion for AI reasoning steps.
 * Uses ChainOfThoughtPrimitive per locked user decision (not hand-rolled).
 *
 * Renders as a component for MessagePrimitive.Content's `ChainOfThought` slot.
 */
export function ChatChainOfThought() {
  const t = useTranslations();

  return (
    <ChainOfThoughtPrimitive.Root className="chat-cot-root">
      <ChainOfThoughtPrimitive.AccordionTrigger className="chat-cot-trigger [&[data-state=open]>svg]:rotate-180">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-200" />
        {t.chat.reasoning.label}
      </ChainOfThoughtPrimitive.AccordionTrigger>
      <ChainOfThoughtPrimitive.Parts
        components={{
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
