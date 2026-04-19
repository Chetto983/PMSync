'use client';

import { Sparkles } from 'lucide-react';
import { ContextIndicator } from '@/components/ai-overlay/ContextIndicator';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Desktop rail intro for the V2 copilot workspace.
 * Gives the conversation rail a clear product identity before the list begins.
 */
export function ChatRailIntro() {
  const t = useTranslations();

  return (
    <div className="chat-rail-intro">
      <div className="chat-rail-intro-main">
        <div className="chat-rail-intro-mark">
          <Sparkles size={16} />
        </div>
        <div className="chat-rail-intro-copy">
          <span className="chat-rail-intro-kicker">{t.ai.overlay.title}</span>
          <h2 className="chat-rail-intro-title">{t.chat.threadList.title}</h2>
        </div>
      </div>
      <div className="chat-rail-intro-meta">
        <ContextIndicator />
        <span className="chat-rail-intro-caption">{t.chat.threadList.newChat}</span>
      </div>
    </div>
  );
}
