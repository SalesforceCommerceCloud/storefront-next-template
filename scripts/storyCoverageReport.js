#!/usr/bin/env node
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
 * Storybook Coverage Report Generator
 *
 * Scans /src/components and /src/extensions recursively:
 *  - Detects all *.tsx component files (except *.stories.tsx, *.test.tsx, *.snapshot.tsx, *-snapshot.tsx)
 *  - Detects matching *.stories.tsx files
 *  - Creates coverage %, missing story list
 *  - Emits Markdown + JSON summary
 */
import fs from 'fs';
import path from 'path';
// ---- CONFIG ----
const COMPONENTS_DIR = path.join(process.cwd(), 'src/components');
const EXTENSIONS_DIR = path.join(process.cwd(), 'src/extensions');
const OUTPUT_DIR = path.join(process.cwd(), '.storybook', 'coverage');
const JSON_PATH = path.join(OUTPUT_DIR, 'storybook-component-coverage.json');
const MD_PATH = path.join(OUTPUT_DIR, 'storybook-component-coverage.md');

// Coverage thresholds
const STORY_COVERAGE_THRESHOLD = 100; // All components must have stories
const CODE_COVERAGE_THRESHOLD = 80; // Minimum acceptable code coverage

// Components that don't require stories (simple icons, internal sub-components, etc.)
const EXCLUDED_COMPONENTS = new Set([
    // Simple icon components
    'icons/amex-icon',
    'icons/credit-card-option-icon',
    'icons/discover-icon',
    'icons/generic-card-icon',
    'icons/heart-icon',
    'icons/mastercard-icon',
    'icons/visa-icon',
    'product-carousel/index',
    'product-cart-actions/index',
    'product-image/index',
    'product-item-skeleton/index',
    'product-item/index',
    'product-items-list/index',
    'product-price/index',
    'product-skeleton/index',
    'product-tile/index',
    'product-view/index',
    'store-locator/components/footer/index',
    // Thin async wrapper (Suspense/Await) and barrel re-export, no visual rendering of their own
    'product-grid/deferred',
    'product-grid/index',
    'product-recommendations/deferred',
    // Barrel re-export — `customer-reviews-section.tsx` (the implementation) has its own story.
    'ratings-reviews/components/customer-reviews-section/index',
    // Barrel re-export — `ai-insight-card.tsx` (the implementation) has its own story.
    'ai-insight-card/index',
    // Lightweight skeleton fallback extracted into its own file so React.lazy() can keep the
    // full section out of the eager bundle. Same convention as other *-skeleton excludes above.
    'customer-preferences/components/interests-preferences-section/skeleton',
    // Extension UITarget wrappers — thin Suspense/Await wrappers that pull deferred data
    // from `useRouteLoaderData`. Underlying section components have their own stories.
    'customer-preferences/components/target/preferences-target',
    'bnpl/components/target/bnpl-target',
    'ratings-reviews/components/target/order-line-review-target',
    'ratings-reviews/components/target/reviews-section-target',
    'ratings-reviews/components/target/reviews-summary-target',
    // Tiny per-line context provider used to forward props through a UITarget boundary.
    'ratings-reviews/components/order-line-review-context',
    // Context provider that forwards the storefront's payment-submission ref to extension components rendered at a UITarget.
    'checkout/payment-submission-context',
    'product-content/components/target/returns-and-warranty-target',
    'product-content/components/target/faq-target',
    'product-content/components/target/pdp-collapsibles-target',
    'shipping-delivery/components/target/estimated-delivery-target',
    // Hook that returns a lazy-loaded slot — not a standalone visual component
    'bopis/components/delivery-options/use-shipping-calculator',
    // Wraps Sonner's <Toaster> to apply app-level config; no visual content of its own.
    'toast/app-toaster',
    // Page Designer Region and Component Wrapper, there is no value in having storybook stories for these
    'region/component',
    'region/component-data-context',
    'region/embedded-component-region',
    'region/index',
    'region/region-wrapper',
    // Tiny error-boundary fallback components consumed via React Router's `errorElement` —
    // depend on `useAsyncError()` which only resolves inside an `<Await>` boundary, so a
    // standalone story is awkward and offers little value beyond the unit test
    'cart/cart-load-error',
    // Mock-based composite story deleted — real component has deep hook deps, sub-components have own stories
    'checkout/checkout-form-page',
    // Cart item modal sub-containers — internal mode-router targets composed inside
    // `cart-item-modal/index.tsx` and exercised by the parent `cart-item-modal` story.
    // No external importers; unit tests cover the mode-routing logic.
    'cart-item-modal/add-container',
    'cart-item-modal/edit-container',
    'cart-item-modal/view',
    // Internal implementation of the public `navigation-menu/index.tsx` —
    // exercised via the index story; not a public component.
    'navigation-menu/impl',
    // Storybook-only utility (renders nothing visible), covered by unit test
    'checkout/storybook/checkout-action-logger',
    // These are basically wrappers around other components, so no value in having storybook stories for them
    'checkout/components/checkout-skeletons',
    'customer-address-form/customer-address-fields',
    // Barrel re-export — `form.tsx` (the real component) has its own story.
    'customer-address-form/index',
    'customer-profile-form/form',
    'customer-profile-form/index',
    // Barrel re-export — `payment-methods.tsx` (the real component) has its own story.
    'payment-methods/index',
    'email-update-form/form',
    'email-update-form/index',
    'forgot-password-form/form',
    'header/cart-badge-icon',
    'header/user-actions/user-menu',
    'password-requirements/index',
    'password-update-form/form',
    'password-update-form/index',
    'promo-code-form/index',
    'signup-form/form',
    // Footer sub-components — composed inside `footer/index` and exercised by the Footer stories.
    'footer/checkout-footer',
    'footer/legal-links',
    'footer/main-footer',
    'footer/newsletter-section',
    'footer/policy-links',
    'footer/social-icons',
    'footer/switchers',
    // Cimulate (Commerce Client) — thin deferred loader, config validator, and external script injector.
    // Depends on a CDN-loaded UMD bundle; no visual rendering testable in Storybook isolation.
    'cimulate/index',
    'cimulate/cimulate-ui',
    'cimulate/cimulate-window',
]);
// Ensure OUTPUT DIR exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
// Check if at least one directory exists
if (!fs.existsSync(COMPONENTS_DIR) && !fs.existsSync(EXTENSIONS_DIR)) {
    console.error(`❌ Neither components nor extensions directory found: ${COMPONENTS_DIR} or ${EXTENSIONS_DIR}`);
    process.exit(1);
}
function walk(dir, fileCallback) {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir)) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, fileCallback);
        else fileCallback(full);
    }
}
function getComponentName(filePath, componentsDir) {
    // Get relative path from components directory
    const relativePath = path.relative(componentsDir, filePath);
    // Remove extension and get the component identifier
    const withoutExt = relativePath.replace(/\.tsx$/, '');
    // Replace path separators with '/' for consistency
    return withoutExt.split(path.sep).join('/');
}
function generateCoverage() {
    const components = new Map(); // Map<componentName, filePath>
    const stories = new Set();

    // Helper function to collect stories from a directory
    // Stories MUST be in a /stories/ subdirectory
    function collectStories(dir, baseDir, isExtensions = false) {
        if (!fs.existsSync(dir)) return;
        walk(dir, (file) => {
            if (file.endsWith('.stories.tsx')) {
                // Stories MUST be in a /stories/ subdirectory
                if (!file.includes(path.sep + 'stories' + path.sep)) {
                    return;
                }
                // For extensions, only include stories in components/ folders
                if (isExtensions) {
                    const rel = path.relative(baseDir, file);
                    // Check if the relative path contains components/ folder
                    const pathParts = rel.split(path.sep);
                    if (!pathParts.includes('components')) {
                        return;
                    }
                }
                // Extract component name from story path
                // e.g., "components/cart/stories/cart-content.stories.tsx" -> "cart/cart-content"
                const rel = path.relative(baseDir, file);
                const parts = rel.split(path.sep);
                const storiesIndex = parts.indexOf('stories');
                if (storiesIndex === -1) return;

                // Get the component directory path (everything before "stories")
                const componentDir = parts.slice(0, storiesIndex).join('/');
                // Get the story file name without extension
                const storyName = parts[storiesIndex + 1].replace(/\.stories\.tsx$/, '');

                // Build component name: if story is "index.stories.tsx", use the directory name
                // Otherwise use the story name
                const componentName = storyName === 'index' ? componentDir : `${componentDir}/${storyName}`;

                stories.add(componentName);
            }
        });
    }

    // Helper function to collect components from a directory
    function collectComponents(dir, baseDir, isExtensions = false) {
        if (!fs.existsSync(dir)) return;
        walk(dir, (file) => {
            // For extensions, only include components in components/ folders
            if (isExtensions) {
                const rel = path.relative(baseDir, file);
                // Check if the relative path contains components/ folder
                const pathParts = rel.split(path.sep);
                if (!pathParts.includes('components')) {
                    return;
                }
            }

            // Skip story files, test files, and snapshot files
            if (
                file.endsWith('.stories.tsx') ||
                file.endsWith('.test.tsx') ||
                file.endsWith('-snapshot.tsx') ||
                file.includes('/stories/') ||
                file.includes('/__snapshots__/') ||
                file.includes('/__mocks__/')
            ) {
                return;
            }
            // Only process .tsx files
            if (file.endsWith('.tsx')) {
                const componentName = getComponentName(file, baseDir);
                // Store both the name and path for better reporting
                if (!components.has(componentName)) {
                    components.set(componentName, file);
                }
            }
        });
    }

    // Collect all story files first
    collectStories(COMPONENTS_DIR, COMPONENTS_DIR, false);
    collectStories(EXTENSIONS_DIR, EXTENSIONS_DIR, true);

    // Collect all component files
    collectComponents(COMPONENTS_DIR, COMPONENTS_DIR, false);
    collectComponents(EXTENSIONS_DIR, EXTENSIONS_DIR, true);
    // Find missing stories
    const missing = [];
    const excluded = [];
    for (const [componentName, filePath] of components.entries()) {
        // Skip ejected `shadcn/ui` components
        if (filePath.includes('/components/ui/')) {
            excluded.push({ name: componentName, path: filePath });
            continue;
        }

        // Skip excluded components
        if (EXCLUDED_COMPONENTS.has(componentName)) {
            excluded.push({ name: componentName, path: filePath });
            continue;
        }
        // Check if there's a matching story
        // Stories MUST be in a /stories/ subdirectory
        // A story can match by:
        // 1. Component "cart/cart-content" matches story "cart/cart-content" (from "cart/stories/cart-content.stories.tsx")
        // 2. Component "cart/index" matches story "cart" (from "cart/stories/index.stories.tsx")
        const dirName = path.dirname(componentName);
        const hasStory = stories.has(componentName) || (componentName.endsWith('/index') && stories.has(dirName));
        if (!hasStory) {
            missing.push({
                name: componentName,
                path: filePath,
            });
        }
    }
    const totalComponents = components.size;
    const componentsNeedingStories = totalComponents - excluded.length;
    const covered = componentsNeedingStories - missing.length;
    const percent = componentsNeedingStories === 0 ? 100 : Math.round((covered / componentsNeedingStories) * 100);
    // Sort missing components for better readability
    missing.sort((a, b) => a.name.localeCompare(b.name));

    // Determine badge color based on coverage
    let badgeColor = 'red';
    let badgeEmoji = '❌';
    if (percent === 100) {
        badgeColor = 'brightgreen';
        badgeEmoji = '✅';
    } else if (percent >= 90) {
        badgeColor = 'green';
        badgeEmoji = '✅';
    } else if (percent >= 75) {
        badgeColor = 'yellowgreen';
        badgeEmoji = '⚠️';
    } else if (percent >= 50) {
        badgeColor = 'yellow';
        badgeEmoji = '⚠️';
    }

    // Check if thresholds are met
    const storyCoverageMet = percent >= STORY_COVERAGE_THRESHOLD;

    const jsonSummary = {
        timestamp: new Date().toISOString(),
        totalComponents,
        componentsNeedingStories,
        componentsWithStories: covered,
        coveragePercent: percent,
        excludedComponents: excluded.length,
        missingComponents: missing.map((m) => ({ name: m.name })),
        thresholds: {
            storyCoverage: {
                threshold: STORY_COVERAGE_THRESHOLD,
                met: storyCoverageMet,
            },
            codeCoverage: {
                threshold: CODE_COVERAGE_THRESHOLD,
                met: null, // Will be set after code coverage is loaded
            },
        },
    };

    // Merge Vitest code coverage metrics if available
    const vitestSummaryPath = path.join(
        process.cwd(),
        '.storybook',
        'coverage',
        'coverage-vitest',
        'coverage-summary.json'
    );
    if (fs.existsSync(vitestSummaryPath)) {
        try {
            const vitest = JSON.parse(fs.readFileSync(vitestSummaryPath, 'utf8'));
            jsonSummary.codeCoverage = vitest.total; // {lines:{pct:..}, statements:..., functions:..., branches:...}
            // Calculate average code coverage and check threshold
            const lines = vitest.total.lines?.pct || 0;
            const statements = vitest.total.statements?.pct || 0;
            const functions = vitest.total.functions?.pct || 0;
            const branches = vitest.total.branches?.pct || 0;
            const avgCoverage = (lines + statements + functions + branches) / 4;
            jsonSummary.thresholds.codeCoverage.met = avgCoverage >= CODE_COVERAGE_THRESHOLD;
        } catch (e) {
            console.warn('⚠️  Could not read vitest coverage summary:', e.message);
        }
    }

    // Format date nicely
    const date = new Date();
    const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
    });

    const md = `
<div align="center">

# 📚 Storybook Component Coverage Report


---

</div>

## 📚 Story Coverage

<div align="center">

![Story Coverage](https://img.shields.io/badge/story%20coverage-${percent}%25-${badgeColor}?style=for-the-badge&logo=storybook)
${missing.length === 0 ? '![Status](https://img.shields.io/badge/status-complete-success?style=flat-square)' : `![Status](https://img.shields.io/badge/missing-${missing.length}%20stories-critical?style=flat-square)`}

</div>

| Metric | Value | Status | Threshold |
|:-------|:-----:|:------:|:---------:|
| **Total Components** | \`${totalComponents}\` | ${totalComponents > 0 ? '📦' : '⚠️'} | - |
| **Components Needing Stories** | \`${componentsNeedingStories}\` | ${componentsNeedingStories > 0 ? '📦' : '⚠️'} | - |
| **Components With Stories** | \`${covered}\` | ${covered === componentsNeedingStories ? '✅' : '⚠️'} | - |
| **Excluded Components** | \`${excluded.length}\` | ℹ️ | - |
| **Coverage** | **\`${percent}%\`** | ${badgeEmoji} | \`${STORY_COVERAGE_THRESHOLD}%\` ${storyCoverageMet ? '✅' : '❌'} |

${
    missing.length === 0
        ? `
<div align="center">

### 🎉 Perfect Coverage!

**All \`${componentsNeedingStories}\` components that need stories have Storybook stories!** 

✨ Great job maintaining comprehensive component documentation! ✨

</div>
`
        : `
## ⚠️ Missing Stories (${missing.length})

The following components are missing Storybook stories:

<details>
<summary><b>📋 Click to expand missing components list</b></summary>

${missing.map((m) => `- \`${m.name}\``).join('\n')}

