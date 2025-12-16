import {
  Box,
  Typography,
  Container,
  Stack,
  alpha,
  useTheme,
  keyframes,
} from '@mui/material';
import { Brain, Plug, CheckCircle, ArrowRight, Workflow } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { pmSyncColors } from '@/theme/appTheme';

const moduleIcons = [Brain, Plug];
const moduleColors = [pmSyncColors.brand.cyan, pmSyncColors.brand.purple];

// Animations
const float = keyframes`
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(1deg); }
`;

const shimmer = keyframes`
  0% { transform: translateX(-100%) rotate(25deg); }
  100% { transform: translateX(100%) rotate(25deg); }
`;

const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.1); opacity: 1; }
`;

export function Modules() {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      id="automation"
      sx={{
        py: { xs: 6, md: 8 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decorations */}
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '120%',
          height: '60%',
          background: isDark
            ? `radial-gradient(ellipse at center, ${alpha(pmSyncColors.brand.purple, 0.08)} 0%, transparent 60%)`
            : `radial-gradient(ellipse at center, ${alpha(pmSyncColors.brand.purple, 0.05)} 0%, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Floating dots pattern (deterministic positions to satisfy purity) */}
      {[
        { top: 18, left: 12 },
        { top: 32, left: 78 },
        { top: 48, left: 22 },
        { top: 62, left: 55 },
        { top: 76, left: 10 },
        { top: 54, left: 88 },
      ].map((pos, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            width: { xs: 4, md: 6 },
            height: { xs: 4, md: 6 },
            borderRadius: '50%',
            bgcolor: i % 2 === 0 ? pmSyncColors.brand.cyan : pmSyncColors.brand.magenta,
            opacity: 0.3,
            top: `${pos.top}%`,
            left: `${pos.left}%`,
            animation: `${float} ${5 + i}s ease-in-out infinite`,
            animationDelay: `${i * 0.5}s`,
            pointerEvents: 'none',
          }}
        />
      ))}

      <Container maxWidth="lg" sx={{ position: 'relative' }}>
        {/* Section header */}
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: { xs: 4, md: 6 } }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 2.5,
              py: 1,
              borderRadius: 100,
              bgcolor: isDark ? alpha(pmSyncColors.brand.cyan, 0.15) : alpha(pmSyncColors.brand.cyan, 0.08),
              border: '1px solid',
              borderColor: isDark ? alpha(pmSyncColors.brand.cyan, 0.3) : alpha(pmSyncColors.brand.cyan, 0.15),
            }}
          >
            <Workflow size={14} color={pmSyncColors.brand.cyan} />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: 1.5,
                color: pmSyncColors.brand.cyan,
              }}
            >
              {t.landing.automationSection.badge}
            </Typography>
          </Box>
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
              fontWeight: 800,
              maxWidth: 650,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            {t.landing.automationSection.title}{' '}
            <Box
              component="span"
              sx={{
                background: pmSyncColors.brand.gradientReverse,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t.landing.automationSection.titleHighlight}
            </Box>
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 550, fontSize: { xs: '1rem', md: '1.15rem' }, lineHeight: 1.7 }}
          >
            {t.landing.automationSection.description}
          </Typography>
        </Stack>

        {/* Module cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: { xs: 3, md: 4 },
          }}
        >
          {t.landing.modules.map((module, index) => {
            const Icon = moduleIcons[index];
            const color = moduleColors[index];
            const isFirst = index === 0;

            return (
              <Box
                key={module.title}
                sx={{
                  p: { xs: 3, md: 5 },
                  borderRadius: 5,
                  border: '1px solid',
                  borderColor: isDark ? alpha(color, 0.25) : alpha(color, 0.15),
                  background: isDark
                    ? `linear-gradient(145deg, ${alpha(color, 0.08)} 0%, ${alpha(theme.palette.common.black, 0.4)} 100%)`
                    : `linear-gradient(145deg, ${alpha(theme.palette.common.white, 0.95)} 0%, ${alpha(color, 0.03)} 100%)`,
                  backdropFilter: 'blur(20px)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    transform: { xs: 'none', md: 'translateY(-8px) scale(1.01)' },
                    boxShadow: `0 30px 80px ${alpha(color, 0.2)}`,
                    borderColor: alpha(color, 0.5),
                    '& .module-icon': {
                      transform: 'scale(1.1) rotate(5deg)',
                    },
                    '& .shimmer': {
                      animation: `${shimmer} 1s ease`,
                    },
                    '& .learn-more': {
                      gap: 2,
                    },
                  },
                }}
              >
                {/* Shimmer effect */}
                <Box
                  className="shimmer"
                  sx={{
                    position: 'absolute',
                    top: '-50%',
                    left: '-50%',
                    width: '50%',
                    height: '200%',
                    background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.common.white, 0.08)}, transparent)`,
                    transform: 'translateX(-100%) rotate(25deg)',
                    pointerEvents: 'none',
                  }}
                />

                {/* Decorative gradient blob */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: isFirst ? -80 : 'auto',
                    bottom: isFirst ? 'auto' : -80,
                    right: isFirst ? -80 : 'auto',
                    left: isFirst ? 'auto' : -80,
                    width: 250,
                    height: 250,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${alpha(color, 0.12)} 0%, transparent 70%)`,
                    animation: `${pulse} ${6 + index * 2}s ease-in-out infinite`,
                    pointerEvents: 'none',
                  }}
                />

                <Stack spacing={3} sx={{ position: 'relative' }}>
                  {/* Eyebrow badge */}
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2.5,
                      py: 1,
                      borderRadius: 100,
                      bgcolor: alpha(color, 0.1),
                      border: '1px solid',
                      borderColor: alpha(color, 0.2),
                      width: 'fit-content',
                    }}
                  >
                    <Box
                      className="module-icon"
                      sx={{ transition: 'all 0.4s ease' }}
                    >
                      <Icon size={18} color={color} />
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        color: color,
                        textTransform: 'uppercase',
                        letterSpacing: 1.5,
                      }}
                    >
                      {module.eyebrow}
                    </Typography>
                  </Box>

                  {/* Title */}
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 700,
                      fontSize: { xs: '1.5rem', md: '1.85rem' },
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {module.title}
                  </Typography>

                  {/* Description */}
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ lineHeight: 1.8, maxWidth: 480 }}
                  >
                    {module.description}
                  </Typography>

                  {/* Items */}
                  <Stack spacing={2.5} sx={{ pt: 2 }}>
                    {module.items.map((item) => (
                      <Stack
                        key={item}
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        sx={{
                          transition: 'transform 0.3s ease',
                          '&:hover': {
                            transform: 'translateX(4px)',
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: alpha(color, 0.12),
                            border: '1px solid',
                            borderColor: alpha(color, 0.2),
                            flexShrink: 0,
                          }}
                        >
                          <CheckCircle size={16} color={color} />
                        </Box>
                        <Typography variant="body2" fontWeight={500}>
                          {item}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>

                  {/* Learn more link */}
                  <Stack
                    className="learn-more"
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      pt: 3,
                      color: color,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      width: 'fit-content',
                    }}
                  >
                    <Typography variant="body2" fontWeight={700}>
                      {t.landing.automationSection.learnMore}
                    </Typography>
                    <ArrowRight size={18} />
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Container>
    </Box>
  );
}
