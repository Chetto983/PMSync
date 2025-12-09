import Link from 'next/link';
import { Box, Typography, Container, Stack, alpha, useTheme } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';

export function Footer() {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      component="footer"
      sx={{
        py: { xs: 4, md: 6 },
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: isDark ? alpha('#0a0a0f', 0.5) : alpha('#fdfcf9', 0.5),
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems="center"
          justifyContent="center"
        >
          <Typography
            component={Link}
            href="/privacy"
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
            href="/terms"
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
      </Container>
    </Box>
  );
}
