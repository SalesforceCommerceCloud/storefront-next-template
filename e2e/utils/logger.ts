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
import chalk from 'chalk';

/**
 * Centralized logger with chalk-colored output.
 *
 * Shared across CLI test runner and CI orchestration scripts.
 * All user-facing output should go through this module for consistent formatting.
 */
/* oxlint-disable no-console */
export const log = {
    /** Informational message (blue prefix) */
    info: (msg: string): void => {
        console.log(chalk.blue('ℹ'), msg);
    },

    /** Success message (green prefix) */
    success: (msg: string): void => {
        console.log(chalk.green('✔'), msg);
    },

    /** Warning message (yellow prefix, writes to stderr) */
    warn: (msg: string): void => {
        console.warn(chalk.yellow('⚠'), msg);
    },

    /** Error message (red prefix, writes to stderr) */
    error: (msg: string): void => {
        console.error(chalk.red('✖'), msg);
    },

    /** Step/progress indicator (cyan prefix) */
    step: (msg: string): void => {
        console.log(chalk.cyan('→'), msg);
    },

    /** Dev-server prefixed output (gray) */
    server: (msg: string): void => {
        console.log(chalk.gray('[dev-server]'), msg);
    },

    /** Command being executed (magenta) */
    command: (msg: string): void => {
        console.log(chalk.magenta('$'), msg);
    },

    /** Dim hint/tip text */
    hint: (msg: string): void => {
        console.log(chalk.dim('💡'), chalk.dim(msg));
    },

    /** Raw output — no prefix, no coloring */
    raw: (msg: string): void => {
        console.log(msg);
    },
};
/* oxlint-enable no-console */
