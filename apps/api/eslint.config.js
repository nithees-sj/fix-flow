import base, { tenantSafety } from '@fixflow/config/eslint';

export default [
  ...base,
  tenantSafety,
  {
    // Nest resolves constructor injection from emitted decorator metadata, which needs value
    // imports. Without type-aware linting this rule would rewrite them to `import type` and
    // silently break dependency injection.
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
