/**
 * Compose Email Page
 *
 * Standalone page for composing emails.
 * Supports:
 * - New email composition
 * - Reply/ReplyAll/Forward modes via query params
 * - Draft editing
 */

import { useRouter } from 'next/router';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { ComposeDialog } from '@/components/email/compose';
import { useEmail } from '@/hooks/queries';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { ComposeDialogProps } from '@/components/email/compose';

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export default function ComposePage() {
  const router = useRouter();
  const t = useTranslations();

  // Parse query params - only when router is ready
  const {
    mode: queryMode,
    emailId,
    draftId,
    providerId,
  } = router.query as {
    mode?: string;
    emailId?: string;
    draftId?: string;
    providerId?: string;
  };

  // Validate and cast mode
  const mode: ComposeMode = ['reply', 'replyAll', 'forward'].includes(queryMode || '')
    ? (queryMode as ComposeMode)
    : 'new';

  // Fetch original email if replying/forwarding
  // Note: useEmail is automatically disabled when emailId is empty
  const shouldFetchEmail = !!emailId && mode !== 'new';
  const { data: originalEmailData, isLoading: isLoadingEmail } = useEmail(
    shouldFetchEmail ? emailId : ''
  );

  // Handle dialog close - navigate back to inbox
  const handleClose = () => {
    // Go back to previous page or inbox
    if (window.history.length > 2) {
      router.back();
    } else {
      router.push('/dashboard/email');
    }
  };

  // Handle successful send
  const handleSent = () => {
    router.push('/dashboard/email');
  };

  // Show loading while waiting for router or email data
  if (!router.isReady || (emailId && isLoadingEmail)) {
    return (
      <Layout>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 400,
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography color="text.secondary">
            {t.common?.loading || 'Loading...'}
          </Typography>
        </Box>
      </Layout>
    );
  }

  // Format original email for ComposeDialog
  const originalEmail: ComposeDialogProps['originalEmail'] = originalEmailData
    ? {
        id: originalEmailData.id,
        from: originalEmailData.from,
        to: originalEmailData.to || [],
        cc: originalEmailData.cc || [],
        subject: originalEmailData.subject || '',
        bodyHtml: originalEmailData.bodyHtml || originalEmailData.bodyText || undefined,
        receivedAt: originalEmailData.receivedAt,
      }
    : undefined;

  return (
    <Layout>
      <ComposeDialog
        open={true}
        onClose={handleClose}
        mode={mode}
        originalEmail={originalEmail}
        draftId={draftId}
        initialProviderId={providerId}
        onSent={handleSent}
      />
    </Layout>
  );
}
