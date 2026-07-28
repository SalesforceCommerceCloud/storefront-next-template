import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type { StorybookConfig } from '@storybook/react-vite';
import type { InlineConfig, Plugin } from 'vite';

const config: StorybookConfig = {
    staticDirs: ['../public'],
    // Plain array (not a function): the Storybook test-runner statically
    // reads `main.stories` and rejects a function form (its `.length` is the
    // param count → 0 → "Could not find stories").
    stories: ["../src/**/*.stories.@(ts|tsx)", "../src/**/*.mdx"],
    addons: [getAbsolutePath("@chromatic-com/storybook"), getAbsolutePath("@storybook/addon-docs"), getAbsolutePath("@storybook/addon-a11y"), getAbsolutePath("@storybook/addon-vitest")],
    core: {
        builder: {
            name: "@storybook/builder-vite",
            options: {
                viteConfigPath: '.storybook/vite.config.ts', // Use dedicated Storybook Vite config
            },
        },
    },
    framework: {
        name: "@storybook/react-vite",
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
            propFilter: (prop) =>
                prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
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
            'PUBLIC__app__commerce__api__clientId': 'storybook-mock-client-id',
            'PUBLIC__app__commerce__api__organizationId': 'storybook-mock-org',
            'PUBLIC__app__defaultSiteId': 'RefArchGlobal',
            'PUBLIC__app__commerce__api__shortCode': 'kv7kzm78',
            'PUBLIC__app__commerce__api__proxy': '/mobify/proxy/api',
            'PUBLIC__app__commerce__api__callback': '/callback',
            'PUBLIC__app__commerce__api__privateKeyEnabled': 'false',
            'PUBLIC__app__i18n__fallbackLng': 'en-GB',
            'PUBLIC__app__features__socialLogin__providers': '["Apple","Google"]',
            'PUBLIC__app__features__passwordlessLogin__callbackUri': '/passwordless-login-callback',
            'PUBLIC__app__features__passwordlessLogin__landingUri': '/passwordless-login-landing',
            'PUBLIC__app__features__resetPassword__callbackUri': '/reset-password-callback',
            'PUBLIC__app__features__resetPassword__landingUri': '/reset-password-landing',
        };

        // Automatically inject all PUBLIC__ environment variables
        const publicEnvVars = Object.entries(process.env)
            .filter(([key]) => key.startsWith('PUBLIC__'))
            .reduce((acc, [key, value]) => {
                acc[`process.env.${key}`] = JSON.stringify(value || mockDefaults[key] || '');
                return acc;
            }, {} as Record<string, string>);

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
