import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Quote, ShieldCheck } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { pmSyncColors } from '@/theme/appTheme';

export function Testimonial() {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      id="testimonials"
      sx={{
        py: { xs: 6, md: 8 },
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={3} alignItems="center" textAlign="center">
          <Stack spacing={1.5} alignItems="center">
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                px: 2.25,
                py: 0.9,
                borderRadius: 100,
                border: '1px solid',
                borderColor: isDark ? alpha(pmSyncColors.brand.cyan, 0.35) : alpha(pmSyncColors.brand.purple, 0.2),
                bgcolor: isDark ? alpha(pmSyncColors.brand.cyan, 0.1) : alpha(pmSyncColors.brand.purple, 0.08),
              }}
            >
              <ShieldCheck size={14} color={pmSyncColors.brand.cyan} />
              <Typography variant="overline" sx={{ letterSpacing: 1.2, fontWeight: 700 }}>
                {t.landing.testimonialSection.badge}
              </Typography>
            </Stack>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
              {t.landing.testimonialSection.trustedCertified}
            </Typography>
          </Stack>

          <Box
            sx={{
              width: '100%',
              p: { xs: 3, md: 4 },
              borderRadius: 4,
              border: '1px solid',
              borderColor: isDark ? alpha('#55cae5', 0.25) : alpha('#7650ce', 0.18),
              background: isDark
                ? `linear-gradient(145deg, ${alpha('#55cae5', 0.08)} 0%, ${alpha(theme.palette.common.black, 0.35)} 100%)`
                : `linear-gradient(145deg, ${alpha(theme.palette.common.white, 0.95)} 0%, ${alpha('#7650ce', 0.04)} 100%)`,
              boxShadow: isDark
                ? `0 20px 60px ${alpha('#000', 0.25)}`
                : `0 20px 60px ${alpha('#7650ce', 0.12)}`,
            }}
          >
            <Stack spacing={2.5} alignItems="center">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isDark ? alpha('#55cae5', 0.16) : alpha('#7650ce', 0.12),
                  border: '1px solid',
                  borderColor: isDark ? alpha('#55cae5', 0.28) : alpha('#7650ce', 0.2),
                }}
              >
                <Quote size={22} color={isDark ? '#55cae5' : '#7650ce'} />
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 500,
                  lineHeight: 1.65,
                  maxWidth: 760,
                  fontSize: { xs: '1.05rem', md: '1.2rem' },
                }}
              >
                "{t.landing.testimonial.quote}"
              </Typography>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t.landing.testimonial.author}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t.landing.testimonial.role}
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
