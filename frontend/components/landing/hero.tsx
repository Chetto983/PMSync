import Link from 'next/link';
import Image from 'next/image';
import {
  Box,
  Typography,
  Container,
  Stack,
  alpha,
  useTheme,
  keyframes,
} from '@mui/material';
import { ArrowRight, Play, Mail, Calendar, Users, Zap, Shield, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/hooks/use-translations';

// Premium animations
const float = keyframes`
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(2deg); }
`;

const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.05); opacity: 0.8; }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(85, 202, 229, 0.3); }
  50% { box-shadow: 0 0 40px rgba(85, 202, 229, 0.6); }
`;

const gradientMove = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

export function Hero() {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const productCards = [
    { icon: Mail, label: t.landing.productCards.email.label, desc: t.landing.productCards.email.desc, color: '#55cae5' },
    { icon: Calendar, label: t.landing.productCards.calendar.label, desc: t.landing.productCards.calendar.desc, color: '#7650ce' },
    { icon: Users, label: t.landing.productCards.contacts.label, desc: t.landing.productCards.contacts.desc, color: '#b43db6' },
  ];

  return (
    <Box
      id="product"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        pt: { xs: 4, md: 6 },
        pb: { xs: 6, md: 8 },
        display: 'flex',
        alignItems: 'center',
      }}
    >



      <Container maxWidth="lg" sx={{ position: 'relative' }}>
        <Stack spacing={3} alignItems="center" textAlign="center">
          {/* Logo + Eyebrow badge */}
          <Stack spacing={2} alignItems="center">
            <Box
              sx={{
                position: 'relative',
                animation: `${pulse} 4s ease-in-out infinite`,
                width: { xs: 'min(160px, 45vw)', sm: 'min(200px, 45vw)', md: 240 },
              }}
            >
              <Image
                src="/Logo PMSync.svg"
                alt="PMSync logo"
                width={240}
                height={240}
                style={{
                  width: '100%',
                  height: 'auto',
                  maxWidth: '100%',
                }}
                priority
              />
            </Box>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1.5,
                px: 3,
                py: 1.25,
                borderRadius: 100,
                background: isDark
                  ? `linear-gradient(135deg, ${alpha('#7650ce', 0.2)} 0%, ${alpha('#b43db6', 0.2)} 100%)`
                  : `linear-gradient(135deg, ${alpha('#7650ce', 0.08)} 0%, ${alpha('#b43db6', 0.08)} 100%)`,
                border: '1px solid',
                borderColor: isDark ? alpha('#b43db6', 0.3) : alpha('#7650ce', 0.15),
                backdropFilter: 'blur(10px)',
                transition: 'all 0.3s ease',
                cursor: 'default',
                '&:hover': {
                  transform: 'scale(1.02)',
                  borderColor: alpha('#b43db6', 0.5),
                },
              }}
            >
              <Sparkles size={16} color="#b43db6" />
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #55cae5 0%, #b43db6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {t.landing.hero.eyebrow}
              </Typography>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: '#10b981',
                  animation: `${pulse} 2s ease-in-out infinite`,
                }}
              />
            </Box>
          </Stack>

          {/* Main headline with gradient */}
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '2rem', sm: '2.75rem', md: '3.25rem', lg: '3.75rem' },
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: 900,
              letterSpacing: '-0.02em',
            }}
          >
            {t.landing.hero.titlePart1}{' '}
            <Box
              component="span"
              sx={{
                background: 'linear-gradient(135deg, #55cae5 0%, #7650ce 50%, #b43db6 100%)',
                backgroundSize: '200% 200%',
                animation: `${gradientMove} 5s ease infinite`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t.landing.hero.titleHighlight}
            </Box>
            <br />
            {t.landing.hero.titlePart2}
          </Typography>

          {/* Subtitle */}
          <Typography
            variant="h6"
            color="text.secondary"
            sx={{
              maxWidth: 600,
              fontWeight: 400,
              lineHeight: 1.6,
              fontSize: { xs: '0.95rem', sm: '1rem', md: '1.1rem' },
            }}
          >
            {t.landing.hero.subtitle}
          </Typography>

          {/* CTA buttons with premium styling */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ pt: 1 }}
          >
            <Button
              component={Link}
              href="/auth/register"
              size="large"
              sx={{
                px: 5,
                py: 2,
                fontSize: '1.05rem',
                fontWeight: 600,
                borderRadius: 3,
                background: 'linear-gradient(135deg, #55cae5 0%, #7650ce 100%)',
                boxShadow: '0 8px 32px rgba(85, 202, 229, 0.35)',
                position: 'relative',
                overflow: 'hidden',
                color: 'white',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(135deg, #36e3ed 0%, #b43db6 100%)',
                  opacity: 0,
                  transition: 'opacity 0.3s ease',
                },
                '&:hover': {
                  transform: 'translateY(-3px)',
                  boxShadow: '0 12px 40px rgba(85, 202, 229, 0.45)',
                  '&::before': { opacity: 1 },
                  color: 'white',
                },
                '& > *': { position: 'relative' },
                transition: 'all 0.3s ease',
              }}
              endIcon={<ArrowRight size={20} />}
            >
              {t.landing.hero.primaryCta}
            </Button>
            <Button
              component="a"
              href="#features"
              variant="outlined"
              size="large"
              sx={{
                px: 5,
                py: 2,
                fontSize: '1.05rem',
                fontWeight: 600,
                borderRadius: 3,
                borderWidth: 2,
                borderColor: isDark ? alpha('#55cae5', 0.4) : alpha('#7650ce', 0.25),
                color: isDark ? '#55cae5' : '#7650ce',
                backdropFilter: 'blur(10px)',
                background: isDark ? alpha('#55cae5', 0.05) : alpha('#7650ce', 0.03),
                '&:hover': {
                  borderColor: '#55cae5',
                  backgroundColor: alpha('#55cae5', 0.1),
                  transform: 'translateY(-3px)',
                },
                transition: 'all 0.3s ease',
              }}
              endIcon={<Play size={20} />}
            >
              {t.landing.hero.secondaryCta}
            </Button>
          </Stack>

          {/* Stats with glassmorphism */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 2, sm: 0 }}
            sx={{
              pt: 2,
              px: { xs: 2, sm: 3 },
              py: 2,
              borderRadius: 3,
              background: isDark
                ? alpha('#ffffff', 0.03)
                : alpha('#ffffff', 0.7),
              backdropFilter: 'blur(20px)',
              border: '1px solid',
              borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.05),
              boxShadow: isDark
                ? '0 8px 32px rgba(0, 0, 0, 0.3)'
                : '0 8px 32px rgba(0, 0, 0, 0.08)',
            }}
            divider={
              <Box
                sx={{
                  display: { xs: 'none', sm: 'block' },
                  width: 2,
                  height: 40,
                  background: 'linear-gradient(180deg, transparent 0%, rgba(85, 202, 229, 0.3) 50%, transparent 100%)',
                  mx: 3,
                  borderRadius: 1,
                }}
              />
            }
          >
            {t.landing.highlights.map((highlight, index) => (
              <Box
                key={highlight.label}
                sx={{
                  textAlign: 'center',
                  px: { xs: 2, sm: 3 },
                  transition: 'transform 0.3s ease',
                  '&:hover': {
                    transform: 'scale(1.05)',
                  },
                }}
              >
                <Typography
                  variant="h3"
                  sx={{
                    fontWeight: 800,
                    fontSize: { xs: '2rem', md: '2.5rem' },
                    background: index === 0
                      ? 'linear-gradient(135deg, #55cae5 0%, #36e3ed 100%)'
                      : index === 1
                        ? 'linear-gradient(135deg, #7650ce 0%, #b43db6 100%)'
                        : 'linear-gradient(135deg, #b43db6 0%, #bc4fc2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {highlight.value}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontWeight: 500, mt: 0.5 }}
                >
                  {highlight.label}
                </Typography>
              </Box>
            ))}
          </Stack>

          {/* Product cards with glassmorphism */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              gap: 2,
              pt: 3,
              width: '100%',
              maxWidth: 800,
            }}
          >
            {productCards.map((item, index) => (
              <Box
                key={item.label}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: isDark ? alpha(item.color, 0.25) : alpha(item.color, 0.15),
                  background: isDark
                    ? `linear-gradient(135deg, ${alpha(item.color, 0.08)} 0%, ${alpha(item.color, 0.02)} 100%)`
                    : `linear-gradient(135deg, ${alpha(item.color, 0.05)} 0%, ${alpha('#fff', 0.8)} 100%)`,
                  backdropFilter: 'blur(20px)',
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  animation: `${float} ${6 + index}s ease-in-out infinite`,
                  animationDelay: `${index * 0.2}s`,
                  '&:hover': {
                    transform: 'translateY(-8px) scale(1.02)',
                    boxShadow: `0 20px 60px ${alpha(item.color, 0.25)}`,
                    borderColor: item.color,
                    animation: 'none',
                  },
                }}
              >
                <Stack spacing={2} alignItems="center" textAlign="center">
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      background: `linear-gradient(135deg, ${alpha(item.color, 0.2)} 0%, ${alpha(item.color, 0.05)} 100%)`,
                      border: '1px solid',
                      borderColor: alpha(item.color, 0.2),
                      transition: 'all 0.3s ease',
                      '.MuiBox-root:hover &': {
                        animation: `${glow} 1.5s ease-in-out infinite`,
                      },
                    }}
                  >
                    <item.icon size={28} color={item.color} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {item.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.desc}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Box>

          {/* Trust indicators */}
          <Stack
            direction="row"
            spacing={3}
            alignItems="center"
            sx={{ pt: 2, opacity: 0.7 }}
          >
            {[
              { icon: Shield, label: t.landing.trustIndicators.soc2 },
              { icon: Zap, label: t.landing.trustIndicators.uptime },
            ].map((item) => (
              <Stack
                key={item.label}
                direction="row"
                spacing={1}
                alignItems="center"
              >
                <item.icon size={16} color={isDark ? '#55cae5' : '#7650ce'} />
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  {item.label}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
