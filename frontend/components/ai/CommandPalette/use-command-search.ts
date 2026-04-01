'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Mail, User, Handshake, Ticket, BookOpen } from 'lucide-react';
import { emailsApi } from '@/lib/api/emails';
import { contactsApi } from '@/lib/api/contacts';
import { crmDealsApi } from '@/lib/api/crm-deals';
import { crmTicketsApi } from '@/lib/api/crm-tickets';
import { crmKBApi } from '@/lib/api/crm-kb';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { formatDateInTz } from '@/lib/utils/format-date-tz';
import type { SearchResult, SearchResultGroup } from './types';

interface UseCommandSearchResult {
  results: SearchResultGroup[];
  isSearching: boolean;
  hasError: boolean;
}

export function useCommandSearch(query: string): UseCommandSearchResult {
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasError, setHasError] = useState(false);
  const reqIdRef = useRef(0);
  const router = useRouter();
  const t = useTranslations();
  const tz = useUserTimezone();

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setIsSearching(false);
      setHasError(false);
      return;
    }

    const currentReqId = ++reqIdRef.current;
    setIsSearching(true);
    setHasError(false);

    Promise.allSettled([
      emailsApi.searchEmails(query, 5),
      contactsApi.listContacts({ search: query, limit: 5 }),
      crmDealsApi.list({ search: query, limit: 5 }),
      crmTicketsApi.list({ search: query, limit: 5 }),
      crmKBApi.search(query, 5),
    ]).then((settled) => {
      if (reqIdRef.current !== currentReqId) return;

      const groups: SearchResultGroup[] = [];
      let allRejected = true;

      // Emails
      if (settled[0].status === 'fulfilled') {
        allRejected = false;
        const emails = settled[0].value;
        if (emails.length > 0) {
          groups.push({
            type: 'email',
            label: t.commandPalette.emailResults,
            results: emails.map((email): SearchResult => ({
              id: `email-${email.id}`,
              type: 'email',
              title: email.subject || '(No subject)',
              subtitle: `${email.from} - ${formatDateInTz(email.receivedAt, tz)}`,
              icon: Mail,
              action: () => router.push(`/dashboard/email?id=${email.id}`),
            })),
          });
        }
      }

      // Contacts
      if (settled[1].status === 'fulfilled') {
        allRejected = false;
        const contacts = settled[1].value.contacts;
        if (contacts.length > 0) {
          groups.push({
            type: 'contact',
            label: t.commandPalette.contactResults,
            results: contacts.map((contact): SearchResult => ({
              id: `contact-${contact.id}`,
              type: 'contact',
              title: contact.displayName || contact.emails?.[0]?.value || 'Unknown',
              subtitle: contact.company || contact.emails?.[0]?.value || '',
              icon: User,
              action: () => router.push(`/dashboard/contacts?id=${contact.id}`),
            })),
          });
        }
      }

      // Deals
      if (settled[2].status === 'fulfilled') {
        allRejected = false;
        const deals = settled[2].value.data.data;
        if (deals.length > 0) {
          groups.push({
            type: 'deal',
            label: t.commandPalette.dealResults,
            results: deals.map((deal): SearchResult => ({
              id: `deal-${deal.id}`,
              type: 'deal',
              title: deal.name,
              subtitle: `${deal.stage?.name || ''} - ${deal.amount ? '$' + Number(deal.amount).toLocaleString() : ''}`.trim(),
              icon: Handshake,
              action: () => router.push(`/dashboard/crm/deals?id=${deal.id}`),
            })),
          });
        }
      }

      // Tickets
      if (settled[3].status === 'fulfilled') {
        allRejected = false;
        const tickets = settled[3].value.data.data;
        if (tickets.length > 0) {
          groups.push({
            type: 'ticket',
            label: t.commandPalette.ticketResults,
            results: tickets.map((ticket): SearchResult => ({
              id: `ticket-${ticket.id}`,
              type: 'ticket',
              title: ticket.subject,
              subtitle: `${ticket.status} - ${ticket.priority}`,
              icon: Ticket,
              action: () => router.push(`/dashboard/crm/tickets?id=${ticket.id}`),
            })),
          });
        }
      }

      // KB Articles
      if (settled[4].status === 'fulfilled') {
        allRejected = false;
        const articles = settled[4].value.data.data;
        if (articles.length > 0) {
          groups.push({
            type: 'kb',
            label: t.commandPalette.kbResults,
            results: articles.map((article): SearchResult => ({
              id: `kb-${article.id}`,
              type: 'kb',
              title: article.title,
              subtitle: article.snippet?.substring(0, 80) || '',
              icon: BookOpen,
              action: () => router.push(`/dashboard/crm/kb?id=${article.id}`),
            })),
          });
        }
      }

      setHasError(allRejected);
      setResults(groups);
      setIsSearching(false);
    });
  }, [query, router, t, tz]);

  return { results, isSearching, hasError };
}
