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
import Catalog from './catalog';
import Finalize from './finalize';
import Prepare from './prepare';
import Progress from './progress';
import Serve from './serve';

const reportsUsage = (command: unknown): boolean => (command as { reportsUsage: boolean }).reportsUsage;

describe('audit commands that report usage', () => {
    it.each([
        ['prepare', Prepare],
        ['finalize', Finalize],
    ])('%s reports', (_name, command) => {
        expect(reportsUsage(command)).toBe(true);
    });

    // progress runs many times per audit, and serve keeps running; catalog only prints JSON.
    it.each([
        ['catalog', Catalog],
        ['progress', Progress],
        ['serve', Serve],
    ])('%s does not report', (_name, command) => {
        expect(reportsUsage(command)).toBe(false);
    });
});
