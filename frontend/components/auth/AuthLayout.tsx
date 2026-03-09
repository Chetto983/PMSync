import React from 'react';
import Image from 'next/image';
import NextLink from 'next/link';
import { Box, Card, CardContent, Container, Link, Typography } from '@mui/material';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footerLink?: { href: string; label: string };
}

/**
 * Shared auth page layout — centered card with logo, title, subtitle, form, and footer link.
 */
export function AuthLayout({ title, subtitle, children, footerLink }: AuthLayoutProps) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        px: 2,
      }}
    >
      <Container maxWidth="xs" disableGutters>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <Image
            src="/Logo PMSync.svg"
            alt="PMSync"
            width={120}
            height={120}
            priority
          />
        </Box>

        <Card
          elevation={0}
          sx={{
            borderRadius: 3,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h5" fontWeight={700} textAlign="center" gutterBottom>
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
                sx={{ mb: 3 }}
              >
                {subtitle}
              </Typography>
            )}

            {children}
          </CardContent>
        </Card>

        {footerLink && (
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 2 }}>
            <Link component={NextLink} href={footerLink.href} underline="hover">
              {footerLink.label}
            </Link>
          </Typography>
        )}
      </Container>
    </Box>
  );
}