</details>
`
}

${
    jsonSummary.codeCoverage
        ? (() => {
              const lines = jsonSummary.codeCoverage.lines?.pct || 0;
              const statements = jsonSummary.codeCoverage.statements?.pct || 0;
              const functions = jsonSummary.codeCoverage.functions?.pct || 0;
              const branches = jsonSummary.codeCoverage.branches?.pct || 0;
              const avgCoverage = (lines + statements + functions + branches) / 4;

              let codeCoverageBadgeColor = 'red';
              if (avgCoverage >= 90) {
                  codeCoverageBadgeColor = 'brightgreen';
              } else if (avgCoverage >= 80) {
                  codeCoverageBadgeColor = 'green';
              } else if (avgCoverage >= 70) {
                  codeCoverageBadgeColor = 'yellowgreen';
              } else if (avgCoverage >= 50) {
                  codeCoverageBadgeColor = 'yellow';
              }

              const getStatusEmoji = (pct) => {
                  if (pct >= 90) return '🟢';
                  if (pct >= 80) return '🟡';
                  if (pct >= 70) return '🟠';
                  return '🔴';
              };

              return `
---
## 💻 Code Coverage (Story Interaction Tests)

<div align="center">

![Code Coverage](https://img.shields.io/badge/code%20coverage-${avgCoverage.toFixed(2)}%25-${codeCoverageBadgeColor}?style=for-the-badge&logo=vitest)

</div>

| Metric | Coverage | Status | Threshold |
|:-------|:--------:|:------:|:---------:|
| **📄 Lines** | \`${lines.toFixed(2)}%\` | ${getStatusEmoji(lines)} | \`${CODE_COVERAGE_THRESHOLD}%\` ${lines >= CODE_COVERAGE_THRESHOLD ? '✅' : '❌'} |
| **📝 Statements** | \`${statements.toFixed(2)}%\` | ${getStatusEmoji(statements)} | \`${CODE_COVERAGE_THRESHOLD}%\` ${statements >= CODE_COVERAGE_THRESHOLD ? '✅' : '❌'} |
| **⚙️ Functions** | \`${functions.toFixed(2)}%\` | ${getStatusEmoji(functions)} | \`${CODE_COVERAGE_THRESHOLD}%\` ${functions >= CODE_COVERAGE_THRESHOLD ? '✅' : '❌'} |
| **🌿 Branches** | \`${branches.toFixed(2)}%\` | ${getStatusEmoji(branches)} | \`${CODE_COVERAGE_THRESHOLD}%\` ${branches >= CODE_COVERAGE_THRESHOLD ? '✅' : '❌'} |
| **📊 Average** | **\`${avgCoverage.toFixed(2)}%\`** | ${getStatusEmoji(avgCoverage)} | \`${CODE_COVERAGE_THRESHOLD}%\` ${avgCoverage >= CODE_COVERAGE_THRESHOLD ? '✅' : '❌'} |
`;
          })()
        : ''
}

