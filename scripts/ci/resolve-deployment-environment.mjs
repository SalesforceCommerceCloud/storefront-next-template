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

const SUPPORTED_TARGETS = new Set(['test', 'development', 'staging']);

export function resolveDeploymentEnvironment(environmentNames, target) {
    if (!SUPPORTED_TARGETS.has(target)) {
        throw new Error(
            `Unsupported deployment target: ${target}. Supported targets are test, development, and staging.`
        );
    }

    let mappings;
    try {
        mappings = JSON.parse(environmentNames);
    } catch (error) {
        throw new Error('DEPLOY_ENVIRONMENT_NAMES must be a JSON object.', { cause: error });
    }
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
        throw new Error('DEPLOY_ENVIRONMENT_NAMES must be a JSON object.');
    }

    const normalizedMappings = new Map();
    for (const [label, environmentName] of Object.entries(mappings)) {
        const normalizedLabel = label.toLowerCase();
        if (normalizedMappings.has(normalizedLabel)) {
            throw new Error(`DEPLOY_ENVIRONMENT_NAMES has duplicate mappings for ${normalizedLabel}.`);
        }
        normalizedMappings.set(normalizedLabel, environmentName);
    }

    const environmentName = normalizedMappings.get(target);
    if (typeof environmentName !== 'string' || environmentName.trim().length === 0) {
        throw new Error(`DEPLOY_ENVIRONMENT_NAMES must contain a non-empty ${target} mapping.`);
    }

    return environmentName.trim();
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
    const target = process.argv[2];
    try {
        process.stdout.write(`${resolveDeploymentEnvironment(process.env.DEPLOY_ENVIRONMENT_NAMES, target)}\n`);
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
