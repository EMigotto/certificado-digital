/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      files: ['frontend/**/*.tsx', 'frontend/**/*.ts'],
      env: { browser: true },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      settings: {
        react: { version: 'detect' },
      },
      extends: ['plugin:react/recommended', 'plugin:react-hooks/recommended'],
      rules: {
        'react/react-in-jsx-scope': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.config.js',
    '*.config.cjs',
    '*.config.mjs',
  ],
};
