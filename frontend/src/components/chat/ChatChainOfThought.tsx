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
    <ChainOfThoughtPrimitive.Root className="my-2 rounded-lg border border-border bg-muted/30">
      <ChainOfThoughtPrimitive.AccordionTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors [&[data-state=open]>svg]:rotate-180">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-200" />
        {t.chat.reasoning.label}
      </ChainOfThoughtPrimitive.AccordionTrigger>
      <ChainOfThoughtPrimitive.Parts
        components={{
          Layout: ({ children }) => (
            <div className="px-3 pb-3 text-sm text-muted-foreground">
              {children}
            </div>
          ),
        }}
      />
    </ChainOfThoughtPrimitive.Root>
  );
}
