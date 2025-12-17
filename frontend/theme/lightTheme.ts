/**
 * PMSync Light Theme Configuration
 */

import { ThemeOptions, alpha } from '@mui/material/styles';
import {
  brand,
  fontSize,
  fontWeight,
  borderRadius,
  shadows,
  transitions,
  glass,
  lightColors,
  zIndex,
} from './tokens';
import { typography, shape } from './typography';

// =============================================================================
// LIGHT THEME
// =============================================================================

export const createPmSyncLightTheme = (): ThemeOptions => ({
  palette: {
    mode: 'light',
    primary: {
      main: lightColors.primary.main,
      light: lightColors.primary.light,
      dark: lightColors.primary.dark,
      contrastText: lightColors.primary.contrastText,
    },
    secondary: {
      main: lightColors.secondary.main,
      light: lightColors.secondary.light,
      dark: lightColors.secondary.dark,
      contrastText: lightColors.secondary.contrastText,
    },
    success: {
      main: lightColors.success.main,
      light: lightColors.success.light,
      dark: lightColors.success.dark,
      contrastText: lightColors.success.contrastText,
    },
    warning: {
      main: lightColors.warning.main,
      light: lightColors.warning.light,
      dark: lightColors.warning.dark,
      contrastText: lightColors.warning.contrastText,
    },
    error: {
      main: lightColors.error.main,
      light: lightColors.error.light,
      dark: lightColors.error.dark,
      contrastText: lightColors.error.contrastText,
    },
    info: {
      main: lightColors.info.main,
      light: lightColors.info.light,
      dark: lightColors.info.dark,
      contrastText: lightColors.info.contrastText,
    },
    background: {
      default: lightColors.background.default,
      paper: lightColors.background.paper,
    },
    text: {
      primary: lightColors.text.primary,
      secondary: lightColors.text.secondary,
      disabled: lightColors.text.disabled,
    },
    divider: lightColors.border.default,
    action: lightColors.action,
  },
  typography,
  shape,
  spacing: 8,
  zIndex,
  components: {
    // BUTTONS
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: borderRadius.md,
          padding: '10px 20px',
          fontWeight: fontWeight.semibold,
          fontSize: fontSize.base,
          textTransform: 'none',
          transition: `all ${transitions.duration.DEFAULT}ms ${transitions.easing.DEFAULT}`,
          '&:hover': { transform: 'translateY(-1px)' },
          '&:active': { transform: 'translateY(0)' },
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: shadows.light.md },
        },
        containedPrimary: {
          background: brand.gradient,
          '&:hover': {
            background: `linear-gradient(135deg, ${brand.cyanBright} 0%, ${brand.purple} 100%)`,
            boxShadow: shadows.light.glow,
          },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': { borderWidth: '1.5px', backgroundColor: lightColors.primary.hover },
        },
        outlinedPrimary: {
          borderColor: alpha(lightColors.primary.main, 0.5),
          '&:hover': { borderColor: lightColors.primary.main },
        },
        sizeSmall: { padding: '6px 14px', fontSize: fontSize.sm, borderRadius: borderRadius.DEFAULT },
        sizeLarge: { padding: '14px 28px', fontSize: fontSize.md, borderRadius: borderRadius.lg },
      },
    },

    // PAPER & CARDS
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none', borderRadius: borderRadius.lg },
        elevation1: { boxShadow: shadows.light.sm },
        elevation2: { boxShadow: shadows.light.DEFAULT },
        elevation3: { boxShadow: shadows.light.md },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: borderRadius.xl,
          border: '1px solid',
          borderColor: lightColors.border.default,
          backgroundColor: lightColors.background.paper,
          boxShadow: shadows.light.sm,
          '&:hover': { borderColor: lightColors.border.strong, boxShadow: shadows.light.md },
        },
      },
    },

    // TEXT FIELDS & INPUTS
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: borderRadius.md,
            backgroundColor: lightColors.background.subtle,
            '& fieldset': { borderColor: lightColors.border.default },
            '&:hover fieldset': { borderColor: lightColors.border.strong },
            '&.Mui-focused fieldset': { borderColor: lightColors.primary.main, borderWidth: '2px' },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${lightColors.primary.focus}` },
          },
        },
      },
    },

    // DRAWER & SIDEBAR
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: lightColors.background.paper,
          borderRight: `1px solid ${lightColors.border.default}`,
        },
      },
    },

    // APP BAR & HEADER
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: alpha(lightColors.background.paper, 0.8),
          backgroundImage: 'none',
          borderBottom: `1px solid ${lightColors.border.default}`,
          backdropFilter: glass.blur.DEFAULT,
          WebkitBackdropFilter: glass.blur.DEFAULT,
          color: lightColors.text.primary,
        },
      },
    },

    // LISTS & NAVIGATION
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.md,
          margin: '2px 4px',
          padding: '10px 12px',
          '&:hover': { backgroundColor: lightColors.background.hover },
          '&.Mui-selected': {
            backgroundColor: lightColors.primary.selected,
            '&:hover': { backgroundColor: lightColors.primary.selected },
            '& .MuiListItemIcon-root': { color: lightColors.primary.main },
            '& .MuiListItemText-primary': { color: lightColors.primary.main, fontWeight: fontWeight.semibold },
          },
        },
      },
    },

    // CHIPS & BADGES
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: borderRadius.DEFAULT, fontWeight: fontWeight.medium, fontSize: fontSize.xs, height: 26 },
        colorSuccess: { backgroundColor: lightColors.success.subtle, color: lightColors.success.dark },
        colorWarning: { backgroundColor: lightColors.warning.subtle, color: lightColors.warning.dark },
        colorError: { backgroundColor: lightColors.error.subtle, color: lightColors.error.dark },
        colorInfo: { backgroundColor: lightColors.info.subtle, color: lightColors.info.dark },
      },
    },

    // DIALOGS & MODALS
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: borderRadius['2xl'], boxShadow: shadows.light.xl } },
    },

    // TOOLTIPS
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: lightColors.text.primary,
          color: lightColors.text.inverse,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
          padding: '8px 12px',
          borderRadius: borderRadius.DEFAULT,
          boxShadow: shadows.light.md,
        },
      },
    },

    // ALERTS
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: borderRadius.lg },
        standardSuccess: { backgroundColor: lightColors.success.subtle, color: lightColors.success.dark },
        standardWarning: { backgroundColor: lightColors.warning.subtle, color: lightColors.warning.dark },
        standardError: { backgroundColor: lightColors.error.subtle, color: lightColors.error.dark },
        standardInfo: { backgroundColor: lightColors.info.subtle, color: lightColors.info.dark },
      },
    },

    // SKELETON
    MuiSkeleton: {
      styleOverrides: { root: { backgroundColor: lightColors.background.hover } },
    },

    // CSS BASELINE
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          scrollbarColor: `${lightColors.border.strong} ${lightColors.background.default}`,
        },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-track': { background: lightColors.background.default },
        '*::-webkit-scrollbar-thumb': {
          background: lightColors.border.strong,
          borderRadius: 4,
          '&:hover': { background: lightColors.text.tertiary },
        },
        '::selection': { backgroundColor: alpha(lightColors.primary.main, 0.2), color: lightColors.text.primary },
      },
    },
  },
});
