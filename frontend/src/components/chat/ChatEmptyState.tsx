'use client';

import { Bot } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Empty state shown when no messages exist in the thread.
 * Centered layout with bot icon, title and subtitle from i18n.
 */
export function ChatEmptyState() {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        {t.chat.emptyState.title}
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        {t.chat.emptyState.subtitle}
      </p>
    </div>
  );
}
