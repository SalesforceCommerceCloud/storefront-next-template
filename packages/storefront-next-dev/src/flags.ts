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

import { Flags } from '@oclif/core';

export const PROJECT_DIRECTORY_FLAG = 'project-directory' as const;
export const PROJECT_DIRECTORY_CHAR = 'd' as const;

export const commonFlags = {
    [PROJECT_DIRECTORY_FLAG]: Flags.string({
        char: PROJECT_DIRECTORY_CHAR,
        description: 'Project directory',
        default: process.cwd(),
    }),
};

/**
 * Restore the 1.x short flags on `MrtCommand.baseFlags`: `-t` for `--environment`/`--target`
 * and `-o` for `--cloud-origin` (b2c-tooling-sdk 2.x moved it to `-u`).
 */
export function withLegacyMrtShortFlags<T extends { environment: object; 'cloud-origin': object }>(baseFlags: T): T {
    return {
        ...baseFlags,
        environment: { ...baseFlags.environment, charAliases: ['t'] },
        'cloud-origin': { ...baseFlags['cloud-origin'], charAliases: ['o'] },
    };
}
