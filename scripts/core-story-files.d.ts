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

// Types for the plain-JS core-story-files module (consumed by chromatic-core.js as a
// Node script and by .storybook/main.ts as TypeScript). See core-story-files.js.

/** Matches a `chromatic-core` entry inside a `tags: [...]` array on the meta object. */
export const CORE_TAG_REGEX: RegExp;

/** Absolute paths of every story file tagged `chromatic-core` under `${rootDir}/src`. */
export function findCoreStoryFiles(rootDir: string): string[];
