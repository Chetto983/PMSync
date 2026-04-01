import {
  Calendar,
  CheckSquare,
  Home,
  Mail,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type PillarLabelKey = 'home' | 'mail' | 'calendar' | 'contacts' | 'tasks';

export interface PillarItem {
  href: string;
  icon: LucideIcon;
  labelKey: PillarLabelKey;
}

export const PILLAR_ITEMS: PillarItem[] = [
  { href: '/dashboard', icon: Home, labelKey: 'home' },
  { href: '/dashboard/email', icon: Mail, labelKey: 'mail' },
  { href: '/dashboard/calendar', icon: Calendar, labelKey: 'calendar' },
  { href: '/dashboard/contacts', icon: Users, labelKey: 'contacts' },
  { href: '/dashboard/tasks', icon: CheckSquare, labelKey: 'tasks' },
];

export function getActiveSidebarHref(currentPath: string): string | null {
  if (currentPath === '/dashboard') {
    return '/dashboard';
  }

  const match = PILLAR_ITEMS
    .filter((pillar) => pillar.href !== '/dashboard')
    .find((pillar) => currentPath === pillar.href || currentPath.startsWith(`${pillar.href}/`));

  return match?.href ?? null;
}
