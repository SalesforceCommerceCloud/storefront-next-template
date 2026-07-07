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
 * Generate standalone ESLint config for mirror repo
 *
 * This script reads the parent monorepo's eslint.config.js and eslint.rules.js,
 * copies their contents, and merges them with template-specific overrides (Storybook rules)
 * to generate a standalone eslint.config.js that works without the parent dependency.
 *
 * This approach ensures a single source of truth - any updates to the monorepo's ESLint
 * config will automatically flow to the mirror repo without manual duplication.
 *
 * Usage:
 *   node scripts/generate-eslint-config.js
 *
 * This should be run as part of the mirror repo sync process.
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATE_DIR = join(__dirname, '..');

// Allow an explicit monorepo root to be passed as a CLI argument:
//   node scripts/generate-eslint-config.js --monorepo-root /path/to/monorepo
// Falls back to path-sniffing when not provided (mirror sync workflow context).
const monorepoRootFlagIndex = process.argv.indexOf('--monorepo-root');
const monorepoRootFromFlag = monorepoRootFlagIndex !== -1 ? resolve(process.argv[monorepoRootFlagIndex + 1]) : null;

// In monorepo: template is at packages/template/ (need to go up 2 levels)
// In workflow: template is at mirror-repo/ (need to go up 1 level)
// Try both paths and use whichever exists
const monorepoRootOption1 = join(TEMPLATE_DIR, '../..'); // For monorepo
const monorepoRootOption2 = join(TEMPLATE_DIR, '..'); // For workflow
const MONOREPO_ROOT =
    monorepoRootFromFlag ??
    (existsSync(join(monorepoRootOption1, 'eslint.rules.js')) ? monorepoRootOption1 : monorepoRootOption2);

const PARENT_ESLINT_CONFIG = join(MONOREPO_ROOT, 'eslint.config.js');
const PARENT_ESLINT_RULES = join(MONOREPO_ROOT, 'eslint.rules.js');
const TEMPLATE_STORYBOOK_OVERRIDES = join(TEMPLATE_DIR, 'eslint.storybook-overrides.js');
const OUTPUT_ESLINT_CONFIG = join(TEMPLATE_DIR, 'eslint.config.js');
const OUTPUT_ESLINT_RULES = join(TEMPLATE_DIR, 'eslint.rules.js');
const OUTPUT_STORYBOOK_OVERRIDES = join(TEMPLATE_DIR, 'eslint.storybook-overrides.js');
const E2E_ESLINT_CONFIG = join(TEMPLATE_DIR, 'e2e', 'eslint.config.mjs');

/**
 * Format generated source with the project's own Prettier so the written file matches
 * what `prettier --write` / `pnpm lint` would produce. The config is assembled by string
 * concatenation (parent config + headers + Storybook imports), which can't anticipate the
 * project's printWidth/indentation — so without this the generated eslint.config.js fails
 * the project's own lint (W-23074938). Resolved from this script's location (the generated
 * project's node_modules). Unlike the SDK copy, this script only runs with the monorepo /
 * mirror checkout present (mirror sync + the release-qualification harness), so Prettier is
 * always on disk here; we return unformatted only if it genuinely can't be resolved, and
 * throw on a real format/config error rather than silently shipping output that won't lint.
 *
 * NOTE: mirror of the helper in
 * packages/storefront-next-dev/src/extensibility/trim-extensions.ts — kept separate because
 * the two live in different packages/module systems. Keep the parser/config-resolution
 * behavior in sync; the fallback chains INTENTIONALLY differ — this copy has a single
 * fallback (consumer Prettier → unformatted), while the trim-extensions.ts copy adds an
 * SDK-bundled `import('prettier')` step because it runs pre-install. Don't "fix" that
 * asymmetry or you reintroduce the pre-install bug (W-23074938).
 *
 * @param {string} content Serialized file content.
 * @param {string} filePath Target path (drives parser + config resolution).
 * @returns {Promise<string>} Prettier-formatted content; unchanged only if Prettier is absent.
 */
async function formatWithProjectPrettier(content, filePath) {
    let prettier;
    try {
        const projectRequire = createRequire(import.meta.url);
        prettier = projectRequire('prettier');
    } catch {
        console.warn('⚠️  Prettier not found in the project; eslint.config.js will be written unformatted.');
        return content;
    }
    try {
        const config = await prettier.resolveConfig(filePath, { editorconfig: true });
        return await prettier.format(content, { ...config, filepath: filePath });
    } catch (error) {
        // A parse/config error is a real bug — fail loudly instead of emitting broken output.
        throw new Error(`Prettier formatting failed for eslint.config.js: ${error.message}`);
    }
}

/**
 * Re-point the e2e package's ESLint config import at the standalone project root.
 *
 * In the monorepo the e2e config lives at `packages/template/e2e/` and
 * imports the shared base config three levels up (`../../../eslint.config.js` → monorepo
 * root). The standalone template is flat — the e2e package sits directly under the
 * project root — so the base config it consumes is one level up (`../eslint.config.js`,
 * the file this script generates). Without this rewrite the import resolves above the
 * project and `pnpm --filter ./e2e lint` fails with ERR_MODULE_NOT_FOUND (W-23074938).
 *
 * No-op in the monorepo (the file is left untouched there) and idempotent. We rewrite the
 * path SPECIFIER itself rather than a specific import statement, so it works whether the base
 * config is pulled in via `await import('../../../eslint.config.js')` (our template) or a
 * static `import … from '../../../eslint.config.js'` (a custom/customer template) — and there
 * is no import shape that references the base config but escapes the rewrite.
 */
