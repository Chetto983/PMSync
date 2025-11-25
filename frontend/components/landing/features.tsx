import {
  Box,
  Typography,
  Container,
  Stack,
  alpha,
  useTheme,
  keyframes,
} from '@mui/material';
import { Inbox, Sparkles, BarChart3, CheckCircle, Zap, Bot, Lock } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

const featureIcons = [Inbox, Sparkles, BarChart3];
const featureColors = ['#55cae5', '#7650ce', '#b43db6'];

// Animations
const shimmer = keyframes`
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
`;

export function Features() {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      id="features"
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
          top: '30%',
          left: '-10%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha('#55cae5', 0.08)} 0%, transparent 70%)`,
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '10%',
          right: '-10%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha('#b43db6', 0.08)} 0%, transparent 70%)`,
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative' }}>
        {/* Section header */}
        <Stack spacing={3} alignItems="center" textAlign="center" sx={{ mb: { xs: 8, md: 10 } }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 2.5,
              py: 1,
              borderRadius: 100,
              bgcolor: isDark ? alpha('#7650ce', 0.15) : alpha('#7650ce', 0.08),
              border: '1px solid',
              borderColor: isDark ? alpha('#7650ce', 0.3) : alpha('#7650ce', 0.15),
            }}
          >
            <Zap size={14} color="#7650ce" />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: 1.5,
                color: '#7650ce',
              }}
            >
              {t.landing.featuresSection.badge}
            </Typography>
          </Box>
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
              fontWeight: 800,
              maxWidth: 700,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            {t.landing.featuresSection.title}{' '}
            <Box
              component="span"
              sx={{
                background: 'linear-gradient(135deg, #55cae5 0%, #7650ce 50%, #b43db6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t.landing.featuresSection.titleHighlight}
            </Box>
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              maxWidth: 550,
              fontSize: { xs: '1rem', md: '1.15rem' },
              lineHeight: 1.7,
            }}
          >
            {t.landing.featuresSection.description}
          </Typography>
        </Stack>

        {/* Feature cards grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: { xs: 3, md: 4 },
          }}
        >
          {t.landing.features.map((feature, index) => {
            const Icon = featureIcons[index];
            const color = featureColors[index];

            return (
              <Box
                key={feature.title}
                sx={{
                  position: 'relative',
                  p: { xs: 3, md: 4 },
                  borderRadius: 5,
                  border: '1px solid',
                  borderColor: isDark ? alpha(color, 0.2) : alpha(color, 0.12),
                  background: isDark
                    ? `linear-gradient(145deg, ${alpha(color, 0.06)} 0%, ${alpha('#000', 0.3)} 100%)`
                    : `linear-gradient(145deg, ${alpha('#fff', 0.9)} 0%, ${alpha(color, 0.03)} 100%)`,
                  backdropFilter: 'blur(20px)',
                  overflow: 'hidden',
                  transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    transform: { xs: 'none', md: 'translateY(-12px) scale(1.02)' },
                    boxShadow: `0 30px 80px ${alpha(color, 0.2)}`,
                    borderColor: alpha(color, 0.5),
                    '& .feature-icon': {
                      transform: 'scale(1.15) rotate(5deg)',
                      boxShadow: `0 10px 30px ${alpha(color, 0.4)}`,
                    },
                    '& .shimmer': {
                      animation: `${shimmer} 1.5s ease`,
                    },
                  },
                }}
              >
                {/* Shimmer effect */}
                <Box
                  className="shimmer"
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '50%',
                    height: '100%',
                    background: `linear-gradient(90deg, transparent, ${alpha('#fff', 0.1)}, transparent)`,
                    transform: 'translateX(-100%)',
                    pointerEvents: 'none',
                  }}
                />

                {/* Gradient corner accent */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: -50,
                    right: -50,
                    width: 150,
                    height: 150,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${alpha(color, 0.15)} 0%, transparent 70%)`,
                    pointerEvents: 'none',
                  }}
                />

                <Stack spacing={3} sx={{ position: 'relative' }}>
                  {/* Icon */}
                  <Box
                    className="feature-icon"
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `linear-gradient(135deg, ${alpha(color, 0.2)} 0%, ${alpha(color, 0.05)} 100%)`,
                      border: '1px solid',
                      borderColor: alpha(color, 0.25),
                      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    <Icon size={30} color={color} />
                  </Box>

                  {/* Title */}
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 700,
                      fontSize: { xs: '1.25rem', md: '1.4rem' },
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {feature.title}
                  </Typography>

                  {/* Description */}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ lineHeight: 1.8, fontSize: '0.95rem' }}
                  >
                    {feature.description}
                  </Typography>

                  {/* Bullets */}
                  <Stack spacing={2} sx={{ pt: 1 }}>
                    {feature.bullets.map((bullet) => (
                      <Stack
                        key={bullet}
                        direction="row"
                        spacing={2}
                        alignItems="flex-start"
                      >
                        <Box
                          sx={{
                            mt: 0.5,
                            flexShrink: 0,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: alpha(color, 0.15),
                          }}
                        >
                          <CheckCircle size={14} color={color} />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                          {bullet}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Box>

        {/* Bottom feature highlights */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={3}
          justifyContent="center"
          sx={{ mt: { xs: 6, md: 10 } }}
        >
          {[
            { icon: Bot, label: t.landing.featuresSection.bottomFeatures.aiPowered.label, desc: t.landing.featuresSection.bottomFeatures.aiPowered.desc },
            { icon: Lock, label: t.landing.featuresSection.bottomFeatures.security.label, desc: t.landing.featuresSection.bottomFeatures.security.desc },
            { icon: Zap, label: t.landing.featuresSection.bottomFeatures.fast.label, desc: t.landing.featuresSection.bottomFeatures.fast.desc },
          ].map((item, index) => (
            <Stack
              key={item.label}
              direction="row"
              spacing={2}
              alignItems="center"
              sx={{
                px: 3,
                py: 2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                background: isDark ? alpha('#fff', 0.02) : alpha('#fff', 0.5),
                backdropFilter: 'blur(10px)',
                transition: 'all 0.3s ease',
                animation: `${float} ${4 + index * 0.5}s ease-in-out infinite`,
                animationDelay: `${index * 0.2}s`,
                '&:hover': {
                  borderColor: featureColors[index],
                  transform: 'translateY(-4px)',
                  boxShadow: `0 10px 30px ${alpha(featureColors[index], 0.15)}`,
                  animation: 'none',
                },
              }}
            >
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha(featureColors[index], 0.1),
                }}
              >
                <item.icon size={20} color={featureColors[index]} />
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={600}>
                  {item.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.desc}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      </Container>
    </Box>
  );
}
