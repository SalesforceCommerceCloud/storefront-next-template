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
import { execFile as execFileCallback } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { createManifest, getArtifactPath, verifyManifest, verifyRelease } from './release-artifacts.mjs';

const execFile = promisify(execFileCallback);
const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const templateDirectory = resolve(scriptsDirectory, '..', '..');

async function createFixture({ migrations = false } = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'sfnext-release-artifacts-'));
    const artifacts = {
        build: join(directory, 'build-release.tar.gz'),
        cartridges: join(directory, 'cartridges-release.tar.gz'),
    };
    await writeFile(artifacts.build, 'build artifact');
    await writeFile(artifacts.cartridges, 'cartridge artifact');
    if (migrations) {
        artifacts.migrations = join(directory, 'migrations-release.tar.gz');
        await writeFile(artifacts.migrations, 'migration artifact');
    }
    const manifestPath = await createManifest({
        releaseId: 'release-1',
        sourceCommit: 'abc123',
        artifactDirectory: directory,
        artifacts,
    });
    return { directory, artifacts, manifestPath };
}

test('creates and verifies a release manifest without migrations', async (t) => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.directory, { recursive: true, force: true }));

    const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8'));
    assert.deepEqual(Object.keys(manifest.artifacts), ['build', 'cartridges']);
    assert.equal(manifest.releaseId, 'release-1');
    assert.equal(manifest.sourceCommit, 'abc123');
    await assert.doesNotReject(() => verifyManifest(fixture.manifestPath));
    assert.equal(await getArtifactPath(fixture.manifestPath, 'build'), fixture.artifacts.build);
});

test('includes and verifies migrations when supplied', async (t) => {
    const fixture = await createFixture({ migrations: true });
    t.after(() => rm(fixture.directory, { recursive: true, force: true }));

    const manifest = await verifyManifest(fixture.manifestPath);
    assert.ok(manifest.artifacts.migrations);
    assert.equal(await getArtifactPath(fixture.manifestPath, 'migrations'), fixture.artifacts.migrations);
});

test('rejects altered, missing, malformed, and mismatched releases', async (t) => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.directory, { recursive: true, force: true }));

    await writeFile(fixture.artifacts.build, 'changed build artifact');
    await assert.rejects(() => verifyManifest(fixture.manifestPath), /checksum mismatch/);

    const missingFixture = await createFixture();
    t.after(() => rm(missingFixture.directory, { recursive: true, force: true }));
    await rm(missingFixture.artifacts.cartridges);
    await assert.rejects(() => verifyManifest(missingFixture.manifestPath), /missing or unreadable/);

    await writeFile(fixture.manifestPath, '{not JSON');
    await assert.rejects(
        () => verifyManifest(fixture.manifestPath),
        (error) =>
            error instanceof Error &&
            /Unable to read release manifest/.test(error.message) &&
            error.cause instanceof SyntaxError
    );

    const unreadableFixture = await createFixture();
    t.after(() => rm(unreadableFixture.directory, { recursive: true, force: true }));
    await rm(unreadableFixture.artifacts.build);
    await assert.rejects(
        () => verifyManifest(unreadableFixture.manifestPath),
        (error) =>
            error instanceof Error &&
            /missing or unreadable/.test(error.message) &&
            error.cause instanceof Error &&
            error.cause.code === 'ENOENT'
    );
});

test('rejects mismatched release identity and source commit', async (t) => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.directory, { recursive: true, force: true }));

    await assert.rejects(() => verifyRelease(fixture.manifestPath, 'release-2', 'abc123'), /Release ID mismatch/);
    await assert.rejects(() => verifyRelease(fixture.manifestPath, 'release-1', 'def456'), /Source commit mismatch/);
});

test('rejects unsafe artifact filenames in a manifest', async (t) => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.directory, { recursive: true, force: true }));

    const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8'));
    manifest.artifacts.build.file = '../outside.tar.gz';
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));
    await assert.rejects(() => verifyManifest(fixture.manifestPath), /unsafe filename/);
});

test('package-release creates artifacts with and without migrations', async (t) => {
    for (const migrations of [false, true]) {
        const directory = await mkdtemp(join(tmpdir(), 'sfnext-package-release-'));
        t.after(() => rm(directory, { recursive: true, force: true }));
        await writeFile(join(directory, 'build-file'), 'build');
        await writeFile(join(directory, 'cartridge-file'), 'cartridges');
        await mkdir(join(directory, 'scripts', 'ci'), { recursive: true });
        await copyFile(
            join(templateDirectory, 'scripts', 'ci', 'package-release.sh'),
            join(directory, 'scripts', 'ci', 'package-release.sh')
        );
        await copyFile(
            join(templateDirectory, 'scripts', 'ci', 'release-artifacts.mjs'),
            join(directory, 'scripts', 'ci', 'release-artifacts.mjs')
        );
        await mkdir(join(directory, 'build'));
        await mkdir(join(directory, 'cartridges'));
        await rename(join(directory, 'build-file'), join(directory, 'build', 'file'));
        await rename(join(directory, 'cartridge-file'), join(directory, 'cartridges', 'file'));
        if (migrations) {
            await mkdir(join(directory, 'migrations'));
            await writeFile(join(directory, 'migrations', 'file'), 'migrations');
        }

        await execFile('bash', ['scripts/ci/package-release.sh', 'release-test', 'deadbeef'], {
            cwd: directory,
        });
        const manifest = await verifyManifest(join(directory, 'release-artifacts', 'manifest.json'));
        assert.equal(Boolean(manifest.artifacts.migrations), migrations);
    }
});

test('deploy-release rejects unsupported targets before deployment', async () => {
    await assert.rejects(
        () =>
            execFile('bash', [
                join(templateDirectory, 'scripts/ci/deploy-release.sh'),
                'production',
                'release-1',
                'abc123',
            ]),
        /Unsupported deployment target/
    );
});

test('deploy-release rejects an invalid package before deployment', async (t) => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.directory, { recursive: true, force: true }));
    await mkdir(join(fixture.directory, 'scripts', 'ci'), { recursive: true });
    await copyFile(
        join(templateDirectory, 'scripts', 'ci', 'deploy-release.sh'),
        join(fixture.directory, 'scripts', 'ci', 'deploy-release.sh')
    );
    await copyFile(
        join(templateDirectory, 'scripts', 'ci', 'release-artifacts.mjs'),
        join(fixture.directory, 'scripts', 'ci', 'release-artifacts.mjs')
    );

    await assert.rejects(
        () =>
            execFile('bash', ['scripts/ci/deploy-release.sh', 'test', 'release-other', 'abc123', 'manifest.json'], {
                cwd: fixture.directory,
            }),
        /Release ID mismatch/
    );
});
