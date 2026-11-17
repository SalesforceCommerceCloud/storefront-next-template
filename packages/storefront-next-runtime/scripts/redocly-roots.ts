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
 * Rewrites the `root:` paths in `redocly.yaml` for a batch of spec folder renames.
 * Pure, so every rename is checked before the caller touches the filesystem.
 */

export interface RootRename {
    from: string;
    to: string;
}

/** @throws if any `from` is not the value of a `root:` line in `redocly` */
export function rewriteRoots(redocly: string, renames: RootRename[]): string {
    return renames.reduce((text, { from, to }) => {
        const lines = text.split('\n');
        const index = lines.findIndex((line) => line.trim() === `root: ${from}`);
        if (index === -1) {
            throw new Error(`redocly.yaml has no root "${from}" to rewrite.`);
        }
        lines[index] = lines[index].replace(from, () => to);
        return lines.join('\n');
    }, redocly);
}
