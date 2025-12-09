import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AppBar,
  Toolbar,
  Container,
  Box,
  Typography,
  Button,
  alpha,
  useTheme,
  Stack,
} from '@mui/material';
import { ArrowRight } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTranslations } from '@/lib/hooks/use-translations';
import { pmSyncColors } from '@/theme/appTheme';
import dynamic from 'next/dynamic';

const Hero = dynamic(() => import('@/components/landing/hero').then((mod) => mod.Hero));
const Features = dynamic(() => import('@/components/landing/features').then((mod) => mod.Features));
const Modules = dynamic(() => import('@/components/landing/modules').then((mod) => mod.Modules));
const Testimonial = dynamic(() => import('@/components/landing/testimonial').then((mod) => mod.Testimonial));
const Cta = dynamic(() => import('@/components/landing/cta').then((mod) => mod.Cta));
const Footer = dynamic(() => import('@/components/landing/footer').then((mod) => mod.Footer));

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isDark
            ? `radial-gradient(ellipse at center, ${alpha(pmSyncColors.brand.purple, 0.1)} 0%, transparent 70%)`
            : `radial-gradient(ellipse at center, ${alpha(pmSyncColors.brand.cyan, 0.1)} 0%, transparent 70%)`,
        }}
      >
        <Stack spacing={2} alignItems="center">
          <Image src="/Logo PMSync.svg" alt="PMSync" width={60} height={60} priority />
          <Typography variant="body1" color="text.secondary">
            {t.common.loading}
          </Typography>
        </Stack>
      </Box>
    );
  }

  const navLinks = [
    { label: t.nav.product, href: '#product' },
    { label: t.nav.features, href: '#features' },
    { label: t.nav.automation, href: '#automation' },
    { label: t.nav.resources, href: '#resources' },
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      {/* Premium Navbar */}
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          backdropFilter: 'blur(20px)',
          background: isDark
            ? alpha(theme.palette.background.default, 0.8)
            : alpha(theme.palette.background.paper, 0.85),
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="lg">
          <Toolbar
            sx={{
              py: 1.5,
              gap: 2,
              minHeight: { xs: 70, md: 80 },
            }}
            disableGutters
          >
            {/* Desktop Nav Links */}
            <Box
              sx={{
                flex: 1,
                display: { xs: 'none', md: 'flex' },
                gap: 1,
                justifyContent: 'center',
              }}
            >
              {navLinks.map((link) => (
                <Button
                  key={link.href}
                  component="a"
                  href={link.href}
                  variant="text"
                  sx={{
                    px: 2.5,
                    py: 1,
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    color: 'text.secondary',
                    borderRadius: 2,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      color: 'text.primary',
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {link.label}
                </Button>
              ))}
            </Box>

            {/* Right Actions */}
            <Stack direction="row" spacing={1} alignItems="center">
              <ThemeToggle />

              <Button
                component={Link}
                href="/auth/login"
                variant="text"
                sx={{
                  px: 2.5,
                  fontWeight: 600,
                  color: 'text.secondary',
                  '&:hover': { color: 'text.primary' },
                }}
              >
                {t.nav.login}
              </Button>

              <Button
                component={Link}
                href="/auth/register"
                sx={{
                  px: 3,
                  py: 1,
                  fontWeight: 600,
                  borderRadius: 2.5,
                  background: pmSyncColors.brand.gradient,
                  boxShadow: `0 4px 15px ${alpha(pmSyncColors.brand.cyan, 0.3)}`,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    boxShadow: `0 6px 20px ${alpha(pmSyncColors.brand.cyan, 0.4)}`,
                    transform: 'translateY(-2px)',
                  },
                }}
                endIcon={<ArrowRight size={16} />}
              >
                {t.nav.register}
              </Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Main Content */}
      <Box component="main">
        <Hero />
        <Features />
        <Modules />
        <Testimonial />
        <Cta />
      </Box>

      {/* Footer */}
      <Footer />
    </Box>
  );
}

// Force SSR to avoid NextRouter SSR errors
export const getServerSideProps = async () => {
  return { props: {} };
};
