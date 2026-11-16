const globals = require('globals');
const js = require('@eslint/js');

module.exports = [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error'
    }
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, I18n: 'readonly', widget: 'readonly' }
    }
  },
  {
    files: ['test/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, document: 'readonly', window: 'readonly' } }
  },
  {
    files: ['src/core/i18n.js'],
    languageOptions: { globals: { ...globals.node, self: 'readonly' } }
  }
];
