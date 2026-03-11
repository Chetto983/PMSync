import React from 'react';
import { Box, Container, Typography, Paper, Divider, Link } from '@mui/material';
import { useRouter } from 'next/router';
import { ArrowLeft } from 'lucide-react';
import { SeoHead } from '@/components/seo/SeoHead';
import { minViewportHeightSx } from '@/lib/ui/viewport';

const LAST_UPDATED_DATE = 'February 26, 2026';

export default function TermsOfService() {
  const router = useRouter();

  const handleBack = (event: React.MouseEvent) => {
    event.preventDefault();
    const returnTo = Array.isArray(router.query.from) ? router.query.from[0] : router.query.from;
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer) {
      router.back();
      return;
    }
    router.push('/');
  };

  return (
    <Box sx={{ ...minViewportHeightSx, bgcolor: 'background.default', py: 4 }}>
      <SeoHead
        canonicalPath="/terms"
        description="Read the PMSync Terms of Service covering account use, provider integrations, AI features, data ownership, and service conditions."
        title="Terms of Service | PMSync"
      />
      <Container maxWidth="md">
        <Link
          href="/"
          onClick={handleBack}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            mb: 3,
            cursor: 'pointer',
            color: 'primary.main',
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          <ArrowLeft size={18} />
          Back
        </Link>

        <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, border: 1, borderColor: 'divider' }}>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
            Terms of Service
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Last updated: {LAST_UPDATED_DATE}
          </Typography>

          <Divider sx={{ mb: 4 }} />

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            1. Acceptance of Terms
          </Typography>
          <Typography variant="body1" paragraph>
            By accessing and using PMSync (&quot;Service&quot;), you accept and agree to be bound by the
            terms and provisions of this agreement. If you do not agree to these Terms of Service,
            please do not use the Service.
          </Typography>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            2. Description of Service
          </Typography>
          <Typography variant="body1" paragraph>
            PMSync is an AI-powered email management platform that provides:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                Unified inbox for multiple email providers (Gmail, Microsoft Outlook, IMAP)
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                AI features including email summarization, smart replies, and categorization
              </Typography>
            </li>
            <li>
              <Typography variant="body1">Calendar and contact synchronization</Typography>
            </li>
            <li>
              <Typography variant="body1">Real-time updates via WebSocket</Typography>
            </li>
            <li>
              <Typography variant="body1">Email search and filtering capabilities</Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            3. User Accounts and Registration
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
            3.1 Account Creation
          </Typography>
          <Typography variant="body1" paragraph>
            To use the Service, you must:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Be at least 18 years of age</Typography>
            </li>
            <li>
              <Typography variant="body1">Provide accurate and complete registration information</Typography>
            </li>
            <li>
              <Typography variant="body1">Maintain the security of your account credentials</Typography>
            </li>
            <li>
              <Typography variant="body1">Notify us immediately of any unauthorized access</Typography>
            </li>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
            3.2 Account Responsibility
          </Typography>
          <Typography variant="body1" paragraph>
            You are responsible for all activities that occur under your account. You agree to:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Keep your password secure and confidential</Typography>
            </li>
            <li>
              <Typography variant="body1">Not share your account with others</Typography>
            </li>
            <li>
              <Typography variant="body1">
                Notify us immediately of any security breach
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            4. Email Provider Connections
          </Typography>
          <Typography variant="body1" paragraph>
            When connecting email providers to PMSync:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                You grant us permission to access your email, calendar, and contacts via OAuth or
                IMAP protocols
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                You are responsible for complying with your email provider&apos;s terms of service
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                You can revoke access at any time from your account settings
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                We will not access your data beyond what is necessary to provide the Service
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            5. Acceptable Use Policy
          </Typography>
          <Typography variant="body1" paragraph>
            You agree NOT to use the Service to:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Send spam or unsolicited bulk email</Typography>
            </li>
            <li>
              <Typography variant="body1">
                Violate any applicable laws or regulations
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                Infringe on intellectual property rights of others
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                Distribute malware, viruses, or harmful code
              </Typography>
            </li>
            <li>
              <Typography variant="body1">Harass, abuse, or harm other users</Typography>
            </li>
            <li>
              <Typography variant="body1">
                Attempt to gain unauthorized access to our systems
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                Use automated systems (bots) to access the Service without permission
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            6. AI Features and Data Processing
          </Typography>
          <Typography variant="body1" paragraph>
            By using AI features, you understand that:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                Your email content may be processed by Mistral AI for generating summaries, replies,
                and categorizations
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                AI-generated content is provided &quot;as is&quot; and may contain errors
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                You are responsible for reviewing AI-generated content before sending
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                Vector embeddings are created and stored securely for semantic search
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            7. Data Ownership and Intellectual Property
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
            7.1 Your Data
          </Typography>
          <Typography variant="body1" paragraph>
            You retain all ownership rights to your emails, contacts, and calendar data. We do not
            claim ownership of your content.
          </Typography>

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
            7.2 Our Service
          </Typography>
          <Typography variant="body1" paragraph>
            The Service, including its software, design, and technology, is protected by copyright,
            trademark, and other intellectual property laws.
          </Typography>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            8. Privacy and Data Security
          </Typography>
          <Typography variant="body1" paragraph>
            Your use of the Service is subject to our{' '}
            <Link href="/privacy" sx={{ color: 'primary.main' }}>
              Privacy Policy
            </Link>
            . We implement industry-standard security measures including:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">TLS/SSL encryption for data transmission</Typography>
            </li>
            <li>
              <Typography variant="body1">AES-256 encryption for sensitive data</Typography>
            </li>
            <li>
              <Typography variant="body1">Multi-tenant data isolation</Typography>
            </li>
            <li>
              <Typography variant="body1">Regular security audits</Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            9. Service Availability and Modifications
          </Typography>
          <Typography variant="body1" paragraph>
            We strive to provide reliable service, but:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                The Service is provided &quot;as is&quot; without warranties of any kind
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                We do not guarantee 100% uptime or uninterrupted access
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                We may modify, suspend, or discontinue the Service at any time
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                We will provide reasonable notice of significant changes when possible
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            10. Limitation of Liability
          </Typography>
          <Typography variant="body1" paragraph>
            To the maximum extent permitted by law:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                We are not liable for any indirect, incidental, special, or consequential damages
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                Our total liability shall not exceed the amount you paid us in the last 12 months
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                We are not responsible for data loss due to email provider issues or third-party
                services
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                You are responsible for maintaining backups of your important data
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            11. Indemnification
          </Typography>
          <Typography variant="body1" paragraph>
            You agree to indemnify and hold harmless PMSync from any claims, damages, losses, or
            expenses arising from:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Your violation of these Terms</Typography>
            </li>
            <li>
              <Typography variant="body1">Your use of the Service</Typography>
            </li>
            <li>
              <Typography variant="body1">Your content or data</Typography>
            </li>
            <li>
              <Typography variant="body1">Your violation of any third-party rights</Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            12. Termination
          </Typography>
          <Typography variant="body1" paragraph>
            Either party may terminate this agreement:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">You can delete your account at any time from Settings</Typography>
            </li>
            <li>
              <Typography variant="body1">
                We may suspend or terminate your account if you violate these Terms
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                Upon termination, your data will be deleted according to our retention policy
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                You can export your data before account deletion
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            13. Dispute Resolution
          </Typography>
          <Typography variant="body1" paragraph>
            Any disputes arising from these Terms or the Service shall be resolved through:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                Good faith negotiations between the parties
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                Binding arbitration if negotiations fail
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            14. Governing Law
          </Typography>
          <Typography variant="body1" paragraph>
            These Terms shall be governed by and construed in accordance with the laws of the
            jurisdiction in which PMSync operates, without regard to conflict of law principles.
          </Typography>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            15. Changes to Terms
          </Typography>
          <Typography variant="body1" paragraph>
            We may modify these Terms at any time. We will notify you of material changes by:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Updating the &quot;Last updated&quot; date</Typography>
            </li>
            <li>
              <Typography variant="body1">Sending you an email notification</Typography>
            </li>
            <li>
              <Typography variant="body1">Displaying a banner in the Service</Typography>
            </li>
          </Box>
          <Typography variant="body1" paragraph>
            Continued use of the Service after changes constitutes acceptance of the new Terms.
          </Typography>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            16. Contact Information
          </Typography>
          <Typography variant="body1" paragraph>
            For questions about these Terms, contact us at:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                Email: <Link href="mailto:legal@pmsync.com">legal@pmsync.com</Link>
              </Typography>
            </li>
          </Box>

          <Divider sx={{ my: 4 }} />

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            By using PMSync, you acknowledge that you have read, understood, and agree to be bound
            by these Terms of Service.
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
