# @salesforce/storefront-next-dev

Vite plugin and deployment tools for Storefront Next integration with React Router v7.

## Features

### Vite Plugin

- 🚀 **SSR** support with Vite v7
- 🛣️ **React Router v7** integration with React Router as the framework
- 🛒 **B2C Commerce API** proxying for development
- 📦 **Built-in entry files** for SSR and browser environments
- ☁️ **Managed Runtime Optimization** for Salesforce B2C Commerce deployment environment

### CLI & Deployment Tools

- **Feature Extension Management**: Keep or remove features from a template
- **Extension LLM Instructions**: Generate LLM instructions for installing a feature
- **Bundle Creation**: Creates TAR archives from React Router build directories
- **Deployment**: Pushes bundles to Managed Runtime
- **Cartridge Generation**: Generate cartridge from decorated components, page types, aspects
- **Cartridge Deployment**: Deploy cartridges to B2C Commerce
- **Workspace Integration**: Seamlessly works within pnpm workspaces
- **Automatic Configuration**: Intelligent file detection from build directory structure
- **TypeScript**: Written in modern TypeScript with full type safety
- **Clean API**: Minimal, focused public API with only essential exports
- **Modern Tooling**: Built with tsdown for fast compilation
- **Native APIs**: Uses Node.js 18+ built-in fetch (no external HTTP dependencies)

## Installation

```bash
pnpm add @salesforce/storefront-next-dev
```

## Usage

### Vite Plugin

Add the plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import storefrontNextPlugin from '@salesforce/storefront-next-dev';

export default defineConfig({
    plugins: [
        storefrontNextPlugin({
            readableChunkNames: false, // optional
        }),
    ],
});
```

### React Router Preset

Use the React Router preset in your `react-router.config.ts`:

```typescript
import type { Config } from '@react-router/dev/config';
import { storefrontNextPreset } from '@salesforce/storefront-next-dev/react-router-preset';

export default {
    presets: [storefrontNextPreset()],
} satisfies Config;
```

### CLI Commands

#### Create storefront

```bash
# Create storefront
pnpm dlx @salesforce/storefront-next-dev create-storefront
```

#### Push bundle

```bash
# Push bundle
pnpm sfnext push --project-directory /path/to/your/project --project mrt-project-id --environment mrt-target-environment

# Push bundle and wait for deployment
pnpm sfnext push --project-directory /path/to/your/project --project mrt-project-id --environment mrt-target-environment --wait

# Push with custom message
pnpm sfnext push --project-directory /path/to/your/project --project mrt-project-id --environment mrt-target-environment --message "Release v1.2.3"

# Push without deployment (upload only)
pnpm sfnext push --project-directory /path/to/your/project --project mrt-project-id

# With custom build directory
pnpm sfnext push --project-directory /path/to/your/project --build-directory /custom/build/path --project mrt-project-id --environment mrt-target-environment
```

#### Generate extension instructions

```bash
# Generate extension instructions
pnpm sfnext create-instructions --project-directory /path/to/your/project --extension-config /path/to/extension/config/file --extension SFDC_EXT_STORE_LOCATOR --template-repo https://github.com/SalesforceCommerceCloud/storefront-next-template.git --branch main --files /path/to/your/new/extension/files --output-dir /path/to/instruction/files
```

#### Cartridge generation and deployment instructions

Run these commands from your project directory:

```bash
# Generate cartridge metadata for your site
pnpm sfnext generate-cartridge

