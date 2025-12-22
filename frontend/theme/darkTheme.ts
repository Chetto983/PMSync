/**
 * PMSync Dark Theme Configuration
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
  darkColors,
  layout,
  zIndex,
} from './tokens';
import { typography, shape } from './typography';

// =============================================================================
// DARK THEME
// =============================================================================

export const createPmSyncDarkTheme = (): ThemeOptions => ({
  palette: {
    mode: 'dark',
    primary: {
      main: darkColors.primary.main,
      light: darkColors.primary.light,
      dark: darkColors.primary.dark,
      contrastText: darkColors.primary.contrastText,
    },
    secondary: {
      main: darkColors.secondary.main,
      light: darkColors.secondary.light,
      dark: darkColors.secondary.dark,
      contrastText: darkColors.secondary.contrastText,
    },
    success: {
      main: darkColors.success.main,
      light: darkColors.success.light,
      dark: darkColors.success.dark,
      contrastText: darkColors.success.contrastText,
    },
    warning: {
      main: darkColors.warning.main,
      light: darkColors.warning.light,
      dark: darkColors.warning.dark,
      contrastText: darkColors.warning.contrastText,
    },
    error: {
      main: darkColors.error.main,
      light: darkColors.error.light,
      dark: darkColors.error.dark,
      contrastText: darkColors.error.contrastText,
    },
    info: {
      main: darkColors.info.main,
      light: darkColors.info.light,
      dark: darkColors.info.dark,
      contrastText: darkColors.info.contrastText,
    },
    background: {
      default: darkColors.background.default,
      paper: darkColors.background.paper,
    },
    text: {
      primary: darkColors.text.primary,
      secondary: darkColors.text.secondary,
      disabled: darkColors.text.disabled,
    },
    divider: darkColors.border.default,
    action: darkColors.action,
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
          '&:hover': { boxShadow: shadows.dark.md },
        },
        containedPrimary: {
          background: brand.gradient,
          '&:hover': {
            background: `linear-gradient(135deg, ${brand.cyanBright} 0%, ${brand.purple} 100%)`,
            boxShadow: shadows.dark.glow,
          },
        },
        containedSecondary: {
          background: brand.gradientPurple,
          '&:hover': { boxShadow: shadows.dark.glowPurple },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': { borderWidth: '1.5px', backgroundColor: darkColors.primary.hover },
        },
        outlinedPrimary: {
          borderColor: alpha(darkColors.primary.main, 0.5),
          '&:hover': { borderColor: darkColors.primary.main },
        },
        text: { '&:hover': { backgroundColor: darkColors.action.hover } },
        sizeSmall: { padding: '6px 14px', fontSize: fontSize.sm, borderRadius: borderRadius.DEFAULT },
        sizeLarge: { padding: '14px 28px', fontSize: fontSize.md, borderRadius: borderRadius.lg },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.md,
          transition: `all ${transitions.duration.fast}ms ${transitions.easing.DEFAULT}`,
          '&:hover': { backgroundColor: darkColors.action.hover },
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
        elevation1: { boxShadow: shadows.dark.sm },
        elevation2: { boxShadow: shadows.dark.DEFAULT },
        elevation3: { boxShadow: shadows.dark.md },
        elevation4: { boxShadow: shadows.dark.lg },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: borderRadius.xl,
          border: '1px solid',
          borderColor: darkColors.border.default,
          backgroundColor: darkColors.background.paper,
          transition: `all ${transitions.duration.DEFAULT}ms ${transitions.easing.DEFAULT}`,
          '&:hover': {
            borderColor: darkColors.primary.main, // Brand Cyan border on hover
            boxShadow: shadows.dark.lg,
            transform: 'translateY(-4px)', // Bento hover effect
          },
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { padding: layout.card.padding.md },
        title: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
        subheader: { fontSize: fontSize.sm, color: darkColors.text.secondary },
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
            backgroundColor: darkColors.background.subtle,
            transition: `all ${transitions.duration.DEFAULT}ms ${transitions.easing.DEFAULT}`,
            '& fieldset': {
              borderColor: darkColors.border.default,
              borderWidth: '1px',
              transition: `all ${transitions.duration.fast}ms ${transitions.easing.DEFAULT}`,
            },
            '&:hover fieldset': { borderColor: darkColors.border.strong },
            '&.Mui-focused fieldset': { borderColor: darkColors.primary.main, borderWidth: '2px' },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${darkColors.primary.focus}` },
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { fontSize: fontSize.base },
        input: { '&::placeholder': { opacity: 0.5, color: darkColors.text.tertiary } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: borderRadius.md },
        notchedOutline: { borderColor: darkColors.border.default },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: fontSize.base,
          color: darkColors.text.secondary,
          '&.Mui-focused': { color: darkColors.primary.main },
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
          border: `1px solid ${darkColors.border.default}`,
          boxShadow: shadows.dark.lg,
          marginTop: 4,
        },
        listbox: { padding: 4 },
        option: {
          borderRadius: borderRadius.DEFAULT,
          margin: '2px 4px',
          '&[aria-selected="true"]': { backgroundColor: darkColors.primary.selected },
          '&:hover': { backgroundColor: darkColors.action.hover },
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
          '&:hover': { backgroundColor: darkColors.background.hover },
          '&.Mui-selected': {
            backgroundColor: darkColors.primary.selected,
            '&:hover': { backgroundColor: darkColors.primary.selected },
            '& .MuiListItemIcon-root': { color: darkColors.primary.main },
            '& .MuiListItemText-primary': { color: darkColors.primary.main, fontWeight: fontWeight.semibold },
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: { root: { minWidth: 36, color: darkColors.text.secondary } },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
        secondary: { fontSize: fontSize.sm, color: darkColors.text.tertiary },
      },
    },

    // DRAWER & SIDEBAR
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: darkColors.background.paper,
          borderRight: `1px solid ${darkColors.border.subtle}`,
          boxShadow: 'none',
        },
      },
    },

    // APP BAR & HEADER
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: alpha(darkColors.background.paper, 0.7),
          backgroundImage: 'none',
          borderBottom: `1px solid ${darkColors.border.default}`,
          backdropFilter: glass.blur.DEFAULT,
          WebkitBackdropFilter: glass.blur.DEFAULT,
        },
      },
    },
    MuiToolbar: {
      styleOverrides: { root: { minHeight: `${layout.header.height}px !important` } },
    },

    // TABLES
    MuiTableContainer: {
      styleOverrides: {
        root: { borderRadius: borderRadius.lg, border: `1px solid ${darkColors.border.default}` },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: darkColors.background.subtle,
          '& .MuiTableCell-head': {
            fontWeight: fontWeight.semibold,
            fontSize: fontSize.xs,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: darkColors.text.secondary,
            borderBottom: `1px solid ${darkColors.border.default}`,
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: `background-color ${transitions.duration.fast}ms ${transitions.easing.DEFAULT}`,
          '&:hover': { backgroundColor: darkColors.background.hover },
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${darkColors.border.subtle}`, padding: '14px 16px', fontSize: fontSize.base },
      },
    },

    // CHIPS & BADGES
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: borderRadius.DEFAULT, fontWeight: fontWeight.medium, fontSize: fontSize.xs, height: 26 },
        colorSuccess: { backgroundColor: darkColors.success.subtle, color: darkColors.success.light },
        colorWarning: { backgroundColor: darkColors.warning.subtle, color: darkColors.warning.light },
        colorError: { backgroundColor: darkColors.error.subtle, color: darkColors.error.light },
        colorInfo: { backgroundColor: darkColors.info.subtle, color: darkColors.info.light },
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
          backgroundColor: darkColors.background.elevated,
          border: `1px solid ${darkColors.border.default}`,
          boxShadow: shadows.dark.xl,
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
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: glass.blur.sm,
          WebkitBackdropFilter: glass.blur.sm,
        },
      },
    },

    // TOOLTIPS & POPOVERS
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: darkColors.background.elevated,
          color: darkColors.text.primary,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
          padding: '8px 12px',
          borderRadius: borderRadius.DEFAULT,
          border: `1px solid ${darkColors.border.default}`,
          boxShadow: shadows.dark.md,
        },
        arrow: { color: darkColors.background.elevated },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.lg,
          border: `1px solid ${darkColors.border.default}`,
          boxShadow: shadows.dark.lg,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.lg,
          border: `1px solid ${darkColors.border.default}`,
          boxShadow: shadows.dark.lg,
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
          '&:hover': { backgroundColor: darkColors.action.hover },
          '&.Mui-selected': {
            backgroundColor: darkColors.primary.selected,
            '&:hover': { backgroundColor: darkColors.primary.selected },
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
        standardSuccess: { backgroundColor: darkColors.success.subtle, color: darkColors.success.light },
        standardWarning: { backgroundColor: darkColors.warning.subtle, color: darkColors.warning.light },
        standardError: { backgroundColor: darkColors.error.subtle, color: darkColors.error.light },
        standardInfo: { backgroundColor: darkColors.info.subtle, color: darkColors.info.light },
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
      styleOverrides: { avatar: { borderWidth: 2, borderColor: darkColors.background.paper } },
    },

    // SKELETON & LOADING
    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: darkColors.background.hover },
        rounded: { borderRadius: borderRadius.md },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: borderRadius.full, backgroundColor: darkColors.background.subtle },
        bar: { borderRadius: borderRadius.full, background: brand.gradient },
      },
    },
    MuiCircularProgress: {
      styleOverrides: { circle: { strokeLinecap: 'round' } },
    },

    // DIVIDERS
    MuiDivider: {
      styleOverrides: { root: { borderColor: darkColors.border.subtle } },
    },

    // SWITCHES, CHECKBOXES, RADIOS
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        track: { borderRadius: borderRadius.full, backgroundColor: darkColors.background.subtle, opacity: 1 },
        thumb: { boxShadow: shadows.dark.sm },
        switchBase: {
          '&.Mui-checked': { '& + .MuiSwitch-track': { backgroundColor: darkColors.primary.main, opacity: 1 } },
        },
      },
    },
    MuiCheckbox: { styleOverrides: { root: { borderRadius: borderRadius.sm } } },
    MuiRadio: {
      styleOverrides: { root: { '&.Mui-checked': { color: darkColors.primary.main } } },
    },

    // ACCORDION
    MuiAccordion: {
      defaultProps: { elevation: 0, disableGutters: true },
      styleOverrides: {
        root: {
          borderRadius: borderRadius.lg,
          border: `1px solid ${darkColors.border.default}`,
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
      styleOverrides: { separator: { color: darkColors.text.tertiary } },
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
          scrollbarColor: `${darkColors.border.strong} ${darkColors.background.default}`,
        },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-track': { background: darkColors.background.default },
        '*::-webkit-scrollbar-thumb': {
          background: darkColors.border.strong,
          borderRadius: 4,
          '&:hover': { background: darkColors.text.tertiary },
        },
        '::selection': { backgroundColor: alpha(darkColors.primary.main, 0.3), color: darkColors.text.primary },
      },
    },
  },
});
