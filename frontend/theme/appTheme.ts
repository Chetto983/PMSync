import { createTheme, ThemeOptions } from '@mui/material/styles';

// PmSync Color Palette
// Brand colors from landing page + Material Design semantic colors
export const pmSyncColors = {
  // Brand Gradient Colors (Landing Page)
  brand: {
    cyan: '#55cae5',      // Primary brand color
    purple: '#7650ce',    // Secondary brand color
    magenta: '#b43db6',   // Accent brand color
    // Pre-computed gradients for consistency
    gradient: 'linear-gradient(135deg, #55cae5 0%, #7650ce 100%)',
    gradientFull: 'linear-gradient(135deg, #55cae5 0%, #7650ce 50%, #b43db6 100%)',
    gradientReverse: 'linear-gradient(135deg, #7650ce 0%, #b43db6 100%)',
  },
  // Semantic Colors for categories/status
  semantic: {
    email: '#0B7EFF',     // Blue - Email related
    calendar: '#FF9800',  // Orange - Calendar related
    contacts: '#9C27B0',  // Purple - Contacts related
    tasks: '#00C853',     // Green - Tasks/Success
    important: '#FFB300', // Amber - Important/Star
    attachment: '#607D8B', // Blue Grey - Attachments
  },
  // Dark Mode Colors
  dark: {
    background: {
      primary: '#0F0F0F',      // Main background
      secondary: '#1A1A1A',    // Secondary background
      card: '#1E1E1E',         // Card background
      cardHover: '#242424',    // Card hover
      input: '#2A2A2A',        // Input background
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#9E9E9E',
      tertiary: '#6E6E6E',
      disabled: '#4E4E4E',
    },
    primary: {
      main: '#0B7EFF',
      light: '#1E88E5',
      dark: '#0066CC',
      contrastText: '#FFFFFF',
    },
    success: {
      main: '#00C853',
      light: '#00E676',
      dark: '#009624',
    },
    error: {
      main: '#FF3D57',
      light: '#FF6B7A',
      dark: '#CC0033',
    },
    warning: {
      main: '#FF9800',
      light: '#FFB74D',
      dark: '#F57C00',
    },
    info: {
      main: '#00B8D4',
      light: '#00E5FF',
      dark: '#0091A8',
    },
    border: {
      main: '#2A2A2A',
      light: '#3A3A3A',
    },
  },
  // Light Mode Colors
  light: {
    background: {
      primary: '#FFFFFF',
      secondary: '#F5F5F5',
      card: '#FFFFFF',
      cardHover: '#F9F9F9',
      input: '#F5F5F5',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#6E6E6E',
      tertiary: '#9E9E9E',
      disabled: '#BDBDBD',
    },
    primary: {
      main: '#0B7EFF',
      light: '#1E88E5',
      dark: '#0066CC',
      contrastText: '#FFFFFF',
    },
    success: {
      main: '#00C853',
      light: '#00E676',
      dark: '#009624',
    },
    error: {
      main: '#FF3D57',
      light: '#FF6B7A',
      dark: '#CC0033',
    },
    warning: {
      main: '#FF9800',
      light: '#FFB74D',
      dark: '#F57C00',
    },
    info: {
      main: '#00B8D4',
      light: '#00E5FF',
      dark: '#0091A8',
    },
    border: {
      main: '#E0E0E0',
      light: '#EEEEEE',
    },
  },
};

