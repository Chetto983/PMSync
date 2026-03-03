'use client';

import { Sparkles, Mail, Calendar, Users } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Empty state with greeting, feature cards, and branding.
 * Clean assistant-ui inspired layout with capability hints.
 */
export function ChatEmptyState() {
  const t = useTranslations();

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 py-6 text-center">
      {/* Gradient icon */}
      <div className="size-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20 mb-6">
        <Sparkles className="h-7 w-7 text-white" />
      </div>

      {/* Title */}
      <h1 className="relative mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t.chat.emptyState.title}
      </h1>
      <p className="relative max-w-lg mb-6 text-sm leading-relaxed text-muted-foreground">
        {t.chat.emptyState.subtitle}
      </p>

      {/* Capability hint cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-md">
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
  color: 'email' | 'calendar' | 'contacts';
  label: string;
}) {
  const colorClasses = {
    email: 'bg-email/10 text-email',
    calendar: 'bg-calendar/10 text-calendar',
    contacts: 'bg-contacts/10 text-contacts',
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:border-border hover:shadow-sm transition-all">
      <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${colorClasses[color]}`}>
        {icon}
      </div>
      <span className="text-sm text-foreground">{label}</span>
    </div>
  );
}
