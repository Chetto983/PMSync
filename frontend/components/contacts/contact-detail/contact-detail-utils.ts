import React from 'react';
import { Box } from '@mui/material';
import type { Contact } from '@/lib/api/contacts';

export interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

export function TabPanel({ children, value, index }: TabPanelProps) {
  return React.createElement(
    'div',
    { role: 'tabpanel', hidden: value !== index, style: { height: '100%' } },
    value === index
      ? React.createElement(Box, { sx: { py: 3, height: '100%' } }, children)
      : null,
  );
}

export function getContactName(contact: Contact, fallback: string = 'Unnamed contact'): string {
  if (contact.displayName) return contact.displayName;
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return contact.emails?.[0]?.value || fallback;
}

export function getPrimaryEmail(contact: Contact): string | null {
  const primary = contact.emails?.find((e) => e.primary);
  return primary?.value || contact.emails?.[0]?.value || null;
}

export function formatDate(date?: Date | string | null, fallback: string = 'Never', locale?: string): string {
  if (!date) return fallback;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date?: Date | string | null, locale?: string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