// Typography configuration
const typography = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  h1: {
    fontSize: '2rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  h2: {
    fontSize: '1.75rem',
    fontWeight: 700,
    lineHeight: 1.3,
  },
  h3: {
    fontSize: '1.5rem',
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h4: {
    fontSize: '1.25rem',
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h5: {
    fontSize: '1.125rem',
    fontWeight: 600,
    lineHeight: 1.5,
  },
  h6: {
    fontSize: '1rem',
    fontWeight: 600,
    lineHeight: 1.5,
  },
  body1: {
    fontSize: '1rem',
    lineHeight: 1.5,
  },
  body2: {
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
  caption: {
    fontSize: '0.75rem',
    lineHeight: 1.4,
  },
  button: {
    fontSize: '0.875rem',
    fontWeight: 600,
    textTransform: 'none' as const,
  },
};

// Spacing and shape
const spacing = 8;
const shape = {
  borderRadius: 12,
};

// Create Dark Theme
export const createPmSyncDarkTheme = (): ThemeOptions => ({
  palette: {
    mode: 'dark',
    primary: pmSyncColors.dark.primary,
    success: pmSyncColors.dark.success,
    error: pmSyncColors.dark.error,
    warning: pmSyncColors.dark.warning,
    info: pmSyncColors.dark.info,
    background: {
      default: pmSyncColors.dark.background.primary,
      paper: pmSyncColors.dark.background.card,
    },
    text: {
      primary: pmSyncColors.dark.text.primary,
      secondary: pmSyncColors.dark.text.secondary,
      disabled: pmSyncColors.dark.text.disabled,
    },
    divider: pmSyncColors.dark.border.main,
  },
  typography,
  spacing,
  shape,
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 24px',
          fontSize: '0.875rem',
          fontWeight: 600,
          textTransform: 'none',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(11, 126, 255, 0.3)',
          },
        },
        contained: {
          '&:hover': {
            boxShadow: '0 4px 12px rgba(11, 126, 255, 0.4)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: pmSyncColors.dark.background.card,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            backgroundColor: pmSyncColors.dark.background.cardHover,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: pmSyncColors.dark.background.input,
            '& fieldset': {
              borderColor: pmSyncColors.dark.border.main,
            },
            '&:hover fieldset': {
              borderColor: pmSyncColors.dark.border.light,
            },
            '&.Mui-focused fieldset': {
              borderColor: pmSyncColors.dark.primary.main,
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '0.75rem',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: pmSyncColors.dark.background.secondary,
          borderRight: `1px solid ${pmSyncColors.dark.border.main}`,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: pmSyncColors.dark.background.secondary,
          boxShadow: 'none',
          borderBottom: `1px solid ${pmSyncColors.dark.border.main}`,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '4px 8px',
          '&:hover': {
            backgroundColor: pmSyncColors.dark.background.cardHover,
          },
          '&.Mui-selected': {
            backgroundColor: pmSyncColors.dark.primary.main,
            color: pmSyncColors.dark.text.primary,
            '&:hover': {
              backgroundColor: pmSyncColors.dark.primary.light,
            },
          },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: pmSyncColors.dark.primary.main,
          fontWeight: 600,
        },
      },
    },
  },
});

// Create Light Theme
export const createPmSyncLightTheme = (): ThemeOptions => ({
  palette: {
    mode: 'light',
    primary: pmSyncColors.light.primary,
    success: pmSyncColors.light.success,
    error: pmSyncColors.light.error,
    warning: pmSyncColors.light.warning,
    info: pmSyncColors.light.info,
    background: {
      default: pmSyncColors.light.background.primary,
      paper: pmSyncColors.light.background.card,
    },
    text: {
      primary: pmSyncColors.light.text.primary,
      secondary: pmSyncColors.light.text.secondary,
      disabled: pmSyncColors.light.text.disabled,
    },
    divider: pmSyncColors.light.border.main,
  },
  typography,
  spacing,
  shape,
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 24px',
          fontSize: '0.875rem',
          fontWeight: 600,
          textTransform: 'none',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(11, 126, 255, 0.2)',
          },
        },
        contained: {
          '&:hover': {
            boxShadow: '0 4px 12px rgba(11, 126, 255, 0.3)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: pmSyncColors.light.background.card,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          border: `1px solid ${pmSyncColors.light.border.main}`,
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            backgroundColor: pmSyncColors.light.background.cardHover,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: pmSyncColors.light.background.input,
            '& fieldset': {
              borderColor: pmSyncColors.light.border.main,
            },
            '&:hover fieldset': {
              borderColor: pmSyncColors.light.border.light,
            },
            '&.Mui-focused fieldset': {
              borderColor: pmSyncColors.light.primary.main,
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '0.75rem',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: pmSyncColors.light.background.secondary,
          borderRight: `1px solid ${pmSyncColors.light.border.main}`,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: pmSyncColors.light.background.card,
          boxShadow: 'none',
          borderBottom: `1px solid ${pmSyncColors.light.border.main}`,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '4px 8px',
          '&:hover': {
            backgroundColor: pmSyncColors.light.background.cardHover,
          },
          '&.Mui-selected': {
            backgroundColor: pmSyncColors.light.primary.main,
            color: '#FFFFFF',
            '&:hover': {
              backgroundColor: pmSyncColors.light.primary.light,
            },
          },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: pmSyncColors.light.primary.main,
          fontWeight: 600,
        },
      },
    },
  },
});

// Export theme creators
export const darkTheme = createTheme(createPmSyncDarkTheme());
export const lightTheme = createTheme(createPmSyncLightTheme());
