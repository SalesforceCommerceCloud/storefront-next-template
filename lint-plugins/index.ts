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

/**
 * OxLint custom-rule plugin for the storefront monorepo.
 *
 * Registered in `.oxlintrc.json` via `jsPlugins: ["./lint-plugins/index.ts"]`.
 * OxLint loads TypeScript plugin files natively under Node >=22.18 / ^20.19
 * (built-in type-stripping). Rules are referenced in config as
 * `<plugin-name>/<rule>` — here the plugin name is `custom`, so e.g.
 * `custom/color-linter`, matching the ESLint rule names the codebase's
 * existing disable directives already use (zero directive churn).
 *
 * Provides `color-linter` (enforces design token usage) and `header-format`
 * (enforces Apache 2.0 copyright header) repo-wide. The `no-internal-mvt-comments`
 * rule now lives in `packages/template/lint-plugins/` (scoped to that package).
 *
 * Note: `clientAction`/`clientLoader` route exports are blocked by the built-in
 * `no-restricted-exports` rule (scoped to `**​/routes/**` in `.oxlintrc.json`),
 * not a custom rule.
 */
import { colorLinterRule } from './rules/color-linter.ts';
import { headerFormatRule } from './rules/header-format.ts';

const plugin = {
    meta: {
        name: 'custom',
    },
    rules: {
        'color-linter': colorLinterRule,
        'header-format': headerFormatRule,
    },
};

export default plugin;
