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
      {/* Icon */}
      <div className="chat-empty-icon">
        <Sparkles className="h-7 w-7" />
      </div>

      {/* Title */}
      <h1 className="chat-empty-title">
        {t.chat.emptyState.title}
      </h1>
      <p className="chat-empty-subtitle">
        {t.chat.emptyState.subtitle}
      </p>

      {/* Clickable capability cards */}
      <div className="chat-capability-grid">
        <CapabilityCard
          icon={<Mail className="h-4 w-4" />}
          color="email"
          label={t.chat.emptyState.capEmail ?? 'Search and manage emails'}
          onClick={() => sendPrompt(t.chat.emptyState.capEmailPrompt ?? 'Show my unread emails from today')}
        />
        <CapabilityCard
          icon={<Calendar className="h-4 w-4" />}
          color="calendar"
          label={t.chat.emptyState.capCalendar ?? 'Check calendar and schedule'}
          onClick={() => sendPrompt(t.chat.emptyState.capCalendarPrompt ?? 'What meetings do I have today?')}
        />
        <CapabilityCard
          icon={<Users className="h-4 w-4" />}
          color="contacts"
          label={t.chat.emptyState.capContacts ?? 'Find and manage contacts'}
          onClick={() => sendPrompt(t.chat.emptyState.capContactsPrompt ?? 'Who are my most recent contacts?')}
        />
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
