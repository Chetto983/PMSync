'use client';

import { useCallback } from 'react';
import { Sparkles, Mail, Calendar, Users } from 'lucide-react';
import { useThreadRuntime } from '@assistant-ui/react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Empty state with greeting and clickable capability cards.
 * Cards send a preset prompt to the assistant on click.
 */
export function ChatEmptyState() {
  const t = useTranslations();
  const runtime = useThreadRuntime();

  const sendPrompt = useCallback(
    (text: string) => {
      runtime.append({ role: 'user', content: [{ type: 'text', text }] });
    },
    [runtime],
  );

  return (
    <div className="chat-empty-state">
      <div className="chat-empty-hero">
        <div className="chat-empty-icon">
          <Sparkles size={28} />
        </div>
        <span className="chat-empty-kicker">{t.ai.overlay.title}</span>
        <h1 className="chat-empty-title">
          {t.chat.emptyState.title}
        </h1>
        <p className="chat-empty-subtitle">
          {t.chat.emptyState.subtitle}
        </p>
      </div>

      <div className="chat-capability-grid">
        <CapabilityCard
          icon={<Mail size={16} />}
          color="email"
          label={t.chat.emptyState.capEmail ?? 'Search and manage emails'}
          onClick={() => sendPrompt(t.chat.emptyState.capEmailPrompt ?? 'Show my unread emails from today')}
        />
        <CapabilityCard
          icon={<Calendar size={16} />}
          color="calendar"
          label={t.chat.emptyState.capCalendar ?? 'Check calendar and schedule'}
          onClick={() => sendPrompt(t.chat.emptyState.capCalendarPrompt ?? 'What meetings do I have today?')}
        />
        <CapabilityCard
          icon={<Users size={16} />}
          color="contacts"
          label={t.chat.emptyState.capContacts ?? 'Find and manage contacts'}
          onClick={() => sendPrompt(t.chat.emptyState.capContactsPrompt ?? 'Who are my most recent contacts?')}
        />
      </div>

      <div className="chat-empty-prompt-strip">
        <button
          type="button"
          className="chat-empty-prompt-pill"
          onClick={() => sendPrompt(t.chat.suggestions.todaySchedulePrompt)}
        >
          {t.chat.suggestions.todayScheduleLabel}
        </button>
        <button
          type="button"
          className="chat-empty-prompt-pill"
          onClick={() => sendPrompt(t.chat.suggestions.triagePrompt)}
        >
          {t.chat.suggestions.triageLabel}
        </button>
        <button
          type="button"
          className="chat-empty-prompt-pill"
          onClick={() => sendPrompt(t.chat.suggestions.briefingPrompt)}
        >
          {t.chat.suggestions.briefingLabel}
        </button>
      </div>
    </div>
  );
}

function CapabilityCard({
  icon,
  color,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  color: 'email' | 'calendar' | 'contacts';
  label: string;
  onClick: () => void;
}) {
  const iconClass = {
    email: 'chat-cap-icon chat-cap-icon-email',
    calendar: 'chat-cap-icon chat-cap-icon-calendar',
    contacts: 'chat-cap-icon chat-cap-icon-contacts',
  };

  return (
    <button type="button" className="chat-capability-card" onClick={onClick}>
      <div className={iconClass[color]}>
        {icon}
      </div>
      <span className="chat-capability-label">{label}</span>
    </button>
  );
}
