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
import { describe, expect, it, vi } from 'vitest';
import { matchRoutes, type RouteObject } from 'react-router';
import { matchCompiledRoute, type CompiledRouteMetadata } from './compiled-routes';

const tree: RouteObject[] = [
    {
        id: 'root',
        path: '',
        children: [
            {
                id: 'layout',
                children: [
                    { id: 'home', index: true },
                    { id: 'optional', path: ':site/:locale?/cart/:id?' },
                    { id: 'sensitive', path: 'Exact', caseSensitive: true },
                    { id: 'first', path: 'same/:id' },
                    { id: 'second', path: 'same/:name' },
                    { id: 'resource', path: 'resource/*' },
                    { id: 'fallback', path: '*' },
                ],
            },
        ],
    },
];

function flatten(
    routes: RouteObject[],
    parentId?: string,
    result: Record<string, CompiledRouteMetadata> = {}
): Record<string, CompiledRouteMetadata> {
    for (const route of routes) {
        if (!route.id) throw new Error('Missing fixture ID');
        result[route.id] = {
            id: route.id,
            parentId,
            path: route.path,
            index: route.index,
            caseSensitive: route.caseSensitive,
            isDocument: route.id !== 'resource',
        };
        if (route.children) flatten(route.children, route.id, result);
    }
    return result;
}

describe('matchCompiledRoute', () => {
    it.each([
        '/',
        '/RefArch/cart',
        '/RefArch/en-US/cart/a%2Fb',
        '/Exact',
        '/exact',
        '/same/a',
        '/resource/a%20b/c',
        '/unknown',
        '/RefArch/en-US/cart/%E0%A4%A',
    ])('preserves React Router matching for %s', (pathname) => {
        const routes = flatten(tree);
        const expected = matchRoutes(tree, pathname)?.at(-1);
        const actual = matchCompiledRoute(routes, pathname);
        expect(actual?.metadata.id).toBe(expected?.route.id);
        expect(actual?.params).toEqual(expected?.params);
        expect(actual?.metadata).toBe(expected?.route.id ? routes[expected.route.id] : undefined);
    });

    it('caches by routes identity and applies basename on each call', () => {
        const source = flatten(tree);
        const enumerate = vi.fn(() => Object.keys(source));
        const routes = new Proxy(source, { ownKeys: enumerate });
        expect(matchCompiledRoute(routes, '/base/Exact', '/base')?.metadata.id).toBe('sensitive');
        expect(matchCompiledRoute(routes, '/other/Exact', '/other')?.metadata.id).toBe('sensitive');
        expect(enumerate).toHaveBeenCalledTimes(1);
        const replaced = { ...source, sensitive: { ...source.sensitive, path: 'Changed' } };
        expect(matchCompiledRoute(replaced, '/Changed')?.metadata.id).toBe('sensitive');
        expect(matchCompiledRoute(routes, '/Exact')?.metadata.id).toBe('sensitive');
        expect(matchCompiledRoute(routes, '/outside', '/base')).toBeNull();
    });
});
