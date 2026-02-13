/**
 * @file eslint.config.mjs
 * @version 0.15.0
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Starter pack tooling scripts.
 * @description Repository ESLint Flat Config (toolchain-first; Prettier-only formatting).
 */

// eslint.config.mjs (ESLint v9 — root SSoT)
import js from '@eslint/js';
import globals from 'globals';

import { FlatCompat } from '@eslint/eslintrc';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

const importPlugin = require('eslint-plugin-import');
const prettierConfig = require('eslint-config-prettier');

// Robust ESM __dirname equivalent (do not rely on non-standard import.meta fields).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
});


// Airbnb-inspired adopted subset (project policy).
const ADOPTED_RULES = Object.freeze({
  'no-const-assign': 'error',
  'no-dupe-class-members': 'error',
  'dot-notation': 'error',
  'no-eval': 'error',
  'no-new-func': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-array-constructor': 'error',
  'no-new-object': 'error',
  'prefer-object-spread': 'error',
  'prefer-rest-params': 'error',
  'prefer-spread': 'error',
  'no-useless-escape': 'error',
  'default-param-last': 'error',
});

export default [
  // -----------------------------
  // Global ignores
  // -----------------------------
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/.cache/**',
      '**/*.min.*',
    ],
  },

  // -----------------------------
  // Baseline JS recommended
  // -----------------------------
  js.configs.recommended,

  // -----------------------------
  // Node globals for JS tooling/config (ESM)
  // -----------------------------
  {
    files: [
      '**/*.{config,setup}.{js,mjs}',
      '**/*.config.{js,mjs}',
      '**/scripts/**/*.{js,mjs}',
      '**/tools/**/*.{js,mjs}',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  // -----------------------------
  // Node globals for JS tooling/config (CJS)
  // -----------------------------
  {
    files: [
      '**/*.{config,setup}.cjs',
      '**/*.config.cjs',
      '**/scripts/**/*.cjs',
      '**/tools/**/*.cjs',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },

  // -----------------------------
  // Import correctness (JS-level)
  // -----------------------------
  {
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.json', './packages/*/tsconfig.json'],
        },
        node: {
          extensions: ['.js', '.ts', '.d.ts'],
        },
      },
    },
    rules: {
      ...(importPlugin.configs?.recommended?.rules ?? {}),
      ...ADOPTED_RULES,
    },
  },

  // -----------------------------
  // TypeScript recommended (compat layer)
  // - TS is authoritative for semantics; lint focuses on policy + obvious issues.
  // - Type-aware rules are intentionally not enabled here (performance + stability).
  // -----------------------------
  ...compat.extends('plugin:@typescript-eslint/recommended'),

  // -----------------------------
  // TypeScript authority for unused vars
  // -----------------------------
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      ...ADOPTED_RULES,
    },
  },

  // -----------------------------
  // Tests (Vitest globals only)
  // -----------------------------
  {
    files: ['**/*.{test,spec}.{js,jsx,ts,tsx}', '**/tests/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },

  // -----------------------------
  // Prettier compatibility (disable formatting rules)
  // -----------------------------
  prettierConfig,
];
