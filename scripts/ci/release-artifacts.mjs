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

import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_SCHEMA_VERSION = 1;
const REQUIRED_ARTIFACTS = ['build', 'cartridges'];
const OPTIONAL_ARTIFACTS = ['migrations'];
const ARTIFACT_NAMES = new Set([...REQUIRED_ARTIFACTS, ...OPTIONAL_ARTIFACTS]);

const usage = `Usage:
  node scripts/ci/release-artifacts.mjs create-manifest <release-id> <source-commit> <artifact-dir> <build-archive> <cartridges-archive> [migrations-archive]
  node scripts/ci/release-artifacts.mjs verify-manifest <manifest>
  node scripts/ci/release-artifacts.mjs verify-release <manifest> <release-id> <source-commit>
  node scripts/ci/release-artifacts.mjs artifact-path <manifest> <build|cartridges|migrations>
  node scripts/ci/release-artifacts.mjs release-id <manifest>`;

function isSafeArtifactFilename(filename) {
    return (
        typeof filename === 'string' &&
        filename.length > 0 &&
        filename === basename(filename) &&
        !isAbsolute(filename) &&
        !filename.includes('..') &&
        !filename.includes(sep)
    );
}

function assertManifestShape(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('Release manifest must be a JSON object.');
    }
    if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
        throw new Error(`Unsupported release manifest schema version: ${String(manifest.schemaVersion)}.`);
    }
    if (typeof manifest.releaseId !== 'string' || manifest.releaseId.length === 0) {
        throw new Error('Release manifest releaseId must be a non-empty string.');
    }
    if (typeof manifest.sourceCommit !== 'string' || manifest.sourceCommit.length === 0) {
        throw new Error('Release manifest sourceCommit must be a non-empty string.');
    }
    if (!manifest.artifacts || typeof manifest.artifacts !== 'object' || Array.isArray(manifest.artifacts)) {
        throw new Error('Release manifest artifacts must be an object.');
    }

    for (const name of Object.keys(manifest.artifacts)) {
        if (!ARTIFACT_NAMES.has(name)) throw new Error(`Release manifest has an unsupported artifact: ${name}.`);
    }
    for (const name of REQUIRED_ARTIFACTS) {
        if (!manifest.artifacts[name]) throw new Error(`Release manifest is missing required ${name} artifact.`);
    }
    for (const [name, artifact] of Object.entries(manifest.artifacts)) {
        if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
            throw new Error(`Release manifest ${name} artifact must be an object.`);
        }
        if (!isSafeArtifactFilename(artifact.file)) {
            throw new Error(`Release manifest ${name} artifact has an unsafe filename.`);
        }
        if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) {
            throw new Error(`Release manifest ${name} artifact has an invalid SHA-256 checksum.`);
        }
    }
}

async function sha256(filePath) {
    return createHash('sha256')
        .update(await readFile(filePath))
        .digest('hex');
}

async function readManifest(manifestPath) {
    let manifest;
    try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
        throw new Error(
            `Unable to read release manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error }
        );
    }
    assertManifestShape(manifest);
    return manifest;
}

async function artifactEntry(filePath) {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error(`Release artifact is not a file: ${filePath}`);
    return { file: basename(filePath), sha256: await sha256(filePath) };
}

export async function createManifest({ releaseId, sourceCommit, artifactDirectory, artifacts }) {
    if (!releaseId || !sourceCommit || !artifactDirectory) throw new Error(usage);
    for (const name of REQUIRED_ARTIFACTS) {
        if (!artifacts?.[name]) throw new Error(`Missing required ${name} archive.`);
    }

    const manifestArtifacts = {};
    const resolvedArtifactDirectory = resolve(artifactDirectory);
    for (const name of [...REQUIRED_ARTIFACTS, ...OPTIONAL_ARTIFACTS]) {
        if (!artifacts[name]) continue;
        if (dirname(resolve(artifacts[name])) !== resolvedArtifactDirectory) {
            throw new Error(`Release ${name} archive must be inside ${artifactDirectory}.`);
        }
        manifestArtifacts[name] = await artifactEntry(artifacts[name]);
    }

    const manifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        releaseId,
        sourceCommit,
        artifacts: manifestArtifacts,
    };
    assertManifestShape(manifest);

    const manifestPath = join(artifactDirectory, 'manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifestPath;
}

export async function verifyManifest(manifestPath) {
    const manifest = await readManifest(manifestPath);
    const artifactDirectory = dirname(manifestPath);

    for (const [name, artifact] of Object.entries(manifest.artifacts)) {
        const artifactPath = join(artifactDirectory, artifact.file);
        let actualChecksum;
        try {
            actualChecksum = await sha256(artifactPath);
        } catch (error) {
            throw new Error(
                `Release ${name} artifact is missing or unreadable: ${artifactPath} (${error instanceof Error ? error.message : String(error)}).`,
                { cause: error }
            );
        }
        if (actualChecksum !== artifact.sha256) {
            throw new Error(
                `Release ${name} artifact checksum mismatch: expected ${artifact.sha256}, received ${actualChecksum}.`
            );
        }
    }
    return manifest;
}

export async function verifyRelease(manifestPath, expectedReleaseId, expectedSourceCommit) {
    if (!expectedReleaseId || !expectedSourceCommit) throw new Error(usage);
    const manifest = await verifyManifest(manifestPath);
    if (manifest.releaseId !== expectedReleaseId) {
        throw new Error(`Release ID mismatch: expected ${expectedReleaseId}, received ${manifest.releaseId}.`);
    }
    if (manifest.sourceCommit !== expectedSourceCommit) {
        throw new Error(`Source commit mismatch: expected ${expectedSourceCommit}, received ${manifest.sourceCommit}.`);
    }
    return manifest;
}

export async function getArtifactPath(manifestPath, artifactName) {
    const manifest = await readManifest(manifestPath);
    if (!ARTIFACT_NAMES.has(artifactName)) throw new Error(`Unsupported release artifact: ${artifactName}.`);
    const artifact = manifest.artifacts[artifactName];
    if (!artifact) throw new Error(`Release manifest has no ${artifactName} artifact.`);
    return join(dirname(manifestPath), artifact.file);
}

async function runCommand(command, args) {
    switch (command) {
        case 'create-manifest': {
            const [releaseId, sourceCommit, artifactDirectory, build, cartridges, migrations] = args;
            const manifestPath = await createManifest({
                releaseId,
                sourceCommit,
                artifactDirectory,
                artifacts: { build, cartridges, migrations },
            });
            process.stdout.write(`${manifestPath}\n`);
            return;
        }
        case 'verify-manifest':
            if (args.length !== 1) throw new Error(usage);
            await verifyManifest(args[0]);
            return;
        case 'verify-release':
            if (args.length !== 3) throw new Error(usage);
            await verifyRelease(args[0], args[1], args[2]);
            return;
        case 'artifact-path':
            if (args.length !== 2) throw new Error(usage);
            process.stdout.write(`${await getArtifactPath(args[0], args[1])}\n`);
            return;
        case 'release-id': {
            if (args.length !== 1) throw new Error(usage);
            process.stdout.write(`${(await readManifest(args[0])).releaseId}\n`);
            return;
        }
        default:
            throw new Error(usage);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    const [, , command, ...args] = process.argv;
    runCommand(command, args).catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
