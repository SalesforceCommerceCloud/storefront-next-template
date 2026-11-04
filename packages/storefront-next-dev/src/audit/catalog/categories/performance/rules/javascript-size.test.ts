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
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture } from '../../../../__fixtures__/bundle';
import { PlayhouseArtifactReader } from '../../../../evidence';
import javascriptSize from './javascript-size';

describe('performance/javascript-size', () => {
    it('passes within 1.4 MB and fails over it, high from 2.7 MB', async () => {
        const { page, archive } = await fixture();
        const playhouse = new PlayhouseArtifactReader([page]);
        const pass = await javascriptSize({ pages: [page], playhouse } as never);
        expect(pass.decision?.status).toBe('pass');
        const [home] = pass.data.pages;
        expect([home?.scripts, home?.beforeLoad.scripts, home?.afterLoad.scripts]).toEqual([5, 4, 1]);

        const lhrFile = path.join(archive, 'runs/mobile-cold-1/lhr.json');
        const lhr = JSON.parse(await readFile(lhrFile, 'utf8'));
        lhr.audits['network-requests'].details.items[2].resourceSize = 1_500_000;
        await writeFile(lhrFile, JSON.stringify(lhr));
        const medium = await javascriptSize({ pages: [page], playhouse } as never);
        expect([medium.decision?.status, medium.decision?.severity]).toEqual(['fail', 'medium']);
        expect(medium.decision?.evidence[1]).toEqual({
            type: 'playhouse',
            page: 'home',
            artifact: 'runs/mobile-cold-1/lhr.json',
            pointer: '/audits/network-requests/details/items/2/resourceSize',
            value: 'entry.client-A.js 1465 KiB',
        });
        lhr.audits['network-requests'].details.items[2].resourceSize = 2_800_000;
        await writeFile(lhrFile, JSON.stringify(lhr));
        expect((await javascriptSize({ pages: [page], playhouse } as never)).decision?.severity).toBe('high');
    });
});
