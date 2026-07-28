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
/* oxlint-disable no-console */
import os from 'os';
import chalk from 'chalk';
import { createRequire } from 'module';
import type { ServerMode } from '../server/modes';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Get the local network IPv4 address
 */
export function getNetworkAddress(): string | undefined {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const iface = interfaces[name];
        if (!iface) continue;
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return undefined;
}

/**
 * Get the version of a package from the project's package.json
 */
export function getPackageVersion(packageName: string, projectDir: string): string {
    try {
        const require = createRequire(import.meta.url);
        const pkgPath = require.resolve(`${packageName}/package.json`, { paths: [projectDir] });
        const pkgJson = require(pkgPath) as { version: string };
        return pkgJson.version;
    } catch {
        return 'unknown';
    }
}

/**
 * Centralized, level-gated logger for the SDK.
 *
 * Log level is controlled by `SFCC_LOG_LEVEL` env var (`error` | `warn` | `info` | `debug`).
 * Falls back to: `DEBUG` targeting sfnext -> `debug`, `NODE_ENV=production` -> `warn`, otherwise `info`.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

let overrideLevel: LogLevel | undefined;

/**
 * Returns true when the `DEBUG` env var targets sfnext or is a general enable flag.
 * Avoids accidentally enabling debug mode when DEBUG is set for unrelated libraries
 * (e.g. `DEBUG=express:*`).
 */
function debugEnablesSfnext(): boolean {
    const raw = process.env.DEBUG?.trim();
    if (!raw) return false;
    const normalized = raw.toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    return raw.split(',').some((token) => {
        const value = token.trim();
        return value === '*' || value === 'sfnext' || value === 'sfnext:*';
    });
}

function resolveLevel(): LogLevel {
    if (overrideLevel) return overrideLevel;
    const envLevel = process.env.MRT_LOG_LEVEL ?? process.env.SFCC_LOG_LEVEL;
    if (envLevel && envLevel in LEVEL_PRIORITY) return envLevel as LogLevel;
    if (debugEnablesSfnext()) return 'debug';
    if (process.env.NODE_ENV === 'production') return 'warn';
    return 'info';
}

function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[resolveLevel()];
}

export const logger = {
    error(msg: string, ...args: unknown[]): void {
        if (!shouldLog('error')) return;
        console.error(chalk.red('[sfnext:error]'), msg, ...args);
    },
    warn(msg: string, ...args: unknown[]): void {
        if (!shouldLog('warn')) return;
        console.warn(chalk.yellow('[sfnext:warn]'), msg, ...args);
    },
    info(msg: string, ...args: unknown[]): void {
        if (!shouldLog('info')) return;
        console.log(chalk.cyan('[sfnext:info]'), msg, ...args);
    },
    debug(msg: string, ...args: unknown[]): void {
        if (!shouldLog('debug')) return;
        console.log(chalk.gray('[sfnext:debug]'), msg, ...args);
    },
    setLevel(level: LogLevel | undefined): void {
        overrideLevel = level;
    },
    getLevel(): LogLevel {
        return resolveLevel();
    },
};

/**
 * Print the server information banner with URLs and versions
 */
export function printServerInfo(mode: ServerMode, port: number, startTime: number, projectDir: string): void {
    const elapsed = Date.now() - startTime;
    const sfnextVersion = pkg.version;
    const reactVersion = getPackageVersion('react', projectDir);
    const reactRouterVersion = getPackageVersion('react-router', projectDir);
    const viteVersion = getPackageVersion('vite', projectDir);

    const modeLabel = mode === 'development' ? 'Development Mode' : 'Preview Mode';

    console.log();
    console.log(`  ${chalk.cyan.bold('⚡ SFCC Storefront Next')} ${chalk.dim(`v${sfnextVersion}`)}`);
    console.log(`  ${chalk.green.bold(modeLabel)}`);
    console.log();
    const logLevel = resolveLevel();
    const logLevelColors: Record<LogLevel, (s: string) => string> = {
        error: chalk.red,
        warn: chalk.yellow,
        info: chalk.cyan,
        debug: chalk.gray,
    };

    console.log(
        `  ${chalk.dim('react')} ${chalk.green(`v${reactVersion}`)} ${chalk.dim('|')} ` +
            `${chalk.dim('react-router')} ${chalk.green(`v${reactRouterVersion}`)} ${chalk.dim('|')} ` +
            `${chalk.dim('vite')} ${chalk.green(`v${viteVersion}`)}`
    );
    console.log(
        `  ${chalk.dim('log level')} ${logLevelColors[logLevel](logLevel)} ${chalk.dim('|')} ` +
            `${chalk.green(`ready in ${elapsed}ms`)}`
    );
    console.log();
}

/**
 * Print server configuration details (proxy, static, etc.)
 */
export function printServerConfig(config: {
    mode: ServerMode;
    port: number;
    enableProxy?: boolean;
    enableStaticServing?: boolean;
    enableCompression?: boolean;
    proxyPath?: string;
    proxyHost?: string;
    shortCode?: string;
    organizationId?: string;
    clientId?: string;
}): void {
    const {
        port,
        enableProxy,
        enableStaticServing,
        enableCompression,
        proxyPath,
        proxyHost,
        shortCode,
        organizationId,
        clientId,
    } = config;

    console.log(`  ${chalk.bold('Environment Configuration:')}`);

    if (enableProxy && proxyPath && proxyHost && shortCode) {
        console.log(
            `    ${chalk.green('✓')} ${chalk.bold('Proxy:')} ${chalk.cyan(`localhost:${port}${proxyPath}`)} ${chalk.dim('→')} ${chalk.cyan(proxyHost)}`
        );
        console.log(`      ${chalk.dim('Short Code:      ')}${chalk.dim(shortCode)}`);
        if (organizationId) {
            console.log(`      ${chalk.dim('Organization ID: ')}${chalk.dim(organizationId)}`);
        }
        if (clientId) {
            console.log(`      ${chalk.dim('Client ID:       ')}${chalk.dim(clientId)}`);
        }
    } else {
        console.log(`    ${chalk.bold('Proxy:           ')} ${chalk.dim('disabled')}`);
    }

    if (enableStaticServing) {
        console.log(`    ${chalk.bold('Static:          ')} ${chalk.dim('enabled')}`);
    }

    if (enableCompression) {
        console.log(`    ${chalk.bold('Compression:     ')} ${chalk.dim('enabled')}`);
    }

    // URLs
    const localUrl = `http://localhost:${port}`;
    const showNetwork = process.env.SHOW_NETWORK === 'true';
    const networkAddress = showNetwork ? getNetworkAddress() : undefined;
    const networkUrl = networkAddress ? `http://${networkAddress}:${port}` : undefined;

    console.log();
    console.log(`  ${chalk.bold('Local:  ')} ${chalk.cyan(localUrl)}`);
    if (networkUrl) {
        console.log(`  ${chalk.bold('Network:')} ${chalk.cyan(networkUrl)}`);
    }

    console.log();
    console.log(`  ${chalk.dim('Press')} ${chalk.bold('Ctrl+C')} ${chalk.dim('to stop the server')}`);
    console.log();
}

/**
 * Print shutdown message
 */
export function printShutdownMessage(): void {
    console.log(`\n  ${chalk.yellow('⚡')} ${chalk.dim('Server shutting down...')}\n`);
}
