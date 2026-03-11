export const fullViewportHeightSx = {
  height: '100dvh',
  minHeight: '100dvh',
  '@supports not (height: 100dvh)': {
    height: '100vh',
    minHeight: '100vh',
  },
} as const;

export const minViewportHeightSx = {
  minHeight: '100dvh',
  '@supports not (height: 100dvh)': {
    minHeight: '100vh',
  },
} as const;