async function rewriteE2eEslintImport() {
    if (!existsSync(E2E_ESLINT_CONFIG)) {
        return;
    }
    const original = await readFile(E2E_ESLINT_CONFIG, 'utf-8');
    // Flatten the quoted base-config specifier (`'../../../eslint.config.js'` →
    // `'../eslint.config.js'`) regardless of how it's imported.
    const rewritten = original.replace(/(['"])\.\.\/\.\.\/\.\.\/eslint\.config\.js\1/g, '$1../eslint.config.js$1');
    if (rewritten === original) {
        console.log('ℹ️  e2e/eslint.config.mjs base-config import already flat (skipped)');
        return;
    }
    console.log('✏️  Re-pointing e2e/eslint.config.mjs base-config import to the project root...');
    await writeFile(E2E_ESLINT_CONFIG, await formatWithProjectPrettier(rewritten, E2E_ESLINT_CONFIG), 'utf-8');
}

async function generateStandaloneConfig() {
    // Check if we're in monorepo context by verifying:
    // 1. The monorepo package structure exists
    // 2. AND the template is actually running from within that structure
    // In monorepo: TEMPLATE_DIR === <monorepo-root>/packages/template/
    // In mirror repo: TEMPLATE_DIR is the mirror repo root (different from monorepo structure)
    const monorepoTemplatePath = join(MONOREPO_ROOT, 'packages', 'template');
    const isTemplateInsideMonorepo =
        existsSync(monorepoTemplatePath) && resolve(TEMPLATE_DIR) === resolve(monorepoTemplatePath);

    if (isTemplateInsideMonorepo) {
        console.log('ℹ️  Detected monorepo context - skipping standalone config generation');
        console.log('   (template uses parent config import in monorepo)');
        return;
    }

    console.log('🔧 Generating standalone ESLint config for mirror repo...\n');

    // Read parent config file
    console.log('📖 Reading parent config file...');
    let parentConfigContent = await readFile(PARENT_ESLINT_CONFIG, 'utf-8');

    // Read parent rules file
    console.log('📖 Reading parent rules file...');
    const parentRulesContent = await readFile(PARENT_ESLINT_RULES, 'utf-8');

    // Read Storybook overrides file
    console.log('📖 Reading Storybook overrides file...');
    const storybookOverridesContent = await readFile(TEMPLATE_STORYBOOK_OVERRIDES, 'utf-8');

    // Add copyright header to rules if missing
    const rulesContent = parentRulesContent.startsWith('/**')
        ? parentRulesContent
        : `/**
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
${parentRulesContent}`;

    // Write eslint.rules.js
    console.log('✏️  Writing eslint.rules.js...');
    await writeFile(OUTPUT_ESLINT_RULES, rulesContent, 'utf-8');

    // Write eslint.storybook-overrides.js (as-is, no transformation needed)
    console.log('✏️  Writing eslint.storybook-overrides.js...');
    await writeFile(OUTPUT_STORYBOOK_OVERRIDES, storybookOverridesContent, 'utf-8');

    // Transform parent config to work in mirror repo:
    // 1. Add copyright header with generation notice
    // 2. Add storybook plugin import
    // 3. Convert export default defineConfig([...]) to const baseConfig = defineConfig([...])
    // 4. Add new export default with baseConfig spread and Storybook overrides

    // Replace the final export with a const declaration
    parentConfigContent = parentConfigContent.replace(
        /export default defineConfig\(\[/,
        'const baseConfig = defineConfig(['
    );

    // Remove the final closing of the original export
    parentConfigContent = parentConfigContent.replace(/\]\);[\s]*$/, ']);\n');

    // Add generation header and storybook import
    const generatedHeader = `/**
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

`;

    // Build the final config with template-specific overrides
    const standaloneConfig = `${generatedHeader}${parentConfigContent}
// Template-specific overrides (Storybook)
const { storybookOverrides } = await import('./eslint.storybook-overrides.js');

/**
 * Ignore the e2e sub-package — it has its own eslint.config.mjs with
 * CodeceptJS-specific rules. ESLint v9 flat config does not auto-discover
 * nested config files, so without this ignore the root config would apply
 * TypeScript-aware rules to e2e files (e.g. .prettierrc.mjs) that are not
 * covered by the e2e tsconfig, causing parser errors.
 *
 * Linting is still enforced: \`pnpm lint\` delegates to \`pnpm --filter ./e2e lint\`
 * which runs the e2e package's own config.
 */
export default [{ ignores: ['e2e/**'] }, ...baseConfig, ...storybookOverrides];
`;

    console.log('✏️  Writing eslint.config.js...');
    // Format the concatenated config with the project's Prettier so it's lint-clean
    // in the generated artifact (W-23074938).
    const formattedConfig = await formatWithProjectPrettier(standaloneConfig, OUTPUT_ESLINT_CONFIG);
    await writeFile(OUTPUT_ESLINT_CONFIG, formattedConfig, 'utf-8');

    // Flatten the e2e sub-package's base-config import to match the standalone layout.
    await rewriteE2eEslintImport();

    console.log('\n✅ Successfully generated standalone ESLint config!');
    console.log('📁 Files written:');
    console.log('   - eslint.rules.js (copied from parent)');
    console.log('   - eslint.storybook-overrides.js (copied from template)');
    console.log('   - eslint.config.js (parent config + imports Storybook overrides)');
    console.log('\n💡 These files are ready for the mirror repo.');
}

// Run the generator
generateStandaloneConfig().catch((error) => {
    console.error('❌ Error generating standalone config:', error);
    process.exit(1);
});
