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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
    candidateSelector,
    locateApplicationStylesheet,
    verifyProductionCss,
    verifyStorybookCss,
} from './lint-css.mjs';

const temporaryProjects: string[] = [];
const runtimeCandidates = [
    ...['p', 'px', 'py'].flatMap((prefix) => [1, 2, 3, 4, 6, 8, 12, 16].map((value) => `${prefix}-${value}`)),
    ...[1, 2, 3, 4, 6, 8].map((value) => `m-${value}`),
];
const storyCandidates = ['w-[137px]', 'sm:h-[73px]', 'bg-sidebar-ring', 'text-brand-black-off'];

function createProject(css: string) {
    const projectRoot = mkdtempSync(join(tmpdir(), 'tailwind-css-verifier-'));
    temporaryProjects.push(projectRoot);
    mkdirSync(join(projectRoot, 'build/server'), { recursive: true });
    mkdirSync(join(projectRoot, 'build/client/assets'), { recursive: true });
    mkdirSync(join(projectRoot, '.storybook/storybook-static'), { recursive: true });
    writeFileSync(join(projectRoot, 'build/client/assets/index-owned.css'), css);
    writeFileSync(join(projectRoot, '.storybook/storybook-static/index.css'), css);
    writeFileSync(
        join(projectRoot, 'build/server/server-build.cjs'),
        'const appStylesHref = "assets/index-owned.css";'
    );
    return projectRoot;
}

function rules(candidates: string[]) {
    return candidates.map((candidate) => `${candidateSelector(candidate)}{padding:1px}`).join('');
}

afterEach(() => {
    for (const projectRoot of temporaryProjects.splice(0)) {
        rmSync(projectRoot, { recursive: true, force: true });
    }
});

test('locates the application stylesheet through server-bundle ownership instead of asset order', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'tailwind-css-verifier-'));
    temporaryProjects.push(projectRoot);
    mkdirSync(join(projectRoot, 'build/server'), { recursive: true });
    mkdirSync(join(projectRoot, 'build/client/assets'), { recursive: true });
    writeFileSync(join(projectRoot, 'build/client/assets/design-styles.css'), '.decoy{}');
    writeFileSync(join(projectRoot, 'build/client/assets/index-owned.css'), '.owned{}');
    writeFileSync(
        join(projectRoot, 'build/server/server-build.cjs'),
        'const appStylesHref = basePath + "assets/index-owned.css";'
    );

    const stylesheet = locateApplicationStylesheet(projectRoot);

    expect(stylesheet).toBe(join(projectRoot, 'build/client/assets/index-owned.css'));
    expect(candidateSelector('sm:h-[73px]')).toBe('.sm\\:h-\\[73px\\]');
});

test('accepts production CSS containing every required runtime class', () => {
    expect(verifyProductionCss(createProject(rules(runtimeCandidates)))).toEqual({
        stylesheet: join('build', 'client', 'assets', 'index-owned.css'),
    });
});

test.each(['p-1', 'px-1', 'py-1'])('rejects missing %s even when its -12 and -16 counterparts exist', (missing) => {
    const projectRoot = createProject(rules(runtimeCandidates.filter((candidate) => candidate !== missing)));
    expect(() => verifyProductionCss(projectRoot)).toThrow(`production CSS does not contain ${missing}`);
});

test.each(['0', '-extra', '_extra', 'é', '\\:hover', '\\.5'])('does not match a class extended by %s', (suffix) => {
    const css = `${rules(runtimeCandidates.filter((candidate) => candidate !== 'm-1'))}.m-1${suffix}{margin:1px}`;
    expect(() => verifyProductionCss(createProject(css))).toThrow('production CSS does not contain m-1');
});

test.each([
    '{margin:1px}',
    ' {margin:1px}',
    ',.other{margin:1px}',
    ':hover{margin:1px}',
    '.other{margin:1px}',
])('accepts an exact class followed by %s', (remainder) => {
    const css = `${rules(runtimeCandidates.filter((candidate) => candidate !== 'm-1'))}.m-1${remainder}`;
    expect(() => verifyProductionCss(createProject(css))).not.toThrow();
});

test('accepts longer classes sharing a forbidden selector prefix in production and Storybook', () => {
    const extra = rules(['bg-gray-2000', 'ring-ring/30-extra', 'w-[200px]-extra']);
    expect(() => verifyProductionCss(createProject(rules(runtimeCandidates) + extra))).not.toThrow();
    expect(() => verifyStorybookCss(createProject(rules(storyCandidates) + extra))).not.toThrow();
});

test.each(['bg-gray-200', 'ring-ring/30', 'w-[200px]'])('still rejects the exact forbidden class %s', (candidate) => {
    const extra = rules([candidate]);
    expect(() => verifyProductionCss(createProject(rules(runtimeCandidates) + extra))).toThrow(
        `production CSS contains ${candidate}`
    );
    expect(() => verifyStorybookCss(createProject(rules(storyCandidates) + extra))).toThrow(
        `Storybook CSS contains ${candidate}`
    );
});

test.each(storyCandidates)('rejects a longer Storybook class in place of %s', (missing) => {
    const css = rules(storyCandidates.map((candidate) => (candidate === missing ? `${candidate}-extra` : candidate)));
    expect(() => verifyStorybookCss(createProject(css))).toThrow(`Storybook CSS does not contain ${missing}`);
});
