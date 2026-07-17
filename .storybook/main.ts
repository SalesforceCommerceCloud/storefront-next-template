import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve, sep } from 'node:path';
import { existsSync, globSync } from 'node:fs';
import type { StorybookConfig } from '@storybook/react-vite';
import type { InlineConfig, Plugin } from 'vite';

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url)); // .storybook
const SRC_DIR = `${CONFIG_DIR}/../src`;

/**
 * Active vertical (`fashion` when unset), mirroring the dev/build scripts, the
 * vertical-first Vite resolver, and the runtime `verticalPublicOverlay()` plugin.
 * Only this vertical's overlay stories load; other verticals stay out of the
 * sidebar.
 *
 * @env VERTICAL - optional; `fashion` | `cosmetic`. Defaults to `fashion`.
 */
const VERTICAL = process.env.VERTICAL || 'fashion';

/** Turn an absolute story path into a `../`-prefixed specifier relative to `.storybook`. */
function toSpecifier(absPath: string): string {
    const rel = relative(CONFIG_DIR, absPath).split(sep).join('/');
    return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Build the story list with vertical awareness.
 *
 * Canonical `src/` stories load, minus `src/verticals/`. The active vertical's
 * overlay stories load too, and each one *replaces* the canonical story it shadows
 * (same path with the `verticals/<vertical>/` segment removed) — so a vertical that
 * re-titles a component to its canonical title (e.g. `Cosmetic/Logo` → `Layout/Logo`)
 * doesn't collide with the canonical twin. Overlays without a canonical twin are
 * pure additions. In the flattened customer artifact there is no `src/verticals/`,
 * so overlays fold into canonical paths and this degrades to a plain `src/` glob.
 */
function buildStoryList(): string[] {
    const rels = [
        ...globSync('**/*.stories.ts', { cwd: SRC_DIR }),
        ...globSync('**/*.stories.tsx', { cwd: SRC_DIR }),
    ].map((p) => p.split(sep).join('/'));

    const overlayPrefix = `verticals/${VERTICAL}/`;
    const canonical = new Set(rels.filter((p) => !p.startsWith('verticals/')));

    for (const overlay of rels.filter((p) => p.startsWith(overlayPrefix))) {
        canonical.delete(overlay.slice(overlayPrefix.length)); // drop the shadowed twin
        canonical.add(overlay); // overlay wins
    }

    return [...canonical].sort().map((rel) => toSpecifier(`${SRC_DIR}/${rel}`));
}

/**
 * Static asset dirs served at the Storybook web root, mirroring the runtime
 * `verticalPublicOverlay()` Vite plugin used by `pnpm dev`/`pnpm build`. Stories
 * that reference `/images/...` as a *runtime URL* — a plain string prop or raw
 * `<img src>` HTML, not a Vite `import` — need the file physically served, because
 * those references never pass through the `resolveVerticalPublic` module alias in
 * `.storybook/vite.config.ts`.
 *
 * Canonical `public/` is listed first, then the active vertical's `public/`; on
 * path collision the later entry wins, so vertical assets override canonical
 * (matching the plugin's "vertical wins" semantics). The vertical dir is only
 * added when it exists — in the flattened customer artifact there is no
 * `src/verticals/`, so this degrades to serving canonical `public/` alone.
 */
function buildStaticDirs(): string[] {
    const dirs = [`${CONFIG_DIR}/../public`];
    const verticalPublic = resolve(CONFIG_DIR, `../src/verticals/${VERTICAL}/public`);
    if (existsSync(verticalPublic)) dirs.push(verticalPublic);
    return dirs;
}

const config: StorybookConfig = {
    staticDirs: buildStaticDirs(),
    // Plain array (not a function): `buildStoryList()` is synchronous, and the
    // Storybook test-runner statically reads `main.stories` and rejects a
    // function form (its `.length` is the param count → 0 → "Could not find
    // stories"). An array keeps both the builder and the test-runner happy.
    stories: [...buildStoryList(), '../src/**/*.mdx'],
    addons: [
        getAbsolutePath('@chromatic-com/storybook'),
        getAbsolutePath('@storybook/addon-docs'),
        getAbsolutePath('@storybook/addon-a11y'),
        getAbsolutePath('@storybook/addon-vitest'),
    ],
    core: {
        builder: {
            name: '@storybook/builder-vite',
            options: {
                viteConfigPath: '.storybook/vite.config.ts', // Use dedicated Storybook Vite config
            },
        },
    },
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    typescript: {
        reactDocgen: 'react-docgen-typescript',
        reactDocgenTypescriptOptions: {
            compilerOptions: {
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
            },
            // Exclude node_modules from prop tables
            propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
        },
    },
    async viteFinal(inlineConfig: InlineConfig): Promise<InlineConfig> {
        // Remove project-specific plugins that conflict with Storybook
        inlineConfig.plugins = inlineConfig.plugins?.filter((plugin) => {
            const pluginName = (plugin as Plugin)?.name || '';
            return ![
                'react-router',
                'storefront-next-dev',
                'transform-require-node-fetch',
                'vite-plugin-devtools-json',
            ].some((name) => pluginName.includes(name));
        });

        // Preserve server configuration for HMR (don't delete it)
        // Only remove proxy configuration if it exists, but keep HMR settings
        if (inlineConfig.server) {
            // Remove proxy config but keep HMR
            const { proxy, ...serverConfig } = inlineConfig.server as Record<string, unknown>;
            inlineConfig.server = {
                ...serverConfig,
                hmr: {
                    ...(serverConfig.hmr as Record<string, unknown>),
                    overlay: true,
                },
            } as typeof inlineConfig.server;
        }

        // Remove project-specific test configuration
        delete (inlineConfig as InlineConfig & { test?: unknown }).test;

        // Define process.env variables for browser environment
        // These are needed by config.server.ts which is imported in stories

        // Default mock values for required Commerce API config when not set
        const mockDefaults: Record<string, string> = {
            PUBLIC__app__commerce__api__clientId: 'storybook-mock-client-id',
            PUBLIC__app__commerce__api__organizationId: 'storybook-mock-org',
            PUBLIC__app__defaultSiteId: 'RefArchGlobal',
            PUBLIC__app__commerce__api__shortCode: 'kv7kzm78',
            PUBLIC__app__commerce__api__proxy: '/mobify/proxy/api',
            PUBLIC__app__commerce__api__callback: '/callback',
            PUBLIC__app__commerce__api__privateKeyEnabled: 'false',
            PUBLIC__app__i18n__fallbackLng: 'en-GB',
            PUBLIC__app__features__socialLogin__providers: '["Apple","Google"]',
            PUBLIC__app__features__passwordlessLogin__callbackUri: '/passwordless-login-callback',
            PUBLIC__app__features__passwordlessLogin__landingUri: '/passwordless-login-landing',
            PUBLIC__app__features__resetPassword__callbackUri: '/reset-password-callback',
            PUBLIC__app__features__resetPassword__landingUri: '/reset-password-landing',
        };

        // Automatically inject all PUBLIC__ environment variables
        const publicEnvVars = Object.entries(process.env)
            .filter(([key]) => key.startsWith('PUBLIC__'))
            .reduce(
                (acc, [key, value]) => {
                    acc[`process.env.${key}`] = JSON.stringify(value || mockDefaults[key] || '');
                    return acc;
                },
                {} as Record<string, string>
            );

        // Add mock defaults for any PUBLIC__ vars that weren't set in environment
        Object.entries(mockDefaults).forEach(([key, defaultValue]) => {
            const envKey = `process.env.${key}`;
            if (!publicEnvVars[envKey]) {
                publicEnvVars[envKey] = JSON.stringify(defaultValue);
            }
        });

        inlineConfig.define = {
            ...inlineConfig.define,
            ...publicEnvVars,
            // Non-config specific Storybook variables
            'process.env.STORYBOOK_A11Y_TEST_MODE': JSON.stringify(process.env.STORYBOOK_A11Y_TEST_MODE || 'todo'),
            'process.env.STORYBOOK_DISABLE_A11Y': JSON.stringify(process.env.STORYBOOK_DISABLE_A11Y || 'false'),
        };

        return inlineConfig;
    },
};

export default config;

function getAbsolutePath(value: string): any {
    return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
