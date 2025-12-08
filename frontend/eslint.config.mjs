import nextConfig from 'eslint-config-next';

const config = [
  {
    ignores: ['coverage/**'],
  },
  ...nextConfig,
  {
    rules: {
      // 'react-hooks/set-state-in-effect': 'warn', // Re-enabled (commented out to use default)
    },
  },
];

export default config;
