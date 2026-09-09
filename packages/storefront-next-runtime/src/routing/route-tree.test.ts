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
import type { RouteConfigEntry } from '@react-router/dev/routes';
import { describe, expect, it, vi } from 'vitest';
import { visitRouteTree } from './route-tree';

describe('visitRouteTree', () => {
    it('visits every route depth-first with its resolved path', () => {
        const routes: RouteConfigEntry[] = [
            {
                id: 'layout',
                file: 'layout.tsx',
                path: 'shop',
                children: [
                    { id: 'product', file: 'product.tsx', path: 'product/:id' },
                    { id: 'absolute', file: 'absolute.tsx', path: '/resource/session' },
                ],
            },
        ];
        const visitor = vi.fn();

        visitRouteTree(routes, visitor);

        expect(visitor.mock.calls.map(([route, path]) => [route.id, path])).toEqual([
            ['layout', 'shop'],
            ['product', 'shop/product/:id'],
            ['absolute', 'resource/session'],
        ]);
    });

    it('inherits the parent path for pathless routes', () => {
        const visitor = vi.fn();

        visitRouteTree(
            [
                {
                    id: 'layout',
                    file: 'layout.tsx',
                    children: [{ id: 'index', file: 'index.tsx', index: true }],
                },
            ],
            visitor,
            'store'
        );

        expect(visitor.mock.calls.map(([route, path]) => [route.id, path])).toEqual([
            ['layout', 'store'],
            ['index', 'store'],
        ]);
    });
});
