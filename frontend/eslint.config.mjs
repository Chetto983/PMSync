import nextConfig from 'eslint-config-next';
import tseslint from 'typescript-eslint';

const config = [
  {
    ignores: ['coverage/**', '.next/**', 'node_modules/**'],
  },
  ...nextConfig,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
];

export default config;
