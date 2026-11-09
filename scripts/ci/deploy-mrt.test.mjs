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

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptPath = new URL('./deploy-mrt.sh', import.meta.url).pathname;

async function runDeployMrt(environment) {
    const directory = await mkdtemp(join(tmpdir(), 'deploy-mrt-'));
    const binDirectory = join(directory, 'bin');
    const artifactDirectory = join(directory, 'artifact');
    const buildDirectory = join(artifactDirectory, 'build');
    const pushedArgumentsPath = join(directory, 'pushed-arguments');

    await mkdir(binDirectory);
    await mkdir(buildDirectory, { recursive: true });
    await writeFile(join(artifactDirectory, 'build.tar.gz'), 'archive');
    await writeFile(
        join(binDirectory, 'node'),
        `#!/usr/bin/env bash
if [[ "$2" == "verify-manifest" ]]; then exit 0; fi
if [[ "$2" == "artifact-path" ]]; then printf '%s\\n' "$ARTIFACT_DIRECTORY/build.tar.gz"; exit 0; fi
if [[ "$2" == "release-id" ]]; then printf '%s\\n' test-release; exit 0; fi
exit 1
`,
        { mode: 0o755 }
    );
    await writeFile(
        join(binDirectory, 'tar'),
        `#!/usr/bin/env bash
mkdir -p "$4/build"
`,
        { mode: 0o755 }
    );
    await writeFile(
        join(binDirectory, 'pnpm'),
        `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$PUSHED_ARGUMENTS_PATH"
`,
        { mode: 0o755 }
    );
    const result = spawnSync('bash', [scriptPath, join(directory, 'manifest.json')], {
        cwd: new URL('../..', import.meta.url).pathname,
        encoding: 'utf8',
        env: {
            ...process.env,
            ...environment,
            ARTIFACT_DIRECTORY: artifactDirectory,
            MRT_PROJECT: 'project',
            MRT_ENVIRONMENT: 'environment',
            MRT_CLOUD_ORIGIN: 'https://legacy.example.com',
            MRT_API_KEY: 'api-key',
            PATH: `${binDirectory}:${process.env.PATH}`,
            PUSHED_ARGUMENTS_PATH: pushedArgumentsPath,
        },
    });

    assert.equal(result.status, 0, result.stderr);
    return (await readFile(pushedArgumentsPath, 'utf8')).trim().split('\n');
}

test('passes the cloud origin only when the effective MRT backend is legacy', async () => {
    const scapiCredentials = {
        SFCC_CLIENT_ID: 'client-id',
        SFCC_CLIENT_SECRET: 'client-secret',
        SFCC_SHORTCODE: 'shortcode',
        SFCC_TENANT_ID: 'tenant-id',
    };

    const legacyArguments = await runDeployMrt({ MRT_BACKEND: 'legacy' });
    assert.deepEqual(legacyArguments.slice(-2), ['--cloud-origin', 'https://legacy.example.com']);

    const scapiArguments = await runDeployMrt({ MRT_BACKEND: 'scapi', ...scapiCredentials });
    assert.equal(scapiArguments.includes('--cloud-origin'), false);

    const autoScapiArguments = await runDeployMrt({ MRT_BACKEND: 'auto', ...scapiCredentials });
    assert.equal(autoScapiArguments.includes('--cloud-origin'), false);

    const autoLegacyArguments = await runDeployMrt({ MRT_BACKEND: 'auto' });
    assert.deepEqual(autoLegacyArguments.slice(-2), ['--cloud-origin', 'https://legacy.example.com']);
});
