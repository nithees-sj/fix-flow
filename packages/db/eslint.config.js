import base from '@fixflow/config/eslint';

const nodeGlobals = { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' };

export default [
  ...base,
  { ignores: ['generated/**', 'dist/**'] },
  // Operator CLIs (role setup, seed) report progress on stdout.
  { files: ['scripts/**/*.mjs', 'seed/**/*.ts'], languageOptions: { globals: nodeGlobals }, rules: { 'no-console': 'off' } },
];
