import nextConfig from 'eslint-config-next';

const config = [
  {
    ignores: ['coverage/**'],
  },
  ...nextConfig,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;
