import { defineConfig } from 'tsdown';

/**
 * Build configurations for @salesforce/storefront-next-runtime:
 * design - design layer module with component registry and React components
 * scapi - SCAPI client module with type-safe API clients
 */
export default defineConfig([
    // design module entry
    {
        entry: {
            design: 'src/design/index.ts',
            'design-messaging': 'src/design/messaging-api/index.ts',
            'design-react': 'src/design/react/index.ts',
            'design-data': 'src/design/data/index.ts',
            // Minimal entry point for checking whether we are in design mode
            // Won't bring in the rest of the design layer dependencies.
            'design-mode': 'src/design/modeDetection.ts',
            'design-react-core': 'src/design/react/core/index.ts',
            config: 'src/config/index.ts',
            'config-load': 'src/config/load-config.ts',
            env: 'src/env/index.ts',
            events: 'src/events/index.ts',
            'data-store': 'src/data-store/index.ts',
            'site-context': 'src/site-context/index.ts',
            routing: 'src/routing/index.ts',
            'routing-app-wrapper': 'src/routing/app-wrapper.tsx',
            workspace: 'src/workspace/index.ts',
            i18n: 'src/i18n/index.ts',
            security: 'src/security/index.ts',
            otel: 'src/otel/index.ts',
        },
        platform: 'neutral',
        target: 'node24',
        format: ['esm'],
        dts: true,
        outDir: 'dist',
        clean: true,
        external: ['node:fs', 'node:fs/promises', 'node:path', 'node:url', 'node:crypto', 'jiti'],
        alias: {
            '@/*': 'src/*',
        },
        hash: false,
    },
    // i18n client entry (browser-only — includes i18next-browser-languagedetector)
    {
        entry: {
            'i18n-client': 'src/i18n/client.ts',
        },
        platform: 'browser',
        format: ['esm'],
        dts: true,
        outDir: 'dist',
        clean: false,
        external: [/node_modules/],
        hash: false,
    },
    // security/react entry (browser-safe — React Context only, no node:crypto/zod)
    {
        entry: {
            'security-react': 'src/security/react.ts',
        },
        platform: 'browser',
        format: ['esm'],
        dts: true,
        outDir: 'dist',
        clean: false,
        external: [/node_modules/],
        hash: false,
    },
    // scapi module entry
    {
        entry: {
            scapi: 'src/scapi-client/index.ts',
        },
        platform: 'neutral',
        target: 'node24',
        format: ['esm'],
        dts: true,
        outDir: 'dist',
        clean: true,
        minify: true,
        noExternal: ['openapi-fetch'],
        hash: false,
    },
]);
