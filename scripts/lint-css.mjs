#!/usr/bin/env node
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

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLICATION_CSS_RE = /appStylesHref\s*=\s*[^;]*?['"](assets\/[^'"]+\.css)['"]/g;

const STORY_ONLY_CANDIDATES = ['w-[137px]', 'sm:h-[73px]', 'bg-sidebar-ring', 'text-brand-black-off'];
const NON_RUNTIME_SENTINELS = [
    ['unit test', 'w-[200px]'],
    ['repository script', 'ring-ring/30'],
    ['documentation', 'bg-gray-200'],
];
const DYNAMIC_RUNTIME_CANDIDATES = [
    'p-1',
    'p-2',
    'p-3',
    'p-4',
    'p-6',
    'p-8',
    'p-12',
    'p-16',
    'px-1',
    'px-2',
    'px-3',
    'px-4',
    'px-6',
    'px-8',
    'px-12',
    'px-16',
    'py-1',
    'py-2',
    'py-3',
    'py-4',
    'py-6',
    'py-8',
    'py-12',
    'py-16',
    'm-1',
    'm-2',
    'm-3',
    'm-4',
    'm-6',
    'm-8',
];

function fail(message) {
    throw new Error(`[tailwind-css] ${message}`);
}

function walkFiles(root) {
    if (!existsSync(root)) return [];
    const files = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(path));
        else files.push(path);
    }
    return files;
}

export function candidateSelector(candidate) {
    return `.${candidate.replaceAll('\\', '\\\\').replaceAll('/', '\\/').replaceAll(':', '\\:').replaceAll('[', '\\[').replaceAll(']', '\\]')}`;
}

function assertCandidates(css, candidates, expected, label) {
    for (const candidate of candidates) {
        const selector = candidateSelector(candidate).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // A CSS identifier can continue with letters, digits, hyphens, non-ASCII characters, or escapes.
        const present = new RegExp(`${selector}(?![-\\w\\\\\\u0080-\\uFFFF])`).test(css);
        if (present !== expected) {
            fail(`${label} ${expected ? 'does not contain' : 'contains'} ${candidate}`);
        }
    }
}

export function locateApplicationStylesheet(projectRoot = PROJECT_ROOT) {
    const serverRoot = join(projectRoot, 'build/server');
    const ownedAssets = new Set();
    for (const file of walkFiles(serverRoot).filter((path) => /\.(?:cjs|mjs|js)$/.test(path))) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(APPLICATION_CSS_RE)) ownedAssets.add(match[1]);
    }

    if (ownedAssets.size !== 1) {
        fail(
            `expected one stylesheet owned by appStylesHref, found ${ownedAssets.size}: ${[...ownedAssets].join(', ')}`
        );
    }

    const stylesheet = join(projectRoot, 'build/client', [...ownedAssets][0]);
    if (!existsSync(stylesheet))
        fail(`owned application stylesheet does not exist: ${relative(projectRoot, stylesheet)}`);
    return stylesheet;
}

export function verifyProductionCss(projectRoot = PROJECT_ROOT) {
    const stylesheet = locateApplicationStylesheet(projectRoot);
    const css = readFileSync(stylesheet, 'utf8');
    assertCandidates(css, STORY_ONLY_CANDIDATES, false, 'production CSS');
    assertCandidates(
        css,
        NON_RUNTIME_SENTINELS.map(([, candidate]) => candidate),
        false,
        'production CSS'
    );
    assertCandidates(css, DYNAMIC_RUNTIME_CANDIDATES, true, 'production CSS');

    return { stylesheet: relative(projectRoot, stylesheet) };
}

export function verifyStorybookCss(projectRoot = PROJECT_ROOT) {
    const storybookRoot = join(projectRoot, '.storybook/storybook-static');
    const stylesheets = walkFiles(storybookRoot).filter((path) => path.endsWith('.css'));
    if (stylesheets.length === 0) fail('Storybook build contains no CSS');
    const css = stylesheets.map((path) => readFileSync(path, 'utf8')).join('\n');
    assertCandidates(css, STORY_ONLY_CANDIDATES, true, 'Storybook CSS');
    assertCandidates(
        css,
        NON_RUNTIME_SENTINELS.map(([, candidate]) => candidate),
        false,
        'Storybook CSS'
    );
    return { stylesheets: stylesheets.length };
}

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
    const productionOnly = process.argv.includes('--production');
    const storybookOnly = process.argv.includes('--storybook');
    const results = {};
    if (!storybookOnly || productionOnly) results.production = verifyProductionCss();
    if (!productionOnly || storybookOnly) results.storybook = verifyStorybookCss();
    console.log(JSON.stringify(results, null, 2));
}
