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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, isRunnableDevEnvironment, normalizePath, type ViteDevServer } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { compiledRoutesPlugin } from './compiledRoutes';

let server: ViteDevServer | undefined;
let root: string | undefined;
afterEach(async () => {
    await server?.close();
    server = undefined;
    if (root) rmSync(root, { recursive: true, force: true });
});

async function start(environmentApi = false, serverBundles = false, initiallyDocument = false) {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'compiled-routes-')));
    symlinkSync(join(dirname(fileURLToPath(import.meta.url)), '../../node_modules'), join(root, 'node_modules'), 'dir');
    mkdirSync(join(root, 'app'));
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(join(root, 'vite.config.ts'), 'export default {};');
    writeFileSync(
        join(root, 'react-router.config.ts'),
        `export default { future: { v8_viteEnvironmentApi: ${environmentApi} },
            ${serverBundles ? 'serverBundles: () => "one",' : ''} };`
    );
    writeFileSync(join(root, 'app/root.tsx'), 'export default function Root() { return null; }');
    writeFileSync(
        join(root, 'app/entry.server.tsx'),
        'export default function handleRequest() { return new Response("ok"); }'
    );
    writeFileSync(join(root, 'app/entry.client.tsx'), 'export {};');
    writeFileSync(
        join(root, 'app/routes.ts'),
        'export default [{id:"document", path:"page", file:"page.tsx"}, {id:"resource", path:"resource", file:"resource.ts"}, {id:"error", path:"error", file:"error.tsx"}];'
    );
    writeFileSync(join(root, 'app/page.tsx'), 'export { default } from "./component";');
    writeFileSync(
        join(root, 'app/component.tsx'),
        'throw new Error("Route modules must not execute"); export default function Page() { return null; }'
    );
    writeFileSync(
        join(root, 'app/resource.ts'),
        `export function loader() { return "resource"; } ${initiallyDocument ? 'export default function Resource() { return null; }' : ''}`
    );
    writeFileSync(join(root, 'app/error.tsx'), 'export function ErrorBoundary() { return null; }');
    server = await createServer({
        root,
        configFile: join(root, 'vite.config.ts'),
        plugins: [reactRouter(), compiledRoutesPlugin()],
        server: { middlewareMode: true },
        optimizeDeps: { noDiscovery: true },
        logLevel: 'silent',
    });
    return server;
}

