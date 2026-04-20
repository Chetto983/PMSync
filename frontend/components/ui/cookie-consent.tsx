import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Link,
  Collapse,
  Switch,
  FormControlLabel,
  Stack,
} from '@mui/material';
import { X, Cookie, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAiOverlay } from '@/stores/ai-overlay-store';

const COOKIE_CONSENT_KEY = 'pmsync:cookie-consent';

interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

export function CookieConsent() {
  const translations = useTranslations();
  const cookieCopy = translations.cookies;
  const router = useRouter();
  const aiOverlayOpen = useAiOverlay((state) => state.isOpen);
  const aiOverlayWidth = useAiOverlay((state) => state.width);
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true, // Always true, non-modifiable
    analytics: false,
    marketing: false,
  });
  const isTasksWorkspace = router.pathname === '/dashboard/tasks';
  const compactWorkspaceMode = aiOverlayOpen || isTasksWorkspace;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Show banner after a slight delay for better UX
      const timeoutId = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timeoutId);
    }
  }, []);

  const handleAcceptAll = () => {
    const fullConsent: CookiePreferences = {
      necessary: true,
      analytics: true,
      marketing: true,
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(fullConsent));
    setVisible(false);
  };

  const handleAcceptSelected = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(preferences));
    setVisible(false);
  };

  const handleRejectAll = () => {
    const minimalConsent: CookiePreferences = {
      necessary: true,
      analytics: false,
      marketing: false,
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(minimalConsent));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: { xs: 0, sm: compactWorkspaceMode ? 0 : 'auto' },
        right: { xs: 0, sm: compactWorkspaceMode ? 'auto' : aiOverlayOpen ? `${aiOverlayWidth + 16}px` : 0 },
        zIndex: 9999,
        p: { xs: 1, sm: compactWorkspaceMode ? 1.5 : 2 },
        display: 'flex',
        justifyContent: { xs: 'center', sm: compactWorkspaceMode ? 'flex-start' : 'flex-end' },
        pointerEvents: 'none',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          maxWidth: { xs: '100%', sm: compactWorkspaceMode ? 336 : 380 },
          width: '100%',
          p: { xs: 2, sm: compactWorkspaceMode ? 2.25 : 3 },
          pointerEvents: 'auto',
          borderRadius: { xs: 3, sm: compactWorkspaceMode ? 3.5 : 3 },
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1, sm: 2 } }}>
          <Cookie size={24} style={{ flexShrink: 0, marginTop: 4 }} />
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                mb: 0.75,
                fontSize: { xs: '1rem', sm: compactWorkspaceMode ? '1.1rem' : '1.25rem' },
              }}
            >
              {cookieCopy.title}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1.5,
                fontSize: { xs: '0.8125rem', sm: compactWorkspaceMode ? '0.83rem' : '0.875rem' },
                display: '-webkit-box',
                overflow: 'hidden',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: showDetails ? 'unset' : compactWorkspaceMode ? 4 : 6,
              }}
            >
              {cookieCopy.description}{' '}
              <Link href="/privacy" underline="hover" sx={{ color: 'primary.main' }}>
                {cookieCopy.privacyLink}
              </Link>
            </Typography>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: showDetails ? 1.5 : 0,
                cursor: 'pointer',
                minHeight: 44, // Touch target
              }}
              onClick={() => setShowDetails(!showDetails)}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main', fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
                {showDetails ? cookieCopy.hideDetails : cookieCopy.customize}
              </Typography>
              {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Box>

            <Collapse in={showDetails}>
              <Stack spacing={1.5} sx={{ my: 2, pl: { xs: 0, sm: 1 } }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={preferences.necessary}
                      disabled
                      sx={{ '&.Mui-disabled': { opacity: 0.6 } }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
                        {cookieCopy.necessary.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                        {cookieCopy.necessary.description}
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={preferences.analytics}
                      onChange={(e) =>
                        setPreferences({ ...preferences, analytics: e.target.checked })
                      }
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
                        {cookieCopy.analytics.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                        {cookieCopy.analytics.description}
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={preferences.marketing}
                      onChange={(e) =>
                        setPreferences({ ...preferences, marketing: e.target.checked })
                      }
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
                        {cookieCopy.marketing.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                        {cookieCopy.marketing.description}
                      </Typography>
                    </Box>
                  }
                />
              </Stack>
            </Collapse>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
              {showDetails ? (
                <>
                  <Button variant="outlined" onClick={handleRejectAll} size="small" sx={{ minHeight: 36 }}>
                    {cookieCopy.rejectAll}
                  </Button>
                  <Button variant="outlined" onClick={handleAcceptSelected} size="small" sx={{ minHeight: 36 }}>
                    {cookieCopy.savePreferences}
                  </Button>
                  <Button variant="contained" onClick={handleAcceptAll} size="small" sx={{ minHeight: 36 }}>
                    {cookieCopy.acceptAll}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outlined" onClick={handleRejectAll} size="small" sx={{ minHeight: 36 }}>
                    {cookieCopy.rejectAll}
                  </Button>
                  <Button variant="contained" onClick={handleAcceptAll} size="small" sx={{ minHeight: 36 }}>
                    {cookieCopy.acceptAll}
                  </Button>
                </>
              )}
            </Box>
          </Box>
          <IconButton
            size="small"
            onClick={() => setVisible(false)}
            sx={{ flexShrink: 0, minWidth: 44, minHeight: 44 }} // Touch target
            aria-label="Close"
          >
            <X size={18} />
          </IconButton>
        </Box>
      </Paper>
    </Box>
  );
}
