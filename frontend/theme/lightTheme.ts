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
  layout,
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
        containedSecondary: {
          background: brand.gradientPurple,
          '&:hover': { boxShadow: shadows.light.glowPurple },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': { borderWidth: '1.5px', backgroundColor: lightColors.primary.hover },
        },
        outlinedPrimary: {
          borderColor: alpha(lightColors.primary.main, 0.5),
          '&:hover': { borderColor: lightColors.primary.main },
        },
        text: { '&:hover': { backgroundColor: lightColors.action.hover } },
        sizeSmall: { padding: '6px 14px', fontSize: fontSize.sm, borderRadius: borderRadius.DEFAULT },
        sizeLarge: { padding: '14px 28px', fontSize: fontSize.md, borderRadius: borderRadius.lg },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.md,
          transition: `all ${transitions.duration.fast}ms ${transitions.easing.DEFAULT}`,
          '&:hover': { backgroundColor: lightColors.action.hover },
        },
        sizeSmall: { padding: 6 },
        sizeMedium: { padding: 8 },
        sizeLarge: { padding: 12 },
      },
    },

    // PAPER & CARDS
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: borderRadius.lg,
          transition: `all ${transitions.duration.DEFAULT}ms ${transitions.easing.DEFAULT}`,
        },
        elevation0: { boxShadow: 'none' },
        elevation1: { boxShadow: shadows.light.sm },
        elevation2: { boxShadow: shadows.light.DEFAULT },
        elevation3: { boxShadow: shadows.light.md },
        elevation4: { boxShadow: shadows.light.lg },
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
          transition: `all ${transitions.duration.DEFAULT}ms ${transitions.easing.DEFAULT}`,
          '&:hover': {
            borderColor: lightColors.primary.main, // Brand Cyan border on hover
            boxShadow: shadows.light.lg,
            transform: 'translateY(-4px)', // Bento hover effect
          },
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { padding: layout.card.padding.md },
        title: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
        subheader: { fontSize: fontSize.sm, color: lightColors.text.secondary },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: { padding: layout.card.padding.md, '&:last-child': { paddingBottom: layout.card.padding.md } },
      },
    },
    MuiCardActions: {
      styleOverrides: { root: { padding: `12px ${layout.card.padding.md}px` } },
    },

    // TEXT FIELDS & INPUTS
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: borderRadius.md,
            backgroundColor: lightColors.background.subtle,
            transition: `all ${transitions.duration.DEFAULT}ms ${transitions.easing.DEFAULT}`,
            '& fieldset': {
              borderColor: lightColors.border.default,
              borderWidth: '1px',
              transition: `all ${transitions.duration.fast}ms ${transitions.easing.DEFAULT}`,
            },
            '&:hover fieldset': { borderColor: lightColors.border.strong },
            '&.Mui-focused fieldset': { borderColor: lightColors.primary.main, borderWidth: '2px' },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${lightColors.primary.focus}` },
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { fontSize: fontSize.base },
        input: { '&::placeholder': { opacity: 0.5, color: lightColors.text.tertiary } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: borderRadius.md },
        notchedOutline: { borderColor: lightColors.border.default },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: fontSize.base,
          color: lightColors.text.secondary,
          '&.Mui-focused': { color: lightColors.primary.main },
        },
      },
    },

    // SELECT & AUTOCOMPLETE
    MuiSelect: {
      styleOverrides: { select: { borderRadius: borderRadius.md } },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.lg,
          border: `1px solid ${lightColors.border.default}`,
          boxShadow: shadows.light.lg,
          marginTop: 4,
        },
        listbox: { padding: 4 },
        option: {
          borderRadius: borderRadius.DEFAULT,
          margin: '2px 4px',
          '&[aria-selected="true"]': { backgroundColor: lightColors.primary.selected },
          '&:hover': { backgroundColor: lightColors.action.hover },
        },
      },
    },

    // LISTS & NAVIGATION
    MuiList: { styleOverrides: { root: { padding: 4 } } },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.md,
          margin: '2px 4px',
          padding: '10px 12px',
          transition: `all ${transitions.duration.fast}ms ${transitions.easing.DEFAULT}`,
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
    MuiListItemIcon: {
      styleOverrides: { root: { minWidth: 36, color: lightColors.text.secondary } },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
        secondary: { fontSize: fontSize.sm, color: lightColors.text.tertiary },
      },
    },

    // DRAWER & SIDEBAR
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: lightColors.background.paper,
          borderRight: `1px solid ${lightColors.border.subtle}`,
          boxShadow: 'none',
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
    MuiToolbar: {
      styleOverrides: { root: { minHeight: `${layout.header.height}px !important` } },
    },

    // TABLES
    MuiTableContainer: {
      styleOverrides: {
        root: { borderRadius: borderRadius.lg, border: `1px solid ${lightColors.border.default}` },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: lightColors.background.subtle,
          '& .MuiTableCell-head': {
            fontWeight: fontWeight.semibold,
            fontSize: fontSize.xs,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: lightColors.text.secondary,
            borderBottom: `1px solid ${lightColors.border.default}`,
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: `background-color ${transitions.duration.fast}ms ${transitions.easing.DEFAULT}`,
          '&:hover': { backgroundColor: lightColors.background.hover },
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${lightColors.border.subtle}`, padding: '14px 16px', fontSize: fontSize.base },
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
        outlined: { borderWidth: '1.5px' },
        sizeSmall: { height: 22, fontSize: '0.6875rem' },
      },
    },
    MuiBadge: {
      styleOverrides: { badge: { fontWeight: fontWeight.semibold, fontSize: '0.625rem' } },
    },

    // DIALOGS & MODALS
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius['2xl'],
          backgroundColor: lightColors.background.elevated,
          border: `1px solid ${lightColors.border.default}`,
          boxShadow: shadows.light.xl,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { padding: '20px 24px 16px', fontSize: fontSize.lg, fontWeight: fontWeight.semibold } },
    },
    MuiDialogContent: { styleOverrides: { root: { padding: '16px 24px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 20px', gap: 12 } } },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: glass.blur.sm,
          WebkitBackdropFilter: glass.blur.sm,
        },
      },
    },

    // TOOLTIPS & POPOVERS
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
        arrow: { color: lightColors.text.primary },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.lg,
          border: `1px solid ${lightColors.border.default}`,
          boxShadow: shadows.light.lg,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.lg,
          border: `1px solid ${lightColors.border.default}`,
          boxShadow: shadows.light.lg,
          marginTop: 4,
        },
        list: { padding: 4 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.DEFAULT,
          margin: '2px 4px',
          padding: '8px 12px',
          fontSize: fontSize.base,
          '&:hover': { backgroundColor: lightColors.action.hover },
          '&.Mui-selected': {
            backgroundColor: lightColors.primary.selected,
            '&:hover': { backgroundColor: lightColors.primary.selected },
          },
        },
      },
    },

    // TABS
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 44 },
        indicator: { height: 3, borderRadius: '3px 3px 0 0', background: brand.gradient },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: fontWeight.medium,
          fontSize: fontSize.base,
          minHeight: 44,
          padding: '12px 16px',
          transition: `color ${transitions.duration.fast}ms ${transitions.easing.DEFAULT}`,
          '&.Mui-selected': { fontWeight: fontWeight.semibold },
        },
      },
    },

    // ALERTS & SNACKBARS
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: borderRadius.lg, padding: '12px 16px' },
        standardSuccess: { backgroundColor: lightColors.success.subtle, color: lightColors.success.dark },
        standardWarning: { backgroundColor: lightColors.warning.subtle, color: lightColors.warning.dark },
        standardError: { backgroundColor: lightColors.error.subtle, color: lightColors.error.dark },
        standardInfo: { backgroundColor: lightColors.info.subtle, color: lightColors.info.dark },
      },
    },
    MuiSnackbar: {
      styleOverrides: { root: { '& .MuiPaper-root': { borderRadius: borderRadius.lg } } },
    },

    // AVATARS
    MuiAvatar: {
      styleOverrides: {
        root: { fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
        colorDefault: { background: brand.gradient, color: '#ffffff' },
      },
    },
    MuiAvatarGroup: {
      styleOverrides: { avatar: { borderWidth: 2, borderColor: lightColors.background.paper } },
    },

    // SKELETON & LOADING
    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: lightColors.background.hover },
        rounded: { borderRadius: borderRadius.md },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: borderRadius.full, backgroundColor: lightColors.background.subtle },
        bar: { borderRadius: borderRadius.full, background: brand.gradient },
      },
    },
    MuiCircularProgress: {
      styleOverrides: { circle: { strokeLinecap: 'round' } },
    },

    // DIVIDERS
    MuiDivider: {
      styleOverrides: { root: { borderColor: lightColors.border.subtle } },
    },

    // SWITCHES, CHECKBOXES, RADIOS
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        track: { borderRadius: borderRadius.full, backgroundColor: lightColors.border.strong, opacity: 1 },
        thumb: { backgroundColor: '#ffffff', boxShadow: shadows.light.sm },
        switchBase: {
          color: '#ffffff',
          '&.Mui-checked': {
            color: '#ffffff',
            '& + .MuiSwitch-track': { backgroundColor: lightColors.primary.main, opacity: 1 },
          },
        },
      },
    },
    MuiCheckbox: { styleOverrides: { root: { borderRadius: borderRadius.sm } } },
    MuiRadio: {
      styleOverrides: { root: { '&.Mui-checked': { color: lightColors.primary.main } } },
    },

    // ACCORDION
    MuiAccordion: {
      defaultProps: { elevation: 0, disableGutters: true },
      styleOverrides: {
        root: {
          borderRadius: borderRadius.lg,
          border: `1px solid ${lightColors.border.default}`,
          '&:before': { display: 'none' },
          '&:not(:last-child)': { marginBottom: 8 },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: { root: { padding: '0 16px', minHeight: 56 } },
    },
    MuiAccordionDetails: {
      styleOverrides: { root: { padding: 16, paddingTop: 0 } },
    },

    // BREADCRUMBS
    MuiBreadcrumbs: {
      styleOverrides: { separator: { color: lightColors.text.tertiary } },
    },

    // PAGINATION
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.md,
          '&.Mui-selected': {
            background: brand.gradient,
            color: '#ffffff',
            '&:hover': { background: brand.gradient },
          },
        },
      },
    },

    // CSS BASELINE
    MuiCssBaseline: {
      styleOverrides: {
        html: { scrollBehavior: 'smooth' },
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
