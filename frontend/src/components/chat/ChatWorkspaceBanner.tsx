'use client';

import { Sparkles } from 'lucide-react';
import { ContextIndicator } from '@/components/ai-overlay/ContextIndicator';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Stage banner anchoring the V2 copilot workspace on desktop.
 * Provides context and intent without competing with the transcript.
 */
export function ChatWorkspaceBanner() {
  const t = useTranslations();

  return (
    <div className="chat-stage-banner">
      <div className="chat-stage-banner-mark">
        <Sparkles size={18} />
      </div>
      <div className="chat-stage-banner-copy">
        <span className="chat-stage-banner-kicker">{t.ai.overlay.title}</span>
        <h2 className="chat-stage-banner-title">{t.ai.overlay.emptyTitle}</h2>
        <p className="chat-stage-banner-subtitle">{t.ai.overlay.emptyBody}</p>
      </div>
      <div className="chat-stage-banner-meta">
        <ContextIndicator />
        <span className="chat-stage-banner-shortcut">{t.ai.overlay.shortcutHint}</span>
      </div>
    </div>
  );
}
