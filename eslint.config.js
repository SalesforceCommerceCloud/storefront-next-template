/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ============================================================================
// GENERATED FILE - DO NOT EDIT MANUALLY
// ============================================================================
// This file is generated from the parent monorepo's eslint.config.js
// by copying its contents and merging with template-specific Storybook overrides.
// Run 'node scripts/generate-eslint-config.js' to regenerate.
// ============================================================================

/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { fileURLToPath } from 'node:url';
import globals from 'globals';
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import { includeIgnoreFile } from '@eslint/compat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import jsonc from 'eslint-plugin-jsonc';
import headersPlugin from 'eslint-plugin-headers';
import { colorLinterRule, noClientActionsRule, noClientLoadersRule } from './eslint.rules.js';

const APACHE_LICENSE_HEADER = [
    `Copyright ${new Date().getFullYear()} Salesforce, Inc.`,
    '',
    'Licensed under the Apache License, Version 2.0 (the "License");',
    'you may not use this file except in compliance with the License.',
    'You may obtain a copy of the License at',
    '',
    '    http://www.apache.org/licenses/LICENSE-2.0',
    '',
    'Unless required by applicable law or agreed to in writing, software',
    'distributed under the License is distributed on an "AS IS" BASIS,',
    'WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
    'See the License for the specific language governing permissions and',
    'limitations under the License.',
].join('\n');

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url));

