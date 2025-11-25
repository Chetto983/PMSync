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
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { Menu, X, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTranslations } from '@/lib/hooks/use-translations';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            ? 'radial-gradient(ellipse at center, rgba(118, 80, 206, 0.1) 0%, transparent 70%)'
            : 'radial-gradient(ellipse at center, rgba(85, 202, 229, 0.1) 0%, transparent 70%)',
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
            ? alpha('#0a0a0f', 0.8)
            : alpha('#ffffff', 0.85),
          borderBottom: '1px solid',
          borderColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06),
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
            {/* Logo */}
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{
                  transition: 'transform 0.3s ease',
                  '&:hover': { transform: 'scale(1.02)' },
                }}
              >
                <Image
                  src="/Logo PMSync.svg"
                  alt={`${t.app.name} logo`}
                  width={48}
                  height={48}
                  priority
                />
                <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                  <Typography
                    variant="h6"
                    fontWeight={800}
                    sx={{
                      background: 'linear-gradient(135deg, #55cae5 0%, #7650ce 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      lineHeight: 1.2,
                    }}
                  >
                    {t.app.name}
                  </Typography>
                </Box>
              </Stack>
            </Link>

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
                      bgcolor: isDark ? alpha('#fff', 0.05) : alpha('#000', 0.03),
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
                  display: { xs: 'none', sm: 'inline-flex' },
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
                  display: { xs: 'none', sm: 'inline-flex' },
                  px: 3,
                  py: 1,
                  fontWeight: 600,
                  borderRadius: 2.5,
                  background: 'linear-gradient(135deg, #55cae5 0%, #7650ce 100%)',
                  boxShadow: '0 4px 15px rgba(85, 202, 229, 0.3)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    boxShadow: '0 6px 20px rgba(85, 202, 229, 0.4)',
                    transform: 'translateY(-2px)',
                  },
                }}
                endIcon={<ArrowRight size={16} />}
              >
                {t.nav.register}
              </Button>

              {/* Mobile Menu Button */}
              <IconButton
                sx={{ display: { md: 'none' } }}
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu size={24} />
              </IconButton>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Mobile Drawer */}
      <Drawer
        anchor="right"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        PaperProps={{
          sx: {
            width: 280,
            bgcolor: 'background.paper',
            backgroundImage: 'none',
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
            <Image src="/Logo PMSync.svg" alt={t.app.name} width={40} height={40} />
            <IconButton onClick={() => setMobileMenuOpen(false)}>
              <X size={24} />
            </IconButton>
          </Stack>

          <List>
            {navLinks.map((link) => (
              <ListItem key={link.href} disablePadding>
                <ListItemButton
                  component="a"
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  sx={{ borderRadius: 2, mb: 0.5 }}
                >
                  <ListItemText primary={link.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          <Stack spacing={2} sx={{ mt: 3 }}>
            <Button
              component={Link}
              href="/auth/login"
              variant="outlined"
              fullWidth
              sx={{ borderRadius: 2 }}
            >
              {t.nav.login}
            </Button>
            <Button
              component={Link}
              href="/auth/register"
              fullWidth
              sx={{
                borderRadius: 2,
                background: 'linear-gradient(135deg, #55cae5 0%, #7650ce 100%)',
              }}
              endIcon={<ArrowRight size={16} />}
            >
              {t.nav.register}
            </Button>
          </Stack>
        </Box>
      </Drawer>

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
