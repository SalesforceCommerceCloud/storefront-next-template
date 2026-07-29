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

/**
 * Locates stories tagged `chromatic-core`. Shared so the Chromatic snapshot scope
 * and the Storybook build scope agree on the same curated set.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Matches `chromatic-core` inside a `tags: [...]` array on the meta object —
 * avoids false positives from comments or unrelated string literals.
 */
export const CORE_TAG_REGEX = /tags:\s*\[[^\]]*['"]chromatic-core['"][^\]]*\]/;

// Recursively collect all story files under `dir`.
function findStoryFiles(dir, fileList = []) {
    const files = readdirSync(dir);

    for (const file of files) {
        const filePath = join(dir, file);
        const stat = statSync(filePath);

        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
                findStoryFiles(filePath, fileList);
            }
        } else if (file.endsWith('.stories.ts') || file.endsWith('.stories.tsx')) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

/**
 * Absolute paths of every story file tagged `chromatic-core` under `${rootDir}/src`.
 *
 * @param {string} rootDir Package root (the directory containing `src/`).
 * @returns {string[]} Absolute paths to tagged story files.
 */
export function findCoreStoryFiles(rootDir) {
    const storyFiles = findStoryFiles(join(rootDir, 'src'));

    return storyFiles.filter((file) => CORE_TAG_REGEX.test(readFileSync(file, 'utf-8')));
}