const baseConfig = defineConfig([
    eslint.configs.recommended,
    /**
     * @see {@link https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/src/configs/eslintrc/recommended-type-checked.ts}
     */
    tseslint.configs.recommendedTypeChecked,
    importPlugin.flatConfigs.typescript,
    react.configs.flat.recommended,
    react.configs.flat['jsx-runtime'],
    includeIgnoreFile(gitignorePath, 'Imported .gitignore patterns'),
    jsonc.configs['flat/recommended-with-json'],
    {
        // Ignore generated SCAPI client files, ejected shadcn/ui components, and Claude settings
        ignores: [
            '**/src/scapi-client/generated/**',
            '**/src/scapi/generated/**',
            '**/src/scapi/custom-clients.ts',
            '**/src/components/ui/**',
            '**/src/dashboard/components/ui/**',
            // Pristine upstream shadcn snapshots used by the sync-shadcn skill as merge
            // baselines. Verbatim upstream source (vanilla @/ imports, no copyright header) —
            // not Salesforce code and never imported, so it is excluded from linting.
            '**/.shadcn-baseline/**',
            '**/src/lib/page-designer/static-registry.ts',
            '.claude/**',
            '**/lighthouserc.cjs',
            '**/generate-config.cjs',
        ],
    },
    {
        // Plain Node scripts (.js / .mjs / .cjs / .mts / .cts) and the ambient
        // declarations that type them (.d.mts / .d.cts) aren't part of the TS
        // project, so typed typescript-eslint rules (e.g. `await-thenable`) can't
        // load parser services for them. Without this disable block, generated/
        // mirror projects (which lint `scripts/*.mjs` and their `.d.mts` type
        // shims via the root config) crash with "You have used a rule which
        // requires type information" — fatal exit 2. `.mts`/`.cts` are the
        // explicit Node module-system extensions, the same script category as
        // `.mjs`/`.cjs`; a typed `.mts` source would add its own override.
        files: ['**/*.{js,mjs,cjs,mts,cts}'],
        settings: {
            react: {
                version: 'detect', // Auto-detect React version
            },
        },
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: {
            globals: {
                ...globals.nodeBuiltin,
            },
        },
    },
    {
        files: ['**/*.{ts,tsx}'],
        settings: {
            react: {
                version: 'detect', // Auto-detect React version
            },
        },
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: { jsx: true },
            },
            globals: {
                ...globals.browser,
                ...globals.nodeBuiltin,
            },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
            'jsx-a11y': jsxA11y,
            custom: {
                rules: {
                    'color-linter': colorLinterRule,
                    'no-client-actions': noClientActionsRule,
                    'no-client-loaders': noClientLoadersRule,
                },
            },
        },
        rules: {
            // Enforce multi-site-aware navigation imports + steer SCAPI imports through @/scapi.
            // Severity is `warn`, not `error`, by design: a file still importing from
            // `@salesforce/storefront-next-runtime/scapi` is not broken — it just won't pick up
            // overrides registered via `sfnext scapi`. Keeping this as a warning lets pilot
            // upgrades migrate file-by-file. (The monorepo template's eslint.config.js bumps
            // this rule to `error` for our own CI; mirror customers inherit the warn level.)
            'no-restricted-imports': [
                'warn',
                {
                    paths: [
                        {
                            name: 'react-router',
                            importNames: ['Link', 'NavLink', 'useNavigate'],
                            message:
                                'Import Link/NavLink from "@/components/link" and useNavigate from "@/hooks/use-navigate" for multi-site URL prefixing.',
                        },
                    ],
                    patterns: [
                        {
                            group: [
                                '@salesforce/storefront-next-runtime/scapi',
                                '@salesforce/storefront-next-runtime/scapi/*',
                            ],
                            message: 'Import SCAPI types and clients from "@/scapi" so overrides resolve correctly.',
                        },
                    ],
                },
            ],

            // Override/extend rules from recommended configs
            '@typescript-eslint/consistent-type-exports': 'error',
            '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
            '@typescript-eslint/dot-notation': [
                'error',
                {
                    allowPrivateClassPropertyAccess: true,
                    allowProtectedClassPropertyAccess: true,
                },
            ],
            '@typescript-eslint/no-dupe-class-members': 'error',
            '@typescript-eslint/no-empty-function': 'error',
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/no-redeclare': 'error',
            '@typescript-eslint/no-shadow': 'error',
            '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-useless-constructor': 'error',
            '@typescript-eslint/prefer-promise-reject-errors': [
                'error',
                { allowThrowingAny: true, allowThrowingUnknown: true },
            ],

            // TODO: Disabled for the time being. Should consider turning it on once issues resolved.
            // '@typescript-eslint/explicit-function-return-type': 'error',
            // '@typescript-eslint/explicit-module-boundary-types': 'error',
            // '@typescript-eslint/no-use-before-define': 'error',
            // Disable `checksVoidReturn.attributes` — the sub-check scans every JSX event-handler
            // attribute (`onClick`, `onChange`, …) against the value's return type, which fans out
            // across thousands of TSX files and dominates lint runtime on slow CI runners. The
            // rule still fires on argument/property/return/variable positions, where it catches
            // the high-value bugs (e.g. `await someAsyncFn()` discarded by a `() => void` callback).
            '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
            '@typescript-eslint/no-base-to-string': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',

            // TODO: Commerce SDK types migration - turn this on once issues resolved.
            '@typescript-eslint/no-redundant-type-constituents': 'off',

            // Accessibility: enable the full eslint-plugin-jsx-a11y recommended set.
            // Spread first so the repo's explicit `alt-text`/`img-redundant-alt`
            // overrides below win (custom img components, warn severity).
            ...jsxA11y.flatConfigs.recommended.rules,
            // Beyond recommended: two zero-cost prevention guards for high-severity
            // WCAG failures the audit surfaced (focusable aria-hidden, ambiguous link
            // text). They find nothing today, so they only stop regressions.
            'jsx-a11y/no-aria-hidden-on-focusable': 'error',
            'jsx-a11y/anchor-ambiguous-text': 'error',
            // role="list" on <ul> is a deliberate Safari+VoiceOver workaround (Tailwind's
            // list-style:none strips list semantics in Safari); keep it allowed.
            'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'] }],

            // React rules (beyond the ones defined by `react.configs.flat.recommended`)
            'react/no-array-index-key': 'error',
            'react/no-danger': 'error',
            'react/no-unsafe': 'error',
            'react/self-closing-comp': 'error',
            'react/style-prop-object': 'error',
            'react/void-dom-elements-no-children': 'error',
            'jsx-a11y/alt-text': [
                'error',
                {
                    elements: ['img', 'object', 'area', 'input[type="image"]'],
                    img: ['DynamicImage', 'ProductImage'],
                },
            ],
            'jsx-a11y/img-redundant-alt': 'warn',

            // React Hooks rules
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // React Refresh rules
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

            // General code quality rules
            'import/no-namespace': 'error',
            'no-console': 'error',
            'no-debugger': 'error',
            'no-alert': 'warn',
            'no-var': 'error',
            'prefer-const': 'error',
            'no-duplicate-imports': 'error',
            'no-useless-return': 'warn',
            'no-useless-constructor': 'warn',
            'no-useless-rename': 'warn',
            'object-shorthand': 'warn',
            'prefer-arrow-callback': 'warn',
            'prefer-template': 'warn',
            quotes: [
                'error',
                'single',
                {
                    avoidEscape: true,
                    allowTemplateLiterals: true,
                },
            ],
            'max-len': ['warn', { code: 120, ignoreUrls: true, ignoreStrings: true }],

            // Custom color linting rule
            'custom/color-linter': 'error',
        },
    },
    {
        // Ejected/generated shadcn/ui components
        files: ['src/components/ui/**/*.{ts,tsx}', '**/src/dashboard/components/ui/**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/consistent-type-imports': 'off',
            '@typescript-eslint/no-shadow': 'off',
            'import/no-namespace': 'off',
        },
    },
    {
        // Multi-site navigation wrappers — these legitimately import from react-router.
        // Also covers flat link.tsx used in packages without multi-site routing (e.g. storefront-next-ci).
        files: [
            '**/src/components/link/index.tsx',
            '**/src/components/link.tsx',
            '**/src/dashboard/components/link.tsx',
            '**/src/hooks/use-navigate.ts',
        ],
        rules: {
            'no-restricted-imports': 'off',
            // These files export hooks/functions alongside any components
            'react-refresh/only-export-components': 'off',
        },
    },
    {
        // SCAPI runtime path is legitimate inside the local SCAPI barrel and the file that
        // wires the runtime SDK to the template — both must import from the runtime directly.
        files: ['**/src/scapi/**/*.{ts,tsx}', '**/src/lib/api-clients.server.ts'],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
    {
        // Logger utility — wraps console.* for centralized logging
        files: ['**/src/lib/logger.ts'],
        rules: {
            'no-console': 'off',
        },
    },
    {
        // Build/tooling files
        files: ['**/*.config.{js,ts}', '**/scripts/**/*.{js,ts}'],
        languageOptions: {
            globals: {
                ...globals.nodeBuiltin,
            },
        },
        rules: {
            'no-console': 'off', // Allow console in config/script files
        },
    },
    {
        // Test files - relax some rules. We disable the navigation `no-restricted-imports`
        // restriction since tests often import the underlying React Router primitives, but
        // we re-enable just the SCAPI-runtime-path restriction so test files can't silently
        // bypass the override mechanism.
        files: ['**/*.{test,spec}.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}'],
        languageOptions: {
            globals: {
                ...globals.vitest,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'no-console': 'off',
            'max-len': 'off',
            'no-restricted-imports': [
                'warn',
                {
                    patterns: [
                        {
                            group: [
                                '@salesforce/storefront-next-runtime/scapi',
                                '@salesforce/storefront-next-runtime/scapi/*',
                            ],
                            message: 'Import SCAPI types and clients from "@/scapi" so overrides resolve correctly.',
                        },
                    ],
                },
            ],
            // jsx-a11y targets shipping UI; test fixtures use ad-hoc roles/handlers/props.
            'jsx-a11y/no-autofocus': 'off',
            'jsx-a11y/anchor-is-valid': 'off',
            'jsx-a11y/click-events-have-key-events': 'off',
            'jsx-a11y/no-static-element-interactions': 'off',
            'jsx-a11y/aria-role': 'off',
        },
    },
    {
        // Route files - apply custom loader rules
        // react-refresh/only-export-components is off because React Router requires co-exporting
        // loader/action/meta/links alongside the component in the same file.
        files: ['**/routes/**/!(*.test).{ts,tsx}'],
        rules: {
            '@typescript-eslint/only-throw-error': ['error', { allow: [{ from: 'lib', name: ['Response'] }] }],
            'custom/no-client-actions': 'error',
            'custom/no-client-loaders': 'error',
            'react-refresh/only-export-components': 'off',
        },
    },
    {
        // root.tsx — React Router app shell file.
        // Exports Layout/ErrorBoundary/loader/links/middleware alongside the default App component
        // by framework convention. dangerouslySetInnerHTML is used only for controlled inline scripts
        // (dark mode init, app config injection) — not user input.
        files: ['**/root.tsx'],
        rules: {
            'react-refresh/only-export-components': 'off',
            'react/no-danger': 'off',
        },
    },
    {
        // Server-only modules must not import the browser-only i18n client entry,
        // which pulls in i18next-browser-languagedetector and has no Node support.
        // Use `@salesforce/storefront-next-runtime/i18n` for server-capable APIs.
        files: ['**/*.server.{ts,tsx}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: '@salesforce/storefront-next-runtime/i18n/client',
                            message:
                                'The /i18n/client entry is browser-only. Import server-capable i18n APIs from "@salesforce/storefront-next-runtime/i18n".',
                        },
                    ],
                },
            ],
        },
    },
    {
        // Disable color linting for migration script
        files: ['scripts/migrate-colors.js'],
        rules: {
            'custom/color-linter': 'off',
        },
    },
    {
        // TypeScript declaration files - relax rules for type definitions
        files: ['**/*.d.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    {
        // typescript-eslint was conflicting with json files so had to disable it
        files: ['**/*.json'],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        // devcontainer.json is JSONC by spec — comments are allowed.
        files: ['**/.devcontainer/devcontainer.json', '**/.devcontainer.json'],
        rules: {
            'jsonc/no-comments': 'off',
        },
    },
    {
        // Apache License 2.0 file headers
        files: ['**/*.{ts,tsx,js,jsx}'],
        plugins: {
            headers: headersPlugin,
        },
        rules: {
            'headers/header-format': [
                'error',
                {
                    source: 'string',
                    content: APACHE_LICENSE_HEADER,
                },
            ],
        },
    },
    // Prettier should be last to override formatting rules
    eslintPluginPrettierRecommended,
]);

// Template-specific overrides (Storybook)
const { storybookOverrides } = await import('./eslint.storybook-overrides.js');

/**
 * Ignore the e2e sub-package — it has its own eslint.config.mjs with
 * CodeceptJS-specific rules. ESLint v9 flat config does not auto-discover
 * nested config files, so without this ignore the root config would apply
 * TypeScript-aware rules to e2e files (e.g. .prettierrc.mjs) that are not
 * covered by the e2e tsconfig, causing parser errors.
 *
 * Linting is still enforced: `pnpm lint` delegates to `pnpm --filter ./e2e lint`
 * which runs the e2e package's own config.
 */
export default [{ ignores: ['e2e/**'] }, ...baseConfig, ...storybookOverrides];
