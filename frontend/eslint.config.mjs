import nextConfig from 'eslint-config-next';

const config = [
  {
    ignores: ['coverage/**'],
  },
  ...nextConfig,
  {
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
];

export default config;
