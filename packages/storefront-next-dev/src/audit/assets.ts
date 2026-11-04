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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '../../package.json' with { type: 'json' };

/** The storefront-next-dev version, not the host CLI's: under `b2c sfnext`, oclif's config version is b2c's. */
export const VERSION: string = pkg.version;

function packageRoot(from: string): string {
    for (let dir = from; ; dir = path.dirname(dir)) {
        if (existsSync(path.join(dir, 'package.json'))) return dir;
        if (path.dirname(dir) === dir) throw new Error(`No package.json above ${from}`);
    }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = packageRoot(here);

/**
 * The directory holding the audit's runtime assets (catalog, instructions, UI). tsdown moves shared code into
 * chunks at the top of `dist`, so paths relative to a module break after bundling. This resolves to `src/audit`
 * when running from source (tests) and `dist/audit` when running the build.
 */
export const AUDIT_ROOT = path.join(
    root,
    path.relative(root, here).split(path.sep)[0] === 'src' ? 'src' : 'dist',
    'audit'
);
