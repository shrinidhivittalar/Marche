import react from '@marche/config/eslint/react';

export default [
  // public/ is served as-is (static assets, not app source) — theme-init.js
  // is a plain browser script with no build step, not TypeScript/React.
  { ignores: ['dist', 'test-results', 'playwright-report', 'public'] },
  ...react,
  {
    // Playwright specs are Node test files, not React. The React Hooks
    // plugin misreads Playwright's `use` fixture callback as a hook call,
    // and its empty-destructure fixture signature is required by the API.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'no-empty-pattern': 'off',
    },
  },
];
