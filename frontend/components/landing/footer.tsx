import Image from 'next/image';
import Link from 'next/link';
import {
  Box,
  Typography,
  Container,
  Stack,
  IconButton,
  alpha,
  useTheme,
} from '@mui/material';
import { Github, Twitter, Linkedin, Mail } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export function Footer() {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    [t.landing.footer.product.title]: [
      { label: t.landing.footer.product.features, href: '#features' },
      { label: t.landing.footer.product.pricing, href: '#pricing' },
      { label: t.landing.footer.product.integrations, href: '#automation' },
      { label: t.landing.footer.product.changelog, href: '#' },
    ],
    [t.landing.footer.company.title]: [
      { label: t.landing.footer.company.about, href: '#' },
      { label: t.landing.footer.company.blog, href: '#' },
      { label: t.landing.footer.company.careers, href: '#' },
      { label: t.landing.footer.company.contact, href: '#' },
    ],
    [t.landing.footer.resources.title]: [
      { label: t.landing.footer.resources.documentation, href: '#' },
      { label: t.landing.footer.resources.apiReference, href: '#' },
      { label: t.landing.footer.resources.support, href: '#' },
      { label: t.landing.footer.resources.status, href: '#' },
    ],
    [t.landing.footer.legal.title]: [
      { label: t.landing.footer.legal.privacy, href: '#' },
      { label: t.landing.footer.legal.terms, href: '#' },
      { label: t.landing.footer.legal.security, href: '#' },
      { label: t.landing.footer.legal.gdpr, href: '#' },
    ],
  };

  const socialLinks = [
    { icon: Twitter, href: '#', label: 'Twitter' },
    { icon: Github, href: '#', label: 'GitHub' },
    { icon: Linkedin, href: '#', label: 'LinkedIn' },
    { icon: Mail, href: 'mailto:hello@pmsync.io', label: 'Email' },
  ];

  return (
    <Box
      component="footer"
      sx={{
        py: { xs: 6, md: 8 },
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: isDark ? alpha('#0a0a0f', 0.5) : alpha('#fdfcf9', 0.5),
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: '2fr repeat(4, 1fr)' },
            gap: { xs: 4, md: 6 },
          }}
        >
          {/* Brand column */}
          <Stack spacing={3}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Image
                src="/Logo PMSync.svg"
                alt={`${t.app.name} logo`}
                width={48}
                height={48}
              />
              <Typography variant="h6" fontWeight={700}>
                {t.app.name}
              </Typography>
            </Stack>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ maxWidth: 280 }}
            >
              {t.app.tagline}
            </Typography>
            <Stack direction="row" spacing={1}>
              {socialLinks.map((social) => (
                <IconButton
                  key={social.label}
                  component="a"
                  href={social.href}
                  aria-label={social.label}
                  size="small"
                  sx={{
                    color: 'text.secondary',
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover': {
                      color: '#55cae5',
                      borderColor: '#55cae5',
                      bgcolor: alpha('#55cae5', 0.1),
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  <social.icon size={18} />
                </IconButton>
              ))}
            </Stack>
          </Stack>

          {/* Links columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <Stack key={category} spacing={2}>
              <Typography
                variant="overline"
                sx={{
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  color: 'text.primary',
                }}
              >
                {category}
              </Typography>
              <Stack spacing={1.5}>
                {links.map((link) => (
                  <Typography
                    key={link.label}
                    component={Link}
                    href={link.href}
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      textDecoration: 'none',
                      transition: 'color 0.2s ease',
                      '&:hover': {
                        color: '#55cae5',
                      },
                    }}
                  >
                    {link.label}
                  </Typography>
                ))}
              </Stack>
            </Stack>
          ))}
        </Box>

        {/* Bottom bar */}
        <Box
          sx={{
            mt: { xs: 6, md: 8 },
            pt: 4,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems="center"
            spacing={2}
          >
            <Typography variant="body2" color="text.secondary">
              © {currentYear} {t.app.name}. {t.landing.footer.copyright}
            </Typography>
            <Stack direction="row" spacing={3}>
              <Typography
                component={Link}
                href="#"
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  '&:hover': { color: '#55cae5' },
                }}
              >
                {t.landing.footer.privacyPolicy}
              </Typography>
              <Typography
                component={Link}
                href="#"
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  '&:hover': { color: '#55cae5' },
                }}
              >
                {t.landing.footer.termsOfService}
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