# Deploy generated metadata to B2C Commerce (uses dw.json for all settings)
pnpm sfnext deploy-cartridge
```

## CLI Options

#### Push bundle

Run `pnpm sfnext push --help` to see all available options:

- `-b, --build-directory <dir>`: Build directory to push (default: auto-detected)
- `-m, --message <message>`: Bundle message (default: git branch:commit)
- `-p, --project <slug>`: Project slug - the unique identifier for your project on Managed Runtime
- `-e, --environment <target>`: Deploy target environment on Managed Runtime
- `-w, --wait`: Wait for deployment to complete
- `--cloud-origin <origin>`: API origin (default: https://cloud.mobify.com)
- `--credentials-file <file>`: Credentials file location
- `--api-key <api-key>`: MRT API key

Backward compatibility:

- `--project-slug` is supported as a deprecated alias for `--project`
- `--target` is supported as a deprecated alias for `--environment`
- `MRT_PROJECT` and `MRT_TARGET` are supported as fallback env vars for `project` and `environment`

#### Manage extensions

Run `pnpm sfnext extensions list` to view the list of installed extensions

- `-d, --project-directory`: Target project directory (default: current directory)

Run `pnpm sfnext extensions install` to install a new extension

- `-d, --project-directory`: Target project directory (default: current directory)
- `-e, --extension`: Extension marker value (e.g. SFDC_EXT_STORE_LOCATOR)
- `-s, --source-git-url`: Git URL of the source template project (default: "https://github.com/SalesforceCommerceCloud/storefront-next-template.git")
- `-v, --verbose`: Verbose mode

Run `pnpm sfnext extensions remove` to remove existing extensions

- `-d, --project-directory`: Target project directory (default: current directory)
- `-e, --extensions`: Comma-separated list of extension marker values (e.g. SFDC_EXT_STORE_LOCATOR,SFDC_EXT_BOPIS)
- `-v, --verbose`: Verbose mode

Run `pnpm sfnext extensions create` to create a new extension scaffolding

- `-p, --project-directory`: Target project directory (default: current directory)
- `-n, --name`: New extension name (e.g., Store Locator)
- `-d, --description`: Description for the extension

#### Generate extension instructions

Run `pnpm sfnext create-instructions --help` to see all available options:

- `-d, --project-directory <dir>`: Project directory
- `-c, --extension-config <config>`: Extension config JSON file location
- `-e, --extension <extension>`: Extension marker value (e.g. SFDC_EXT_featureA)
- `-p, --template-repo <repo>`: Storefront template repo URL (default: https://github.com/SalesforceCommerceCloud/storefront-next-template.git)
- `-b, --branch <branch>`: PWA repo branch (default: main)
- `-f, --files <files...>`: Specific files to include (relative to project directory)
- `-o, --output-dir <dir>`: Output directory (default: ./instructions)

## Configuration

### Automatic Configuration

sfnext uses automatic configuration that detects and configures files from your build directory:

- **Server files** (`ssr_only`): Files from `build/server/` directory plus `loader.js`, `ssr.js`
- **Client files** (`ssr_shared`): Files from `build/client/` directory plus static assets
- **Static patterns**: Common asset types (CSS, images, fonts)

### Default Configuration Details

The tool automatically generates the following configuration:

```json
{
    "ssrParameters": {
        "ssrFunctionNodeVersion": "24.x"
    },
    "ssrOnly": ["loader.js", "streamingHandler.mjs", "server/**/*", "!static/**/*"],
    "ssrShared": ["client/**/*", "static/**/*", "**/*.css", "**/*.png", "**/*.jpg", "**/*.svg", "**/*.ico"]
}
```

Response streaming is enabled by default for bundles pushed to MRT. To change this, export `MRT_BUNDLE_TYPE=ssr` during a push command (e.g. `MRT_BUNDLE_TYPE=ssr pnpm push ...`)

### Key Configuration Options

- **`ssrParameters`**: Runtime configuration (Node.js version, etc.)
- **`ssrOnly`**: Files only available on server (not CDN)
- **`ssrShared`**: Files available on both server and CDN
- **Patterns**: Use glob patterns with `!` for exclusions

## Authentication

### Deploy Cartridge Command Authentication

For cartridge deployment to B2C Commerce, configure B2C settings in `dw.json` (or pass flags directly):

1. **dw.json file** (recommended):

    ```json
    {
        "username": "your-username@salesforce.com",
        "password": "your-web-access-key",
        "hostname": "your-instance.dx.commercecloud.salesforce.com",
        "code-version": "code-version-from-instance-BM"
    }
    ```

2. **Authentication**: `sfnext deploy-cartridge` resolves instance settings from SDK config sources (`dw.json`, env vars, flags, instance selection) and supports WebDAV basic auth or OAuth credentials.

### Cartridge Commands

The cartridge commands are independent tools for working with B2C Commerce metadata:

**Generate Cartridge**: `generate-cartridge` scans your project for decorated components and creates metadata files

- Scans `src/` directory for `@Component`, `@PageType`, and `@Aspect` decorators
- Generates JSON metadata files in `cartridge/cartridge/experience/` directory
- Creates separate files for components, page types, and aspects

**Deploy Metadata**: `deploy-cartridge` uploads metadata directories to B2C Commerce

- Uploads mapped cartridges through `@salesforce/b2c-tooling-sdk`
- Uses the configured code version and credentials from resolved SDK config

**Automatic Cartridge Generation and Deployment on Push**

You can configure the tool to automatically generate and deploy cartridge metadata before an MRT push. This keeps your Page Designer metadata in sync with component changes.

To enable automatic cartridge generation and deployment:

1. Open `storefront-next-dev/dist/config.js`
2. Change `GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH` from `false` to `true`:

```javascript
// In config.ts or config.js
export const GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH = true; // Set to true to enable
```

**Default:** `false` (manual cartridge generation/deployment via `sfnext generate-cartridge` and `sfnext deploy-cartridge`)

**Prerequisites:**

- A valid B2C configuration must be available via SDK config resolution (for example `dw.json`, env vars, or CLI flags)

When enabled, before each `pnpm sfnext push` command:

1. Cartridge metadata will be automatically generated from decorated components
2. The cartridge will be automatically deployed to B2C Commerce
3. The MRT push will proceed as normal

If generation or deployment fails:

- A warning is displayed with manual command suggestions
- The MRT push still succeeds (cartridge errors don't block deployments)

You can still run `pnpm sfnext generate-cartridge` and `pnpm sfnext deploy-cartridge` manually at any time.

> **Note:** This feature is designed for development workflows where you want to keep Page Designer metadata in sync with your deployments. For production CI/CD pipelines, consider running `sfnext generate-cartridge` and `sfnext deploy-cartridge` as separate, explicit steps for better control and error handling.

## Credentials

Set up credentials in one of these ways:

1. **Credentials file** (recommended): `~/.mobify`

    ```json
    {
        "username": "your-email@example.com",
        "api_key": "your-api-key"
    }
    ```

2. **Command line flags**: Use `--api-key` and optionally `--credentials-file` (see CLI Options section)

Get your credentials at: https://runtime.commercecloud.com/account/settings

## Bundle Structure

The tool creates bundles with the following structure:

- **TAR Archive**: Contains all build files prefixed with `[projectSlug]/bld/`
- **File Distribution**:
    - `ssr_only`: Files only on server (not CDN) - includes server-side code
    - `ssr_shared`: Files on both server and CDN - includes client assets
- **Metadata**: Dependencies and B2C Commerce overrides

## Subpath Exports

For optimal tree-shaking, use subpath exports:

- `@salesforce/storefront-next-dev` - Vite plugin (default export)
- `@salesforce/storefront-next-dev/react-router-preset` - React Router preset
- `@salesforce/storefront-next-dev/react-router/Scripts` - React Router Scripts component
