# Story Coverage & Code Quality Enforcement

This document explains the automated story coverage and code quality enforcement system that runs on every pull request.

## 1. How It Works (Automated via GitHub Actions)

The story coverage and code quality enforcement is fully automated through GitHub Actions. The workflow triggers automatically on every pull request when:

- A PR is **opened**
- A PR is **reopened**
- A PR is **synchronized** (new commits pushed)
- A PR is marked as **ready for review**

The workflow performs the following automated steps:

1. **Generates Story Tests**: Automatically scans `src/components/` and `src/extensions/` for all `*.stories.tsx` files (excluding `src/components/ui/`) and generates corresponding Vitest test files using `composeStories` from `@storybook/react-vite`
2. **Runs Tests with Coverage**: Executes the generated story tests with Vitest's coverage instrumentation enabled
3. **Generates Coverage Report**: Analyzes component coverage by comparing components with their corresponding story files
4. **Uploads Artifacts**: Saves coverage reports and metrics as GitHub Actions artifacts

The workflow uses `pnpm storybook:test --type=snapshot --coverage` which:
- Runs `generate-story-tests.js` to create test files from stories
- Executes Vitest with coverage enabled using the Storybook Vite config
- Outputs coverage data to `.storybook/coverage/coverage-vitest/`

## 2. Story & Code Coverage Metrics

### a. Story Coverage

**Story Coverage** measures the percentage of React components in `src/components/` and `src/extensions/` that have corresponding Storybook story files.

**How it's calculated:**
- Scans all `*.tsx` files in `src/components/` and `src/extensions/*/components/` (excluding test files, snapshot files, story files themselves, and the `ui/` folder)
- **For extensions**: Only includes components from `components/` folders within each extension (excludes hooks, contexts, providers, etc. in other folders)
- **Excludes `src/components/ui/`**: The `ui` folder contains shadcn components and is excluded from both test generation and code coverage
- Checks for matching `*.stories.tsx` files in `stories/` subdirectories:
  - Stories MUST be in a `stories/` subdirectory (e.g., `cart/cart-content.tsx` matches `cart/stories/cart-content.stories.tsx`)
  - Index story for directory (e.g., `cart/index.tsx` matches `cart/stories/index.stories.tsx`)
  - Named component story (e.g., `customer-address-form/form.tsx` matches `customer-address-form/stories/form.stories.tsx`)
- Excludes certain components that don't require stories (simple icons, internal sub-components) as defined in `EXCLUDED_COMPONENTS`

**Metrics tracked:**
- **Total Components**: Total number of component files found
- **Components With Stories**: Number of components that have matching story files
- **Excluded Components**: Components intentionally excluded from coverage requirements
- **Coverage Percentage**: `(Components With Stories / Total Components) × 100`

### b. Code Coverage Data

**Code Coverage** measures how much of the component code is executed when running story interaction tests.

**Coverage metrics collected:**
- **Lines**: Percentage of code lines executed during story tests
- **Statements**: Percentage of statements executed
- **Functions**: Percentage of functions called
- **Branches**: Percentage of conditional branches taken

**How it's collected:**
- Uses Vitest's `@vitest/coverage-v8` plugin
- Coverage is collected when running story tests via `composeStories`
- Each story's `play()` function is executed, which exercises component interactions
- Coverage data is merged from Vitest's coverage summary JSON
- **Excludes `src/components/ui/`**: The `ui` folder is excluded from code coverage collection (configured in both `vite.config.ts` and `.storybook/vite.config.ts`)

**Coverage data source:**
- Location: `.storybook/coverage/coverage-vitest/coverage-summary.json`
- Merged into the story coverage report JSON for comprehensive reporting

### c. Badge Status Classification

The system uses color-coded badges to quickly visualize coverage status:

#### Story Coverage Badges

| Coverage % | Badge Color | Emoji | Status |
|:----------:|:-----------:|:-----:|:------:|
| 100% | `brightgreen` | ✅ | Perfect - All components have stories |
| ≥ 90% | `green` | ✅ | Excellent - Nearly complete |
| ≥ 75% | `yellowgreen` | ⚠️ | Good - Most components covered |
| ≥ 50% | `yellow` | ⚠️ | Fair - Needs improvement |
| < 50% | `red` | ❌ | Poor - Significant gaps |

#### Code Coverage Badges

| Average Coverage % | Badge Color | Status |
|:------------------:|:-----------:|:------:|
| ≥ 90% | `brightgreen` | Excellent |
| ≥ 80% | `green` | Good |
| ≥ 70% | `yellowgreen` | Acceptable |
| ≥ 50% | `yellow` | Needs improvement |
| < 50% | `red` | Poor |

**Individual metric status indicators:**
- 🟢 Green: ≥ 90% coverage
- 🟡 Yellow: 80-89% coverage
- 🟠 Orange: 70-79% coverage
- 🔴 Red: < 70% coverage

### d. Outputs (Artifacts)

The workflow generates and uploads the following artifacts:

