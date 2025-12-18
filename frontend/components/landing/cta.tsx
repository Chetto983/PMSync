import Link from 'next/link';
import {
  Box,
  Typography,
  Container,
  Stack,
  alpha,
  useTheme,
  keyframes,
} from '@mui/material';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/hooks/use-translations';
import { pmSyncColors } from '@/theme/appTheme';

// CSS Keyframe animations
const float = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-15px); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

export function Cta() {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        py: { xs: 5, md: 6 },
        position: 'relative',
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            position: 'relative',
            p: { xs: 3, md: 5 },
            borderRadius: 4,
            overflow: 'hidden',
            background: isDark
              ? `linear-gradient(135deg, ${alpha(pmSyncColors.brand.purple, 0.7)} 0%, ${alpha(pmSyncColors.brand.magenta, 0.7)} 100%)`
              : `linear-gradient(135deg, ${pmSyncColors.brand.purple} 0%, ${pmSyncColors.brand.magenta} 100%)`,
            boxShadow: `0 20px 80px ${alpha(pmSyncColors.brand.purple, 0.3)}`,
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            '&:hover': {
              transform: { md: 'translateY(-4px)' },
              boxShadow: `0 30px 100px ${alpha(pmSyncColors.brand.purple, 0.4)}`,
            },
          }}
        >
          {/* Animated background mesh */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `radial-gradient(circle at 20% 80%, ${alpha(pmSyncColors.brand.cyan, 0.15)} 0%, transparent 50%),
                               radial-gradient(circle at 80% 20%, ${alpha(pmSyncColors.brand.magenta, 0.15)} 0%, transparent 50%)`,
              pointerEvents: 'none',
            }}
          />

          {/* Animated gradient overlay */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(90deg, transparent, ${alpha(pmSyncColors.brand.cyan, 0.1)}, transparent)`,
              backgroundSize: '200% 100%',
              animation: `${shimmer} 8s ease-in-out infinite`,
              pointerEvents: 'none',
            }}
          />

          {/* Floating particles */}
          {[
            { size: 8, top: '15%', left: '10%', color: pmSyncColors.brand.cyan, delay: 0 },
            { size: 6, top: '70%', left: '15%', color: pmSyncColors.brand.magenta, delay: 0.5 },
            { size: 10, top: '25%', right: '20%', color: pmSyncColors.brand.cyan, delay: 1 },
            { size: 5, top: '60%', right: '10%', color: pmSyncColors.brand.magenta, delay: 1.5 },
            { size: 7, top: '40%', left: '50%', color: pmSyncColors.brand.purple, delay: 2 },
            { size: 4, top: '80%', right: '40%', color: pmSyncColors.brand.cyan, delay: 2.5 },
          ].map((particle, i) => (
            <Box
              key={i}
              sx={{
                position: 'absolute',
                width: particle.size,
                height: particle.size,
                borderRadius: '50%',
                bgcolor: particle.color,
                top: particle.top,
                left: particle.left,
                right: particle.right,
                animation: `${float} ${3 + i * 0.3}s ease-in-out infinite`,
                animationDelay: `${particle.delay}s`,
                opacity: 0.6,
              }}
            />
          ))}

          {/* Pulsing orbs */}
          <Box
            sx={{
              position: 'absolute',
              top: -100,
              right: -100,
              width: 300,
              height: 300,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${alpha(pmSyncColors.brand.cyan, 0.2)} 0%, transparent 70%)`,
              animation: `${pulse} 4s ease-in-out infinite`,
              pointerEvents: 'none',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: -80,
              left: -80,
              width: 250,
              height: 250,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${alpha(pmSyncColors.brand.magenta, 0.2)} 0%, transparent 70%)`,
              animation: `${pulse} 5s ease-in-out infinite`,
              animationDelay: '1s',
              pointerEvents: 'none',
            }}
          />

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 4, md: 6 }}
            alignItems={{ xs: 'center', md: 'center' }}
            justifyContent="space-between"
            sx={{ position: 'relative' }}
          >
            {/* Text content */}
            <Stack
              spacing={2}
              sx={{
                textAlign: { xs: 'center', md: 'left' },
                maxWidth: { md: 550 },
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent={{ xs: 'center', md: 'flex-start' }}
              >
                <Sparkles
                  size={20}
                  color="#55cae5"
                  style={{
                    animation: 'spin 4s linear infinite',
                  }}
                />
                <Typography
                  variant="overline"
                  sx={{
                    color: '#55cae5',
                    fontWeight: 700,
                    letterSpacing: 2,
                  }}
                >
                  {t.landing.ctaSection.badge}
                </Typography>
              </Stack>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 800,
                  color: 'white',
                  fontSize: { xs: '1.75rem', md: '2.25rem' },
                  lineHeight: 1.2,
                }}
              >
                {t.landing.secondaryCta.title}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: alpha('#ffffff', 0.8),
                  fontSize: { xs: '1rem', md: '1.1rem' },
                  lineHeight: 1.7,
                }}
              >
                {t.landing.secondaryCta.subtitle}
              </Typography>
            </Stack>

            {/* CTA buttons */}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ flexShrink: 0 }}
            >
              <Button
                component={Link}
                href="/auth/register"
                size="large"
                sx={{
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  bgcolor: 'white',
                  color: '#452077',
                  position: 'relative',
                  overflow: 'hidden',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: '-100%',
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(85, 202, 229, 0.3), transparent)',
                    transition: 'left 0.5s ease',
                  },
                  '&:hover': {
                    bgcolor: alpha('#ffffff', 0.95),
                    transform: 'translateY(-2px)',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
                    '&::before': {
                      left: '100%',
                    },
                  },
                  transition: 'all 0.3s ease',
                }}
                endIcon={<ArrowRight size={18} />}
              >
                {t.landing.secondaryCta.primaryCta}
              </Button>
              <Button
                component="a"
                href="#features"
                variant="outlined"
                size="large"
                sx={{
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  borderColor: alpha('#ffffff', 0.3),
                  color: isDark ? 'white' : '#7650ce',
                  '&:hover': {
                    borderColor: '#55cae5',
                    bgcolor: alpha('#55cae5', 0.1),
                    transform: 'translateY(-2px)',
                    color: isDark ? '#55cae5' : '#7650ce',
                  },
                  transition: 'all 0.3s ease',
                }}
              >
                {t.landing.secondaryCta.secondaryCta}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Container>

      {/* Global keyframes for spin animation */}
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Box>
  );
}
