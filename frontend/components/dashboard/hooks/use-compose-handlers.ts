import { useCallback } from 'react';
import type { Email } from '@/stores/email-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { ComposePrefillData } from '@/components/email/ComposeDialog/types';

interface UseComposeHandlersProps {
    /**
     * Opens the compose dialog with the given mode and prefill data.
     * Using a single function avoids stale closure issues that occur
     * when separate setComposeMode/setComposePrefill/setComposeOpen calls
     * capture different state snapshots.
     */
    openCompose: (mode: 'compose' | 'reply' | 'forward', prefill: ComposePrefillData | null) => void;
}

export function useComposeHandlers({
    openCompose
}: UseComposeHandlersProps) {
    const t = useTranslations();

    const createQuotedBody = useCallback((email: Email, headerTemplate: string) => {
        const quotedBody = email.bodyHtml || email.bodyText || '';
        const quotedDate = email.receivedAt ? new Date(email.receivedAt).toLocaleString() : '';
        const quotedFrom = email.from || '';
        const quoteHeader = headerTemplate
            .replace('{date}', quotedDate)
            .replace('{from}', quotedFrom);

        return quotedBody
            ? `<br/><br/><blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 0; color: #666;">
          <p>${quoteHeader}</p>
          ${quotedBody}
        </blockquote>`
            : '';
    }, []);

    const createForwardBody = useCallback((email: Email) => {
        const forwardBody = email.bodyHtml || email.bodyText || '';
        const forwardedDate = email.receivedAt ? new Date(email.receivedAt).toLocaleString() : '';

        // Explicitly getting translated labels within the function to ensure freshness
        const forwardedHeader = t.email.composer.forwardedMessageHeader;
        const forwardFromLabel = t.email.composer.from;
        const forwardDateLabel = t.email.view.date;
        const forwardSubjectLabel = t.email.composer.subject;
        const forwardToLabel = t.email.view.to;

        return forwardBody
            ? `<br/><br/>${forwardedHeader}<br/>
          ${forwardFromLabel}: ${email.from || ''}<br/>
          ${forwardDateLabel}: ${forwardedDate}<br/>
          ${forwardSubjectLabel}: ${email.subject || ''}<br/>
          ${forwardToLabel}: ${email.to?.join(', ') || ''}<br/><br/>
          ${forwardBody}`
            : '';
    }, [t]);

    const handleReply = useCallback((email: Email) => {
        const replyPrefix = t.email.composer.replyPrefix;
        const subject = email.subject?.trim() || '';
        const replySubject = subject.toLowerCase().startsWith(replyPrefix.toLowerCase())
            ? subject
            : `${replyPrefix} ${subject}`.trim();

        const formattedQuote = createQuotedBody(email, t.email.composer.replyQuotedHeader);

        // Use single openCompose call to avoid stale closure issues
        openCompose('reply', {
            originalEmailId: email.id,
            to: [email.from],
            subject: replySubject,
            body: formattedQuote,
            inReplyTo: email.externalId || undefined,
            references: email.references || email.externalId || undefined,
        });
    }, [t, createQuotedBody, openCompose]);

    const handleReplyAll = useCallback((email: Email) => {
        const allRecipients = [email.from, ...(!email.to ? [] : email.to), ...(!email.cc ? [] : email.cc)];
        const uniqueRecipients = Array.from(new Set(allRecipients));

        // Identical subject logic
        const replyPrefix = t.email.composer.replyPrefix;
        const subject = email.subject?.trim() || '';
        const replySubject = subject.toLowerCase().startsWith(replyPrefix.toLowerCase())
            ? subject
            : `${replyPrefix} ${subject}`.trim();

        const formattedQuote = createQuotedBody(email, t.email.composer.replyQuotedHeader);

        // Use single openCompose call to avoid stale closure issues
        openCompose('reply', {
            originalEmailId: email.id,
            to: uniqueRecipients,
            subject: replySubject,
            body: formattedQuote,
            inReplyTo: email.externalId || undefined,
            references: email.references || email.externalId || undefined,
        });
    }, [t, createQuotedBody, openCompose]);

    const handleForward = useCallback((email: Email) => {
        const forwardPrefix = t.email.composer.forwardPrefix;
        const subject = email.subject?.trim() || '';
        const forwardSubject = subject.toLowerCase().startsWith(forwardPrefix.toLowerCase())
            ? subject
            : `${forwardPrefix} ${subject}`.trim();

        const formattedForward = createForwardBody(email);

        // Use single openCompose call to avoid stale closure issues
        openCompose('forward', {
            originalEmailId: email.id,
            subject: forwardSubject,
            body: formattedForward,
        });
    }, [t, createForwardBody, openCompose]);

    return {
        handleReply,
        handleReplyAll,
        handleForward
    };
}
