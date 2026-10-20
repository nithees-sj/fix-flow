// Shared ESLint flat config for FixFlow TypeScript packages.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Tenant-owned Prisma models. Writing `connect: { id }` against these outside the
 * ownership helpers bypasses the explicit `assertOwned` check (the database still
 * rejects cross-tenant links via composite FKs, but we want clean 404s and reviewable code).
 */
export const tenantSafety = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "Property[key.name='connect'] > ObjectExpression > Property[key.name='id']",
        message:
          'Do not connect tenant relations by bare id. Resolve the id with assertOwned() and set the scalar foreign key instead.',
      },
      {
        selector: "CallExpression[callee.property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]",
        message: 'Unsafe raw SQL is forbidden. Use Prisma.sql tagged templates.',
      },
    ],
  },
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/generated/**', '**/.next/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
