import { defineConfig } from 'tsdown';

/**
 * Build configurations for @salesforce/storefront-next-dev:
 * 1. Vite plugin (main entry) - imported from vite.config.ts
 * 2. React Router Scripts - exported for use in react-router apps
 * 3. MRT SSR server - bundles express server and AWS lambda handler
 * 4. React Router preset config - exported for use in react-router.config.ts
 * 5. Cartridge services API - programmatic API for cartridge management
 * 6. CLI - command-line tool for deployment and extension management
 * 7a. Server entry composition - platform server entry wrapper (Node.js)
 * 7b. Client entry composition - platform client entry wrapper (browser)
 */
export default defineConfig([
    // 1. Main Vite plugin entry (default export)
    {
        entry: {
            index: 'src/index.ts',
        },
        platform: 'node',
        target: 'node24',
        format: ['esm'],
        dts: true,
        outDir: 'dist',
        clean: true,
        // Don't bundle dependencies - they should be installed by consumers
        external: [/node_modules/],
        hash: false,
    },
    // 1b. Public logger subpath export
    {
        entry: {
            index: 'src/logger.ts',
        },
        platform: 'node',
        target: 'node24',
        format: ['esm'],
        dts: true,
        outDir: 'dist/logger',
        clean: false,
        external: [/node_modules/],
        hash: false,
    },
    // 2. React Router Scripts component
    {
        entry: {
            Scripts: 'src/react-router/Scripts.tsx',
        },
        platform: 'neutral',
        format: ['esm'],
        dts: true,
        outDir: 'dist/react-router',
        clean: false,
        external: [/node_modules/],
        hash: false,
    },
    // 3a. MRT SSR server build
    {
        entry: {
            ssr: 'src/mrt/ssr.ts',
        },
        platform: 'node',
        target: 'node24',
        format: ['esm'],
        outExtensions: () => {
            return {
                js: '.mjs',
                dts: '.d.ts',
            };
        },
        // We use a custom chunk file name so we can identify our own shared chunks
        // vs customer's chunks.
        outputOptions: {
            chunkFileNames: 'sfnext-server-[name]-[hash].mjs',
        },
        dts: true,
        outDir: 'dist/mrt',
        // This is the react-router server build entry point, it is created from the user land when running `vite build`
        // it is a relative path from within the build directory
        external: ['./server/index.js', 'vite'],
        noExternal: [/.*/],
        clean: false,
        hash: false,
        minify: true,
        sourcemap: true,
    },
    // 3b. MRT streamingHandler build
    {
        entry: {
            streamingHandler: 'src/mrt/streamingHandler.ts',
        },
        platform: 'node',
        target: 'node24',
        format: ['esm'],
        outExtensions: () => {
            return {
                js: '.mjs',
                dts: '.d.ts',
            };
        },
        // We use a custom chunk file name so we can identify our own shared chunks
        // vs customer's chunks.
        outputOptions: {
            chunkFileNames: 'sfnext-server-[name]-[hash].mjs',
        },
        dts: true,
        outDir: 'dist/mrt',
        // This is the react-router server build entry point, it is created from the user land when running `vite build`
        // it is a relative path from within the build directory
        external: ['./server/index.js', 'vite'],
        noExternal: [/.*/],
        clean: false,
        hash: false,
        minify: true,
        sourcemap: true,
    },
    // 4. React Router preset config
    {
        entry: {
            'react-router.config': 'src/configs/react-router.config.ts',
        },
        platform: 'node',
        target: 'node24',
        format: ['esm'],
        dts: true,
        outDir: 'dist/configs',
        clean: false,
        external: [/node_modules/],
        hash: false,
    },
    // 5. Cartridge services API
    {
        entry: {
            index: 'src/cartridge-services/index.ts',
        },
        platform: 'node',
        target: 'node24',
        format: ['esm'],
        dts: true,
        outDir: 'dist/cartridge-services',
        clean: false,
        external: [/node_modules/],
        hash: false,
    },
    // 6. oclif commands build
    {
        entry: {
            // Top-level commands
            'commands/create-storefront': 'src/commands/create-storefront.ts',
            'commands/create-instructions': 'src/commands/create-instructions.ts',
            'commands/dev': 'src/commands/dev.ts',
            'commands/preview': 'src/commands/preview.ts',
            'commands/prepare-local': 'src/commands/prepare-local.ts',
            // Legacy CLI commands (root level)
            'commands/push': 'src/commands/push.ts',
            'commands/create-bundle': 'src/commands/create-bundle.ts',
            'commands/generate-cartridge': 'src/commands/generate-cartridge.ts',
            'commands/deploy-cartridge': 'src/commands/deploy-cartridge.ts',
            'commands/validate-cartridge': 'src/commands/validate-cartridge.ts',
            // Config commands
            'commands/config/inspect': 'src/commands/config/inspect.ts',
            'commands/config/aggregate-extensions': 'src/commands/config/aggregate-extensions.ts',
            // Extensions commands
            'commands/extensions/list': 'src/commands/extensions/list.ts',
            'commands/extensions/install': 'src/commands/extensions/install.ts',
            'commands/extensions/remove': 'src/commands/extensions/remove.ts',
            'commands/extensions/create': 'src/commands/extensions/create.ts',
            // SCAPI custom client commands
            'commands/scapi/add': 'src/commands/scapi/add.ts',
            'commands/scapi/available': 'src/commands/scapi/available.ts',
            'commands/scapi/list': 'src/commands/scapi/list.ts',
            'commands/scapi/remove': 'src/commands/scapi/remove.ts',
            // Locales commands
            'commands/locales/aggregate-extensions': 'src/commands/locales/aggregate-extensions.ts',
            // oclif hooks
            'hooks/init': 'src/hooks/init.ts',
        },
        platform: 'node',
        target: 'node24',
        format: ['esm'],
        minify: false,
        dts: false,
        outDir: 'dist',
        copy: [
            {
                from: 'src/extensibility/templates',
                to: 'dist/extensibility/templates',
            },
        ],
        clean: false,
        external: [/node_modules/],
        hash: false,
    },
    // 7a. Server entry composition (runs in Node.js)
    {
        entry: {
            server: 'src/entry/server.ts',
        },
        platform: 'node',
        target: 'node24',
        format: ['esm'],
        dts: true,
        outDir: 'dist/entry',
        clean: false,
        external: [/node_modules/],
        hash: false,
    },
    // 7b. Client entry composition (runs in the browser)
    {
        entry: {
            client: 'src/entry/client.ts',
        },
        platform: 'browser',
        format: ['esm'],
        dts: true,
        outDir: 'dist/entry',
        clean: false,
        external: [/node_modules/],
        hash: false,
    },
]);
