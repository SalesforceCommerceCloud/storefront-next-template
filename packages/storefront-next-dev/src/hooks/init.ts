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

import { join, resolve } from 'node:path';
import type { Hook } from '@oclif/core';
import { initializePlugins } from '../cli-plugins.js';
import { PROJECT_DIRECTORY_FLAG, PROJECT_DIRECTORY_CHAR } from '../flags.js';

/**
 * Oclif init hook — runs before any command executes.
 *
 * Resolves the project directory from --project-directory / -d early — before
 * oclif parses flags — and loads the project's .env file into process.env.
 * Using the hook instead of bin/run.js keeps the flag name as a single source
 * of truth (imported from flags.ts) and keeps run.js minimal.
 *
 * Also discovers b2c-cli plugins (installed via `b2c plugins:install`) and
 * registers their middleware and config sources with the global registries.
 *
 * @env {string} [MRT_PROJECT] - Project name for MRT deployments
 * @env {string} [MRT_ENVIRONMENT] - Target environment for MRT deployments (MRT_TARGET also accepted)
 */
const hook: Hook<'init'> = async function (opts) {
    // Scope guard: only run for sfnext commands. When invoked through the standalone
    // `sfnext` bin, every command qualifies. When loaded as a plugin under another CLI
    // (e.g. `b2c sfnext …`), we only want this hook firing for sfnext-namespaced
    // commands — not for unrelated commands of the host CLI.
    const isSfnext = this.config.bin === 'sfnext' || opts.id === 'sfnext' || (opts.id?.startsWith('sfnext:') ?? false);
    if (!isSfnext) return;

    // Parse --project-directory / -d from raw argv before oclif processes flags
    // so we load the correct .env regardless of where the CLI is invoked from.
    const args = opts.argv ?? [];
    let projectDir = process.cwd();
    for (let i = 0; i < args.length; i++) {
        if (
            (args[i] === `--${PROJECT_DIRECTORY_FLAG}` || args[i] === `-${PROJECT_DIRECTORY_CHAR}`) &&
            args[i + 1] &&
            !args[i + 1].startsWith('-')
        ) {
            projectDir = resolve(args[i + 1]);
            break;
        }
        const m = args[i].match(new RegExp(`^--${PROJECT_DIRECTORY_FLAG}=(.+)$`));
        if (m) {
            projectDir = resolve(m[1]);
            break;
        }
    }

    // Load .env — the single place for env file loading in the CLI.
    // process.loadEnvFile does not overwrite vars already set in the environment.
    try {
        process.loadEnvFile(join(projectDir, '.env'));
    } catch {
        // .env file not found or not readable, continue without it
    }

    await initializePlugins();
};

export default hook;
