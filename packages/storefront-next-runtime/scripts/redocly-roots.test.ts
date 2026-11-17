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

import { describe, expect, it } from 'vitest';

import { rewriteRoots } from './redocly-roots.ts';

const REDOCLY = ['root: ./a-oas-1.0.0/a.yaml', 'root: ./b-oas-2.0.0/b.yaml'].join('\n');

describe('rewriteRoots', () => {
    it('rewrites every named root and leaves the rest alone', () => {
        const result = rewriteRoots(REDOCLY, [{ from: './a-oas-1.0.0/a.yaml', to: './a-oas-1.0.1/a.yaml' }]);
        expect(result).toBe(['root: ./a-oas-1.0.1/a.yaml', 'root: ./b-oas-2.0.0/b.yaml'].join('\n'));
    });

    it('throws when any root is missing, before returning a partial result', () => {
        expect(() =>
            rewriteRoots(REDOCLY, [
                { from: './a-oas-1.0.0/a.yaml', to: './a-oas-1.0.1/a.yaml' },
                { from: './missing/m.yaml', to: './missing/n.yaml' },
            ])
        ).toThrow('no root "./missing/m.yaml"');
    });

    it('only matches a root line, not the same path mentioned elsewhere', () => {
        const redocly = ['# was ./a-oas-1.0.0/a.yaml', 'root: ./a-oas-1.0.0/a.yaml'].join('\n');
        const result = rewriteRoots(redocly, [{ from: './a-oas-1.0.0/a.yaml', to: './a-oas-1.0.1/a.yaml' }]);
        expect(result).toBe(['# was ./a-oas-1.0.0/a.yaml', 'root: ./a-oas-1.0.1/a.yaml'].join('\n'));
    });

    it('inserts the new path literally, even when it contains replacement patterns', () => {
        const result = rewriteRoots('root: ./a/a.yaml', [{ from: './a/a.yaml', to: './$&/a.yaml' }]);
        expect(result).toBe('root: ./$&/a.yaml');
    });
});
