import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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
  keyframes,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
} from '@mui/material';
import { ArrowRight, Menu as MenuIcon, X } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTranslations } from '@/lib/hooks/use-translations';
import { pmSyncColors } from '@/theme/appTheme';
import dynamic from 'next/dynamic';
import { SeoHead } from '@/components/seo/SeoHead';

const Hero = dynamic(() => import('@/components/landing/hero').then((mod) => mod.Hero));
const Features = dynamic(() => import('@/components/landing/features').then((mod) => mod.Features));
const Modules = dynamic(() => import('@/components/landing/modules').then((mod) => mod.Modules));
const Testimonial = dynamic(() => import('@/components/landing/testimonial').then((mod) => mod.Testimonial));
const Cta = dynamic(() => import('@/components/landing/cta').then((mod) => mod.Cta));
const Footer = dynamic(() => import('@/components/landing/footer').then((mod) => mod.Footer));

// Premium background animations
const float = keyframes`
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(2deg); }
`;

const floatReverse = keyframes`
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(20px) rotate(-2deg); }
`;

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

export default function Home() {
  const { isLoading } = useAuth();
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [mobileOpen, setMobileOpen] = useState(false);
  const siteUrl = normalizeSiteUrl(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://mail-agent-indol.vercel.app'
  );
  const seoTitle = 'PMSync | Unified AI Workspace for Email, Calendar & Contacts';
  const seoDescription = t.landing.hero.subtitle;
  const homeStructuredData: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'PMSync',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: seoDescription,
      url: siteUrl,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'PMSync',
      url: siteUrl,
      logo: `${siteUrl}/favicon.svg`,
      email: 'privacy@pmsync.com',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'PMSync',
      url: siteUrl,
    },
  ];

  const handleDrawerToggle = () => {
    setMobileOpen((prev: boolean) => !prev);
  };

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
        <SeoHead
          canonicalPath="/"
          description={seoDescription}
          structuredData={homeStructuredData}
          title={seoTitle}
        />
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
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <SeoHead
        canonicalPath="/"
        description={seoDescription}
        structuredData={homeStructuredData}
        title={seoTitle}
      />

      {/* Universal BackgroundMesh Gradient */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? `radial-gradient(ellipse 100% 100% at 50% -20%, ${alpha('#55cae5', 0.15)} 0%, transparent 50%),
               radial-gradient(ellipse 80% 80% at 80% 50%, ${alpha('#7650ce', 0.1)} 0%, transparent 50%),
               radial-gradient(ellipse 60% 60% at 20% 80%, ${alpha('#b43db6', 0.08)} 0%, transparent 50%)`
            : `radial-gradient(ellipse 100% 100% at 50% -20%, ${alpha('#55cae5', 0.2)} 0%, transparent 50%),
               radial-gradient(ellipse 80% 80% at 80% 50%, ${alpha('#7650ce', 0.12)} 0%, transparent 50%),
               radial-gradient(ellipse 60% 60% at 20% 80%, ${alpha('#b43db6', 0.1)} 0%, transparent 50%)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Floating orbs */}
      <Box
        sx={{
          position: 'absolute',
          top: '5%',
          right: '5%',
          width: { xs: 200, md: 400 },
          height: { xs: 200, md: 400 },
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${alpha('#55cae5', 0.2)} 0%, ${alpha('#7650ce', 0.1)} 100%)`,
          filter: 'blur(80px)',
          animation: `${float} 8s ease-in-out infinite`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '15%',
          left: '-5%',
          width: { xs: 150, md: 300 },
          height: { xs: 150, md: 300 },
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${alpha('#b43db6', 0.15)} 0%, ${alpha('#55cae5', 0.1)} 100%)`,
          filter: 'blur(60px)',
          animation: `${floatReverse} 10s ease-in-out infinite`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Grid pattern overlay */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: isDark
            ? `linear-gradient(${alpha('#fff', 0.02)} 1px, transparent 1px),
               linear-gradient(90deg, ${alpha('#fff', 0.02)} 1px, transparent 1px)`
            : `linear-gradient(${alpha('#000', 0.02)} 1px, transparent 1px),
               linear-gradient(90deg, ${alpha('#000', 0.02)} 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
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
            {/* Mobile Menu - Left */}
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{
                display: { xs: 'flex', md: 'none' },
                color: isDark ? 'white' : 'text.primary',
                mr: 1
              }}
            >
              <MenuIcon size={24} />
            </IconButton>

            {/* Brand Logo */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
              <Image src="/favicon.svg" alt="PMSync" width={54} height={54} />
              <Typography
                variant="h6"
                sx={{
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  background: pmSyncColors.brand.gradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  display: { xs: 'none', sm: 'block' },
                }}
              >
                PMSync
              </Typography>
            </Box>

            {/* Desktop Nav Links */}
            <Box
              sx={{
                flex: 1,
                display: { xs: 'none', lg: 'flex' },
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
                    px: 2,
                    py: 1,
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    color: 'text.secondary',
                    borderRadius: 2,
                    whiteSpace: 'nowrap',
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
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ ml: 'auto' }}
            >
              <ThemeToggle />

              {/* Desktop Auth Buttons */}
              <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
                <Button
                  component={Link}
                  href="/auth/login"
                  variant="text"
                  sx={{
                    px: 2,
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
                    px: 2.5,
                    py: 1,
                    fontWeight: 600,
                    borderRadius: 2.5,
                    color: 'white',
                    background: pmSyncColors.brand.gradient,
                    boxShadow: `0 4px 15px ${alpha(pmSyncColors.brand.cyan, 0.3)}`,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      boxShadow: `0 6px 20px ${alpha(pmSyncColors.brand.cyan, 0.4)}`,
                      transform: 'translateY(-2px)',
                      color: 'white',
                    },
                  }}
                  endIcon={<ArrowRight size={16} />}
                >
                  {t.nav.register}
                </Button>
              </Box>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        anchor="left"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile.
        }}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 280,
            bgcolor: isDark ? 'background.default' : 'background.paper',
            backgroundImage: 'none',
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 4 }}>
            <Image src="/favicon.svg" alt="PMSync" width={48} height={48} />
            <IconButton onClick={handleDrawerToggle}>
              <X size={24} />
            </IconButton>
          </Stack>

          <List sx={{ mb: 4 }}>
            {navLinks.map((link) => (
              <ListItem key={link.href} disablePadding>
                <ListItemButton
                  component="a"
                  href={link.href}
                  onClick={handleDrawerToggle}
                  sx={{ borderRadius: 2, mb: 0.5 }}
                >
                  <ListItemText
                    primary={link.label}
                    primaryTypographyProps={{
                      fontWeight: 600,
                      color: 'text.primary'
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          <Divider sx={{ mb: 4 }} />

          <Stack spacing={2}>
            <Button
              component={Link}
              href="/auth/login"
              variant="outlined"
              fullWidth
              sx={{ py: 1.5, borderRadius: 2.5, fontWeight: 700 }}
              onClick={handleDrawerToggle}
            >
              {t.nav.login}
            </Button>
            <Button
              component={Link}
              href="/auth/register"
              fullWidth
              sx={{
                py: 1.5,
                borderRadius: 2.5,
                fontWeight: 700,
                color: 'white',
                background: pmSyncColors.brand.gradient,
              }}
              onClick={handleDrawerToggle}
            >
              {t.nav.register}
            </Button>
          </Stack>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ position: 'relative', zIndex: 1 }}>
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