describe('compiled routes SDK virtual module', () => {
    it.each([
        { environmentApi: false, initiallyDocument: false },
        { environmentApi: false, initiallyDocument: true },
        { environmentApi: true, initiallyDocument: false },
        { environmentApi: true, initiallyDocument: true },
    ])('refreshes default-export metadata ($environmentApi, initially document: $initiallyDocument)', async ({
        environmentApi,
        initiallyDocument,
    }) => {
        const vite = await start(environmentApi, false, initiallyDocument);
        if (!root) throw new Error('Missing fixture root');
        const resourceFile = join(root, 'app/resource.ts');
        const resourceSource = 'export function loader() { return "resource"; }';
        const documentSource = `${resourceSource} export default function Resource() { return null; }`;
        const load = () => {
            if (!environmentApi) return vite.ssrLoadModule('virtual:storefront-next/compiled-routes');
            const environment = vite.environments.ssr;
            if (!isRunnableDevEnvironment(environment)) throw new Error('Missing runnable SSR environment');
            return environment.runner.import('virtual:storefront-next/compiled-routes');
        };
        const first = (await load()).default;
        expect(first.routes.root).toEqual({ id: 'root', path: '', isDocument: true });
        expect(first.routes.document).toMatchObject({ parentId: 'root', path: 'page', isDocument: true });
        expect(first.routes.resource.isDocument).toBe(initiallyDocument);
        expect(first.routes.error.isDocument).toBe(true);
        expect(first.routes.document).not.toHaveProperty('hasDefaultExport');
        // Keep every export flag RR compares unchanged: only hasDefaultExport changes.
        writeFileSync(resourceFile, initiallyDocument ? resourceSource : documentSource);
        await expect
            .poll(async () => (await load()).default.routes.resource.isDocument, { timeout: 10000 })
            .toBe(!initiallyDocument);
        const second = (await load()).default;
        expect(second).not.toBe(first);
        expect(first.routes.resource.isDocument).toBe(initiallyDocument);
        writeFileSync(resourceFile, initiallyDocument ? documentSource : resourceSource);
        await expect
            .poll(async () => (await load()).default.routes.resource.isDocument, { timeout: 10000 })
            .toBe(initiallyDocument);
        expect((await load()).default).not.toBe(second);
        expect(second.routes.resource.isDocument).toBe(!initiallyDocument);
    }, 30000);

    it('builds the adapter in a real React Router production server without a server-build cycle', async () => {
        const vite = await start(true);
        await vite.close();
        server = undefined;
        if (!root) throw new Error('Missing fixture root');
        writeFileSync(join(root, 'app/component.tsx'), 'export default function Page() { return null; }');
        writeFileSync(
            join(root, 'app/entry.server.tsx'),
            'import manifest from "virtual:storefront-next/compiled-routes"; export default function handleRequest() { return Response.json(manifest); }'
        );
        writeFileSync(
            join(root, 'vite.config.ts'),
            `import { reactRouter } from '@react-router/dev/vite';
             import { compiledRoutesPlugin } from ${JSON.stringify(fileURLToPath(new URL('./compiledRoutes.ts', import.meta.url)))};
             export default { plugins: [reactRouter(), compiledRoutesPlugin()] };`
        );
        const require = createRequire(import.meta.url);
        const cli = join(dirname(require.resolve('@react-router/dev/package.json')), 'bin.js');
        const result = spawnSync(process.execPath, [cli, 'build'], { cwd: root, encoding: 'utf8', timeout: 30000 });
        expect(result.status, result.stdout + result.stderr).toBe(0);
        const build = await import(/* @vite-ignore */ pathToFileURL(join(root, 'build/server/index.js')).href);
        const response = build.entry.module.default();
        expect((await response.json()).routes.resource.isDocument).toBe(false);
    }, 45000);

    it.each([
        false,
        true,
    ])('allows serverBundles until compiled-routes resolution (Environment API: %s)', async (environmentApi) => {
        const vite = await start(environmentApi, true);
        // Plugin users who never import the adapter can start and load server modules.
        expect((await vite.ssrLoadModule(join(vite.config.root, 'app/resource.ts'))).loader()).toBe('resource');
        await expect(
            vite.environments.ssr.pluginContainer.resolveId('virtual:storefront-next/compiled-routes')
        ).rejects.toThrow('serverBundles');
    }, 30000);

    it('rejects client imports and incompatible manifest shapes', async () => {
        const vite = await start();
        await expect(vite.pluginContainer.resolveId('virtual:storefront-next/compiled-routes')).rejects.toThrow(
            'server-only'
        );
        const broken = await createServer({
            configFile: false,
            plugins: [
                compiledRoutesPlugin(),
                {
                    name: 'bad-manifest',
                    resolveId: (id) => (id === 'virtual:react-router/server-manifest' ? '\0bad-manifest' : null),
                    load: (id) => (id === '\0bad-manifest' ? 'export default {routes: {root: {id:"root"}}}' : null),
                },
            ],
            server: { middlewareMode: true },
            logLevel: 'silent',
        });
        try {
            await expect(broken.ssrLoadModule('virtual:storefront-next/compiled-routes')).rejects.toThrow(
                'Unsupported React Router'
            );
        } finally {
            await broken.close();
        }
    }, 30000);

    it('reloads the server graph only when a route module changes', () => {
        const plugin = compiledRoutesPlugin();
        const configResolved = plugin.configResolved as (config: unknown) => void;
        configResolved({
            __reactRouterPluginContext: {
                reactRouterConfig: { appDirectory: '/app', routes: { home: { file: 'routes/home.tsx' } } },
            },
        });
        const send = vi.fn();
        const invalidateModule = vi.fn();
        const environment = {
            config: { consumer: 'server' },
            hot: { send },
            moduleGraph: { getModuleById: () => ({}), invalidateModule },
        };
        const hotUpdate = plugin.hotUpdate as unknown as (this: unknown, options: { file: string }) => void;
        hotUpdate.call({ environment }, { file: normalizePath(resolve('/app', 'components/button.tsx')) });
        expect(send).not.toHaveBeenCalled();
        hotUpdate.call({ environment }, { file: normalizePath(resolve('/app', 'routes/home.tsx')) });
        expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
    });
});
