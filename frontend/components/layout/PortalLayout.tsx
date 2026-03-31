'use client';

import React from 'react';
import { Box, AppBar, Toolbar, Typography, Container, Link as MuiLink } from '@mui/material';
import NextLink from 'next/link';
import { BookOpen, Ticket } from 'lucide-react';

interface PortalLayoutProps {
  children: React.ReactNode;
}

export function PortalLayout({ children }: PortalLayoutProps) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* Header */}
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ maxWidth: 1200, width: '100%', mx: 'auto' }}>
          <Typography
            variant="h6"
            fontWeight={700}
            component={NextLink}
            href="/portal"
            sx={{ textDecoration: 'none', color: 'text.primary', mr: 4 }}
          >
            PMSync
          </Typography>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <MuiLink
              component={NextLink}
              href="/portal"
              underline="hover"
              color="text.secondary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              <BookOpen size={16} />
              Knowledge Base
            </MuiLink>
            <MuiLink
              component={NextLink}
              href="/portal/tickets/new"
              underline="hover"
              color="text.secondary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              <Ticket size={16} />
              Submit Ticket
            </MuiLink>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Content */}
      <Container maxWidth="lg" sx={{ flex: 1, py: 3 }}>
        {children}
      </Container>

      {/* Footer */}
      <Box
        component="footer"
        sx={{ borderTop: 1, borderColor: 'divider', py: 2, textAlign: 'center' }}
      >
        <Typography variant="caption" color="text.secondary">
          Powered by PMSync
        </Typography>
      </Box>
    </Box>
  );
}