#### 1. Story Coverage JSON
- **Artifact Name**: `storybook-coverage-json`
- **Location**: `packages/template/.storybook/coverage/storybook-component-coverage.json`
- **Contents**:
  ```json
  {
    "timestamp": "ISO timestamp",
    "totalComponents": 123,
    "componentsWithStories": 115,
    "coveragePercent": 93,
    "excludedComponents": 5,
    "missingComponents": ["component/path1", "component/path2"],
    "codeCoverage": {
      "lines": { "pct": 85.5 },
      "statements": { "pct": 84.2 },
      "functions": { "pct": 82.1 },
      "branches": { "pct": 78.9 }
    }
  }
  ```

#### 2. Story Coverage Markdown Report
- **Artifact Name**: `storybook-coverage-md`
- **Location**: `packages/template/.storybook/coverage/storybook-component-coverage.md`
- **Contents**: Formatted markdown report with:
  - Coverage badges
  - Metrics table
  - Missing components list (if any)
  - Code coverage metrics table (if available)
  - Timestamp

#### 3. Vitest Coverage Data
- **Artifact Name**: `vitest-coverage`
- **Location**: `packages/template/.storybook/coverage/coverage-vitest/`
- **Contents**: Complete Vitest coverage report including:
  - `coverage-summary.json` - Summary statistics
  - HTML coverage reports
  - Source maps and detailed coverage data

**Artifact Retention**: Artifacts are available for download from the GitHub Actions run page for 90 days (default GitHub Actions retention).

## 3. Workflow Location

The GitHub Actions workflow file is located at:

```
.github/workflows/story-coverage.yml
```

**Workflow name**: `Storybook Component Coverage`

**Key workflow details:**
- **Trigger**: Pull request events (opened, reopened, synchronize, ready_for_review)
- **Runs on**: `ubuntu-latest`
- **Node version**: 24
- **Package manager**: pnpm 10.28.0
- **Permissions**: `contents: read` - To checkout code

**Workflow steps:**
1. Checkout code
2. Setup pnpm
3. Setup Node.js
4. Install dependencies
5. Run tests with code coverage (`storybook:test --type=snapshot --coverage`)
6. Run story coverage script (`storyCoverageReport.js`)
7. Upload JSON summary artifact
8. Upload Markdown report artifact
9. Upload Vitest coverage artifact

## 4. Coverage Scripts Location

The coverage scripts are located in the `scripts/` directory:

### `scripts/generate-story-tests.js`

**Purpose**: Generates Vitest test files from Storybook stories

**Location**: `packages/template/scripts/generate-story-tests.js`

**What it does:**
- Recursively scans `src/components/` and `src/extensions/*/components/` for `*.stories.tsx` files
- **For extensions**: Only includes story files from `components/` folders within each extension
- **Excludes `src/components/ui/`**: Skips all story files in the `ui` folder (shadcn components are excluded from test generation)
- Generates corresponding test files in `.storybook/tests/generated-stories/`
- Uses `composeStories` to create testable story components
- Each generated test:
  - Renders the story component wrapped in `StoryTestWrapper`
  - Executes the story's `play()` function if present
  - Uses a 20-second timeout for async interactions
- Reports the number of skipped files from the `ui` folder

**Output**: Test files named `{component-path}__{story-name}.story.test.tsx`

**Usage**:
```bash
node scripts/generate-story-tests.js
# (also runs automatically as part of `pnpm storybook:test --type=snapshot --coverage`)
```

### `scripts/storyCoverageReport.js`

**Purpose**: Generates comprehensive story and code coverage reports

**Location**: `packages/template/scripts/storyCoverageReport.js`

**What it does:**
- Scans `src/components/` and `src/extensions/*/components/` for all component files (`*.tsx`)
- **For extensions**: Only includes components from `components/` folders within each extension
- Identifies matching story files in `stories/` subdirectories (stories MUST be in `stories/` folders)
- Calculates story coverage percentage
- Merges Vitest code coverage data (if available)
- Generates:
  - JSON summary: `.storybook/coverage/storybook-component-coverage.json`
  - Markdown report: `.storybook/coverage/storybook-component-coverage.md`

**Configuration:**
- **Components directories**: `src/components/` and `src/extensions/*/components/`
- **Output directory**: `.storybook/coverage/`
- **Excluded folders**: `src/components/ui/` (shadcn components - excluded from test generation and coverage)
- **Excluded components**: Defined in `EXCLUDED_COMPONENTS` constant (icons, internal sub-components)
- **Vitest coverage path**: `.storybook/coverage/coverage-vitest/coverage-summary.json`

**Usage**:
```bash
node scripts/storyCoverageReport.js
```

**Combined usage** (for CI):
```bash
pnpm storybook:test --type=snapshot --coverage
# This runs:
# 1. node scripts/generate-story-tests.js
# 2. vitest run --coverage --config .storybook/vite.config.ts
# Then:
node scripts/storyCoverageReport.js
```

## Summary

The story coverage and code quality enforcement system provides:

✅ **Automated coverage tracking** on every PR  
✅ **Dual metrics**: Story coverage + Code coverage  
✅ **Visual badges** for quick status assessment  
✅ **Artifact storage** for detailed analysis  
✅ **Standardized structure**: Stories must be in `stories/` subdirectories  
✅ **Configurable exclusions** for components that don't need stories  

This ensures that component documentation (via Storybook) and test coverage remain high quality throughout the development lifecycle.
