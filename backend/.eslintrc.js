module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: 'tsconfig.json', tsconfigRootDir: __dirname, sourceType: 'module' },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist/**', 'node_modules/**', 'coverage/**'],
  rules: {
    // NestJS DI relies on decorator metadata; explicit return types on every
    // controller method add noise without adding safety.
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Prisma's JSON and raw-query surfaces are legitimately `any` at the edges.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      // The seed is a CLI script: console output is its user interface.
      files: ['prisma/seed.ts', 'prisma/seed-data.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
};
