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

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createStorefrontStylesheetLink, PreloadResources } from './preload';

describe('PreloadResources', () => {
    it('uses modulepreload only for scripts and stylesheet for CSS', () => {
        const { container } = render(
            <PreloadResources
                resources={[
                    { kind: 'module', href: 'data:text/javascript,export{}' },
                    { kind: 'style', href: 'data:text/css,.hero{}' },
                ]}
            />
        );
        expect(document.head.querySelector('link[rel="modulepreload"]')?.getAttribute('href')).toBe(
            'data:text/javascript,export{}'
        );
        expect(document.head.querySelector('link[rel="modulepreload"]')?.getAttribute('crossorigin')).toBe('anonymous');
        expect(container.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('data:text/css,.hero{}');
    });

    it('creates application stylesheet descriptors in the storefront precedence group', () => {
        expect(createStorefrontStylesheetLink('/route.css')).toEqual({
            rel: 'stylesheet',
            href: '/route.css',
            precedence: 'storefront',
        });
    });
});
