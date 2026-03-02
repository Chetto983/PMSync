'use client';

import { Sparkles, Mail, Calendar, Users } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Empty state with animated greeting, feature cards, and branding.
 * Inspired by ChatGPT/Claude empty states with capability hints.
 */
export function ChatEmptyState() {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 select-none">
      {/* Gradient icon */}
      <div className="chat-empty-icon mb-6">
        <Sparkles className="h-7 w-7 text-white" />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
        {t.chat.emptyState.title}
      </h1>
      <p className="text-sm text-muted-foreground mb-8 max-w-sm text-center leading-relaxed">
        {t.chat.emptyState.subtitle}
      </p>

      {/* Capability hint cards */}
      <div className="grid grid-cols-1 gap-3 w-full max-w-md chat-capability-cards">
        <CapabilityCard
          icon={<Mail className="h-4 w-4" />}
          color="email"
          label={t.chat.emptyState.capEmail ?? 'Search and manage emails'}
        />
        <CapabilityCard
          icon={<Calendar className="h-4 w-4" />}
          color="calendar"
          label={t.chat.emptyState.capCalendar ?? 'Check calendar and schedule'}
        />
        <CapabilityCard
          icon={<Users className="h-4 w-4" />}
          color="contacts"
          label={t.chat.emptyState.capContacts ?? 'Find and manage contacts'}
        />
      </div>
    </div>
  );
}

function CapabilityCard({
  icon,
  color,
  label,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
}) {
  return (
    <div className={`chat-cap-card chat-cap-${color}`}>
      <div className="chat-cap-icon">{icon}</div>
      <span className="text-sm text-foreground">{label}</span>
    </div>
  );
}
