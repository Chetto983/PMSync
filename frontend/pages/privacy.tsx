import React from 'react';
import { Box, Container, Typography, Paper, Divider, Link } from '@mui/material';
import { useRouter } from 'next/router';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 4 }}>
      <Container maxWidth="md">
        <Link
          href="/"
          onClick={(e) => {
            e.preventDefault();
            router.back();
          }}
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
            Privacy Policy
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Last updated: {new Date().toLocaleDateString()}
          </Typography>

          <Divider sx={{ mb: 4 }} />

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            1. Introduction
          </Typography>
          <Typography variant="body1" paragraph>
            PMSync (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This Privacy
            Policy explains how we collect, use, disclose, and safeguard your information when you
            use our email management service.
          </Typography>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            2. Information We Collect
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
            2.1 Personal Information
          </Typography>
          <Typography variant="body1" paragraph>
            We collect personal information that you provide to us, including:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Name and email address</Typography>
            </li>
            <li>
              <Typography variant="body1">Account credentials</Typography>
            </li>
            <li>
              <Typography variant="body1">Email provider connection details (OAuth tokens)</Typography>
            </li>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
            2.2 Email Data
          </Typography>
          <Typography variant="body1" paragraph>
            When you connect your email accounts, we access and process:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Email metadata (sender, recipient, subject, date)</Typography>
            </li>
            <li>
              <Typography variant="body1">Email content for AI processing features</Typography>
            </li>
            <li>
              <Typography variant="body1">Attachments (on-demand, not permanently stored)</Typography>
            </li>
            <li>
              <Typography variant="body1">Calendar events and contact information</Typography>
            </li>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
            2.3 Usage Data
          </Typography>
          <Typography variant="body1" paragraph>
            We automatically collect information about how you use our service:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Log data (IP address, browser type, access times)</Typography>
            </li>
            <li>
              <Typography variant="body1">Device information</Typography>
            </li>
            <li>
              <Typography variant="body1">Feature usage patterns</Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            3. How We Use Your Information
          </Typography>
          <Typography variant="body1" paragraph>
            We use the collected information to:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Provide and maintain our email management service</Typography>
            </li>
            <li>
              <Typography variant="body1">Sync your emails, calendar, and contacts</Typography>
            </li>
            <li>
              <Typography variant="body1">
                Provide AI-powered features (summarization, smart replies, categorization)
              </Typography>
            </li>
            <li>
              <Typography variant="body1">Improve and optimize our service</Typography>
            </li>
            <li>
              <Typography variant="body1">Send you service notifications and updates</Typography>
            </li>
            <li>
              <Typography variant="body1">Ensure security and prevent fraud</Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            4. AI Processing and Data Security
          </Typography>
          <Typography variant="body1" paragraph>
            For AI features, we process your email content using:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                <strong>Mistral AI</strong> for natural language processing
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                <strong>Vector embeddings</strong> stored securely in our PostgreSQL database
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                Processing is done with <strong>tenant isolation</strong> - your data is never mixed
                with other users
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            5. Data Storage and Retention
          </Typography>
          <Typography variant="body1" paragraph>
            We store your data securely:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                Email metadata and content are stored in our encrypted PostgreSQL database
              </Typography>
            </li>
            <li>
              <Typography variant="body1">Attachments are fetched on-demand and not permanently stored</Typography>
            </li>
            <li>
              <Typography variant="body1">
                OAuth tokens are encrypted using AES-256 encryption
              </Typography>
            </li>
            <li>
              <Typography variant="body1">We retain data as long as your account is active</Typography>
            </li>
            <li>
              <Typography variant="body1">
                You can delete your data at any time from Settings
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            6. Data Sharing and Disclosure
          </Typography>
          <Typography variant="body1" paragraph>
            We do not sell your personal information. We may share your information only:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">With your consent</Typography>
            </li>
            <li>
              <Typography variant="body1">To comply with legal obligations</Typography>
            </li>
            <li>
              <Typography variant="body1">
                To protect our rights and prevent fraudulent activity
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                With service providers who assist in operating our service (under strict
                confidentiality agreements)
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            7. Your Rights and Choices
          </Typography>
          <Typography variant="body1" paragraph>
            You have the right to:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Access your personal information</Typography>
            </li>
            <li>
              <Typography variant="body1">Correct inaccurate information</Typography>
            </li>
            <li>
              <Typography variant="body1">Request deletion of your data</Typography>
            </li>
            <li>
              <Typography variant="body1">Export your data</Typography>
            </li>
            <li>
              <Typography variant="body1">Disconnect email providers at any time</Typography>
            </li>
            <li>
              <Typography variant="body1">Opt out of AI processing features</Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            8. Cookies and Tracking
          </Typography>
          <Typography variant="body1" paragraph>
            We use cookies and similar technologies to:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">Maintain your session</Typography>
            </li>
            <li>
              <Typography variant="body1">Remember your preferences</Typography>
            </li>
            <li>
              <Typography variant="body1">
                Analyze usage patterns (with your consent)
              </Typography>
            </li>
          </Box>
          <Typography variant="body1" paragraph>
            You can control cookie preferences through our cookie consent banner.
          </Typography>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            9. Security
          </Typography>
          <Typography variant="body1" paragraph>
            We implement industry-standard security measures:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">TLS/SSL encryption for data in transit</Typography>
            </li>
            <li>
              <Typography variant="body1">AES-256 encryption for sensitive data at rest</Typography>
            </li>
            <li>
              <Typography variant="body1">Regular security audits and penetration testing</Typography>
            </li>
            <li>
              <Typography variant="body1">Multi-factor authentication (MFA)</Typography>
            </li>
            <li>
              <Typography variant="body1">Tenant isolation at database level</Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            10. Third-Party Services
          </Typography>
          <Typography variant="body1" paragraph>
            We integrate with:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                <strong>Google (Gmail)</strong>: Subject to{' '}
                <Link href="https://policies.google.com/privacy" target="_blank" rel="noopener">
                  Google&apos;s Privacy Policy
                </Link>
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                <strong>Microsoft (Outlook)</strong>: Subject to{' '}
                <Link
                  href="https://privacy.microsoft.com/privacystatement"
                  target="_blank"
                  rel="noopener"
                >
                  Microsoft&apos;s Privacy Statement
                </Link>
              </Typography>
            </li>
            <li>
              <Typography variant="body1">
                <strong>Mistral AI</strong>: For AI processing features
              </Typography>
            </li>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            11. International Data Transfers
          </Typography>
          <Typography variant="body1" paragraph>
            Your data may be transferred to and processed in countries other than your country of
            residence. We ensure appropriate safeguards are in place to protect your information in
            accordance with this Privacy Policy.
          </Typography>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            12. Children&apos;s Privacy
          </Typography>
          <Typography variant="body1" paragraph>
            Our service is not intended for users under 18 years of age. We do not knowingly collect
            personal information from children.
          </Typography>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            13. Changes to This Policy
          </Typography>
          <Typography variant="body1" paragraph>
            We may update this Privacy Policy from time to time. We will notify you of any changes by
            posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
          </Typography>

          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, mt: 4 }}>
            14. Contact Us
          </Typography>
          <Typography variant="body1" paragraph>
            If you have questions about this Privacy Policy, please contact us at:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography variant="body1">
                Email: <Link href="mailto:privacy@pmsync.com">privacy@pmsync.com</Link>
              </Typography>
            </li>
          </Box>

          <Divider sx={{ my: 4 }} />

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            By using PMSync, you agree to the collection and use of information in accordance with
            this Privacy Policy.
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