---

<div align="right">

<sub>📅 Generated: ${formattedDate}</sub>

</div>
`;

    fs.writeFileSync(JSON_PATH, JSON.stringify(jsonSummary, null, 2));
    fs.writeFileSync(MD_PATH, md.trim());
    console.log('✔️ Coverage report generated');
    console.log(`📄 JSON: ${JSON_PATH}`);
    console.log(`📄 MD: ${MD_PATH}`);
    console.log(
        `📊 Coverage: ${percent}% (${covered}/${componentsNeedingStories} components needing stories, ${excluded.length} excluded)`
    );
    // Exit non-zero for CI enforcement if thresholds not met
    let exitCode = 0;
    if (!storyCoverageMet) {
        const MAX_MISSING_WARNINGS = 10;
        console.error(`\n❌ Story coverage threshold not met: ${percent}% < ${STORY_COVERAGE_THRESHOLD}%`);
        console.error(`   Missing stories for ${missing.length} component(s):`);
        missing.slice(0, MAX_MISSING_WARNINGS).forEach((m) => {
            console.error(`   - ${m.name}`);
        });
        if (missing.length > MAX_MISSING_WARNINGS) {
            console.error(`   ... and ${missing.length - MAX_MISSING_WARNINGS} more (see report for full list)`);
        }
        exitCode = 1;
    }

    // Check code coverage threshold if available (warning only, does not fail pipeline)
    if (jsonSummary.codeCoverage && jsonSummary.thresholds.codeCoverage.met === false) {
        const lines = jsonSummary.codeCoverage.lines?.pct || 0;
        const statements = jsonSummary.codeCoverage.statements?.pct || 0;
        const functions = jsonSummary.codeCoverage.functions?.pct || 0;
        const branches = jsonSummary.codeCoverage.branches?.pct || 0;
        const avgCoverage = (lines + statements + functions + branches) / 4;
        console.warn(
            `\n⚠️  Code coverage threshold not met: ${avgCoverage.toFixed(2)}% < ${CODE_COVERAGE_THRESHOLD}% (warning only, pipeline will not fail)`
        );
        // Note: exitCode is not set to 1, so pipeline will not fail for code coverage
    }

    process.exit(exitCode);
}
generateCoverage();
