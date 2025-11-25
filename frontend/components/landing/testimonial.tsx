import {
  Box,
  Typography,
  Container,
  Stack,
  Avatar,
  alpha,
  useTheme,
  keyframes,
} from '@mui/material';
import { Quote, Shield, Lock, CheckCircle2, Star, MessageCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

// Animations
const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
`;

const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.8; }
`;

const twinkle = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(0.9); }
`;

export function Testimonial() {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const trustBadges = [
    { icon: Shield, label: 'SOC 2', color: '#55cae5' },
    { icon: Lock, label: 'GDPR', color: '#7650ce' },
    { icon: CheckCircle2, label: 'ISO 27001', color: '#b43db6' },
  ];

  return (
    <Box
      id="resources"
      sx={{
        py: { xs: 10, md: 16 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decorations */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          height: '100%',
          background: isDark
            ? `radial-gradient(ellipse at 30% 50%, ${alpha('#55cae5', 0.06)} 0%, transparent 50%),
               radial-gradient(ellipse at 70% 50%, ${alpha('#b43db6', 0.06)} 0%, transparent 50%)`
            : `radial-gradient(ellipse at 30% 50%, ${alpha('#55cae5', 0.08)} 0%, transparent 50%),
               radial-gradient(ellipse at 70% 50%, ${alpha('#b43db6', 0.06)} 0%, transparent 50%)`,
          pointerEvents: 'none',
        }}
      />

      <Container maxWidth="md" sx={{ position: 'relative' }}>
        <Stack spacing={8} alignItems="center">
          {/* Section header */}
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                px: 2.5,
                py: 1,
                borderRadius: 100,
                bgcolor: isDark ? alpha('#b43db6', 0.15) : alpha('#b43db6', 0.08),
                border: '1px solid',
                borderColor: isDark ? alpha('#b43db6', 0.3) : alpha('#b43db6', 0.15),
              }}
            >
              <MessageCircle size={14} color="#b43db6" />
              <Typography
                variant="overline"
                sx={{
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  color: '#b43db6',
                }}
              >
                Testimonials
              </Typography>
            </Box>
          </Stack>

          {/* Quote card */}
          <Box
            sx={{
              width: '100%',
              p: { xs: 4, sm: 5, md: 7 },
              borderRadius: 6,
              position: 'relative',
              background: isDark
                ? `linear-gradient(145deg, ${alpha('#7650ce', 0.1)} 0%, ${alpha('#55cae5', 0.05)} 100%)`
                : `linear-gradient(145deg, ${alpha('#7650ce', 0.06)} 0%, ${alpha('#55cae5', 0.02)} 100%)`,
              border: '1px solid',
              borderColor: isDark ? alpha('#7650ce', 0.25) : alpha('#7650ce', 0.12),
              backdropFilter: 'blur(20px)',
              overflow: 'hidden',
              transition: 'all 0.4s ease',
              '&:hover': {
                transform: { md: 'translateY(-4px)' },
                boxShadow: `0 30px 80px ${alpha('#7650ce', 0.15)}`,
              },
            }}
          >
            {/* Quote icon */}
            <Box
              sx={{
                position: 'absolute',
                top: { xs: 15, md: 25 },
                left: { xs: 15, md: 35 },
                opacity: 0.08,
              }}
            >
              <Quote size={100} color="#7650ce" />
            </Box>

            {/* Decorative gradients */}
            <Box
              sx={{
                position: 'absolute',
                top: -120,
                right: -120,
                width: 350,
                height: 350,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${alpha('#b43db6', 0.1)} 0%, transparent 70%)`,
                animation: `${pulse} 6s ease-in-out infinite`,
                pointerEvents: 'none',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: -100,
                left: -100,
                width: 300,
                height: 300,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${alpha('#55cae5', 0.08)} 0%, transparent 70%)`,
                animation: `${pulse} 8s ease-in-out infinite`,
                animationDelay: '2s',
                pointerEvents: 'none',
              }}
            />

            <Stack spacing={5} alignItems="center" sx={{ position: 'relative' }}>
              {/* Stars */}
              <Stack direction="row" spacing={1}>
                {[...Array(5)].map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      animation: `${twinkle} 2s ease-in-out infinite`,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  >
                    <Star
                      size={24}
                      fill="#f59e0b"
                      color="#f59e0b"
                    />
                  </Box>
                ))}
              </Stack>

              {/* Quote text */}
              <Typography
                variant="h5"
                sx={{
                  fontStyle: 'italic',
                  fontWeight: 500,
                  textAlign: 'center',
                  lineHeight: 1.9,
                  maxWidth: 650,
                  fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.4rem' },
                  color: 'text.primary',
                }}
              >
                &ldquo;{t.landing.testimonial.quote}&rdquo;
              </Typography>

              {/* Author info */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2.5}
                alignItems="center"
                sx={{ pt: 2 }}
              >
                <Avatar
                  sx={{
                    width: 64,
                    height: 64,
                    background: 'linear-gradient(135deg, #55cae5 0%, #7650ce 50%, #b43db6 100%)',
                    fontSize: '1.35rem',
                    fontWeight: 700,
                    border: '3px solid',
                    borderColor: isDark ? alpha('#fff', 0.1) : alpha('#fff', 0.8),
                    boxShadow: '0 8px 30px rgba(118, 80, 206, 0.3)',
                  }}
                >
                  {t.landing.testimonial.author.split(' ').map(n => n[0]).join('')}
                </Avatar>
                <Stack alignItems={{ xs: 'center', sm: 'flex-start' }} spacing={0.5}>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      background: 'linear-gradient(135deg, #55cae5 0%, #7650ce 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {t.landing.testimonial.author}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {t.landing.testimonial.role}
                  </Typography>
                </Stack>
              </Stack>
            </Stack>
          </Box>

          {/* Trust badges */}
          <Stack spacing={4} alignItems="center">
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                textTransform: 'uppercase',
                letterSpacing: 3,
                fontWeight: 600,
              }}
            >
              Trusted & Certified
            </Typography>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={{ xs: 2, sm: 3 }}
              alignItems="center"
            >
              {trustBadges.map((badge, index) => (
                <Stack
                  key={badge.label}
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{
                    px: 4,
                    py: 2,
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: isDark ? alpha(badge.color, 0.25) : alpha(badge.color, 0.15),
                    background: isDark
                      ? alpha(badge.color, 0.05)
                      : alpha(badge.color, 0.03),
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    animation: `${float} ${4 + index * 0.5}s ease-in-out infinite`,
                    animationDelay: `${index * 0.3}s`,
                    cursor: 'pointer',
                    '&:hover': {
                      borderColor: badge.color,
                      transform: 'translateY(-4px) scale(1.02)',
                      boxShadow: `0 15px 40px ${alpha(badge.color, 0.2)}`,
                      animation: 'none',
                    },
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      bgcolor: alpha(badge.color, 0.1),
                    }}
                  >
                    <badge.icon size={22} color={badge.color} />
                  </Box>
                  <Typography
                    variant="body1"
                    sx={{
                      fontWeight: 700,
                      color: badge.color,
                    }}
                  >
                    {badge.label}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
