import nextConfig from 'eslint-config-next';
import tseslint from 'typescript-eslint';

// Filter out broken eslint-plugin-react from eslint-config-next.
// eslint-plugin-react 7.37.5 is incompatible with ESLint 10 flat config
// (contextOrFilename.getFilename is not a function). Remove the plugin
// and its rules until a compatible version is released.
const filteredNextConfig = nextConfig.map((cfg) => {
  if (!cfg.plugins || !cfg.plugins.react) return cfg;
  const { react: _reactPlugin, ...restPlugins } = cfg.plugins;
  const filteredRules = cfg.rules
    ? Object.fromEntries(
        Object.entries(cfg.rules).filter(([key]) => !key.startsWith('react/'))
      )
    : cfg.rules;
  return { ...cfg, plugins: restPlugins, rules: filteredRules };
});

const config = [
  {
    ignores: ['coverage/**', '.next/**', 'node_modules/**'],
  },
  ...filteredNextConfig,
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
