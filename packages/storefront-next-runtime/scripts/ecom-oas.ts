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
 * Fetches SCAPI specs from the ECOM monorepo. ECOM's build commits one bundled,
 * self-contained public spec per API next to a `manifest.json` recording the API's
 * identity, schema version and SHA-256, so this module copies those bundles instead
 * of bundling the authoring sources itself.
 *
 * The ECOM git URL and bundle path are internal, and this repository is mirrored to a
 * separate GitHub repo, so they are read from the environment instead of being committed. No
 * credential is stored either: git authenticates with whatever the developer machine
 * already has.
 *
 * Environment variables (both required):
 *   ECOM_REPO_URL      Git URL of the ECOM monorepo, e.g. `https://<ecom-git-host>/<org>/<repo>.git`.
 *   ECOM_BUNDLES_ROOT  Directory in that repo holding the committed bundles, relative
 *                      to the repo root, e.g. `<path/to/scapi/bundles>`.
 */

import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { RELEASE_SEMVER } from './spec-version.ts';

export interface EcomSource {
    repoUrl: string;
    bundlesRoot: string;
}

/**
 * Values are trimmed because a pasted URL commonly carries a trailing newline
 * that git rejects, and a trailing slash on the root is dropped.
 * @throws if `ECOM_REPO_URL` or `ECOM_BUNDLES_ROOT` is unset or blank
 */
export function readEcomSource(env: NodeJS.ProcessEnv): EcomSource {
    const value = (name: string): string => env[name]?.trim() ?? '';
    const missing = ['ECOM_REPO_URL', 'ECOM_BUNDLES_ROOT'].filter((name) => !value(name));
    if (missing.length > 0) {
        throw new Error(
            `${missing.join(' and ')} not set. The ECOM location is internal and not stored in this repository; ` +
                `ask the SF Next team for the values.`
        );
    }
    return { repoUrl: value('ECOM_REPO_URL'), bundlesRoot: value('ECOM_BUNDLES_ROOT').replace(/\/+$/, '') };
}

/**
 * Only `master` carries the bundles until the next ECOM release branch is cut.
 */
export const DEFAULT_ECOM_REF = 'master';

/**
 * Where ECOM publishes the bundle for each tracked API, relative to the bundles root.
 * Keys are `<assetId>-<apiVersion>`, matching the `exchange.json` of each folder in
 * `openapi-specs/`. A new API is only tracked once it is added here and its folder exists.
 */
export const ECOM_BUNDLE_LOCATIONS: Record<string, string> = {
    'auth-oas-v1': 'shopper/shopper/auth/v1',
    'shopper-availability-oas-v1': 'shopper/product/shopper-availability/v1',
    'shopper-baskets-oas-v1': 'shopper/checkout/shopper-baskets/v1',
    'shopper-baskets-oas-v2': 'shopper/checkout/shopper-baskets/v2',
    'shopper-configurations-oas-v1': 'shopper/configuration/shopper-configurations/v1',
    'shopper-consents-oas-v1': 'shopper/shopper/shopper-consents/v1',
    'shopper-context-oas-v1': 'shopper/shopper/shopper-context/v1',
    'shopper-customers-oas-v1': 'shopper/customer/shopper-customers/v1',
    'shopper-delivery-estimates-oas-v1': 'shopper/product/shopper-delivery-estimates/v1',
    'shopper-experience-oas-v1': 'shopper/experience/shopper-experience/v1',
    'shopper-gift-certificates-oas-v1': 'shopper/pricing/shopper-gift-certificates/v1',
    'shopper-orders-oas-v1': 'shopper/checkout/shopper-orders/v1',
    'shopper-payments-oas-v1': 'shopper/checkout/shopper-payments/v1',
    'shopper-products-oas-v1': 'shopper/product/shopper-products/v1',
    'shopper-promotions-oas-v1': 'shopper/pricing/shopper-promotions/v1',
    'shopper-search-oas-v1': 'shopper/search/shopper-search/v1',
    'shopper-seo-oas-v1': 'shopper/site/shopper-seo/v1',
    'shopper-stores-oas-v1': 'shopper/store/shopper-stores/v1',
};

/**
 * Sparse, shallow-checks out only the given bundle directories (relative to the
 * bundles root) into `targetDir` at one ref. Returns the absolute path of the
 * checked-out bundles root and the commit SHA the ref resolved to.
 */
export function fetchEcomBundles(
    source: EcomSource,
    targetDir: string,
    ref: string,
    bundleLocations: string[]
): { bundlesRoot: string; commitSha: string } {
    fs.mkdirSync(targetDir, { recursive: true });

    const git = (...args: string[]): string =>
        execFileSync('git', args, { cwd: targetDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] });

    git('init', '-q');
    git('remote', 'add', 'origin', source.repoUrl);
    git('sparse-checkout', 'init', '--cone');
    git('sparse-checkout', 'set', ...bundleLocations.map((location) => `${source.bundlesRoot}/${location}`));
    try {
        git('fetch', '--depth', '1', '--filter=blob:none', 'origin', '--', ref);
    } catch (error) {
        throw new Error(
            `Could not fetch "${ref}" from ECOM (git output above). Check the branch, tag or commit exists.`,
            { cause: error }
        );
    }
    git('checkout', '-q', 'FETCH_HEAD');

    const bundlesRoot = path.join(targetDir, source.bundlesRoot);
    if (!fs.existsSync(bundlesRoot)) {
        throw new Error(`"${ref}" has none of the requested bundles; the ref may predate ECOM publishing them.`);
    }
    return { bundlesRoot, commitSha: git('rev-parse', 'HEAD').trim() };
}

interface BundleManifest {
    apiName: string;
    apiVersion: string;
    schemaVersion: string;
    internalOnly: boolean;
    artifacts?: { public?: { path: string; sha256: string } };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Narrows parsed manifest JSON to `BundleManifest`. A field that is missing or the wrong
 * type must fail here: `internalOnly` in particular would otherwise read as `false`
 * and let an internal-only API through as public.
 * @throws if a field the updater relies on is missing or has the wrong type
 */
function parseManifest(raw: unknown, location: string): BundleManifest {
    const malformed = (detail: string): Error => new Error(`${location} has a malformed manifest: ${detail}`);
    if (!isRecord(raw)) {
        throw malformed('expected a JSON object');
    }
    for (const field of ['apiName', 'apiVersion', 'schemaVersion'] as const) {
        if (typeof raw[field] !== 'string') {
            throw malformed(`${field} must be a string`);
        }
    }
    if (typeof raw.internalOnly !== 'boolean') {
        throw malformed('internalOnly must be a boolean');
    }
    const publicArtifact = isRecord(raw.artifacts) ? raw.artifacts.public : undefined;
    if (
        publicArtifact !== undefined &&
        !(
            isRecord(publicArtifact) &&
            typeof publicArtifact.path === 'string' &&
            typeof publicArtifact.sha256 === 'string'
        )
    ) {
        throw malformed('artifacts.public needs a string path and sha256');
    }
    return raw as unknown as BundleManifest;
}

export interface BundledApi {
    /** SemVer of the spec, e.g. "1.15.0". */
    version: string;
    /** Absolute path to ECOM's public bundle. */
    publicSpec: string;
}

/**
 * Reads the manifest at `<bundlesRoot>/<location>` and returns the public bundle for
 * the tracked key `apiKey` (e.g. "shopper-baskets-oas-v1").
 * @throws if there is no manifest, it is malformed, it describes a different API, the API is internal-only
 * or has no public artifact, its schemaVersion is not semver or its major differs from the
 * API version, its bundle path leaves the bundle folder, or the bundle does not match the
 * SHA-256 in its manifest
 */
export function loadBundledApi(bundlesRoot: string, apiKey: string, location: string): BundledApi {
    const manifestFile = path.join(bundlesRoot, location, 'manifest.json');
    if (!fs.existsSync(manifestFile)) {
        throw new Error(`No bundle manifest for ${apiKey} at ${location}`);
    }
    const manifest = parseManifest(JSON.parse(fs.readFileSync(manifestFile, 'utf-8')), location);

    const manifestKey = `${manifest.apiName}-oas-${manifest.apiVersion}`;
    if (manifestKey !== apiKey) {
        throw new Error(`${location} describes ${manifestKey}, not ${apiKey}; fix its entry in ECOM_BUNDLE_LOCATIONS`);
    }

    if (manifest.internalOnly) {
        throw new Error(`${apiKey} is internal-only in ECOM and has no public bundle`);
    }
    const artifact = manifest.artifacts?.public;
    if (!artifact) {
        throw new Error(`${apiKey} has no public artifact in its manifest at ${location}`);
    }

    if (!RELEASE_SEMVER.test(manifest.schemaVersion)) {
        throw new Error(`${apiKey} has schemaVersion "${manifest.schemaVersion}", expected MAJOR.MINOR.PATCH`);
    }
    if (`v${manifest.schemaVersion.split('.')[0]}` !== manifest.apiVersion) {
        throw new Error(
            `${apiKey} has schemaVersion ${manifest.schemaVersion}, which does not match ${manifest.apiVersion}`
        );
    }

    if (!path.posix.normalize(artifact.path).startsWith(`${location}/`)) {
        throw new Error(`${apiKey} manifest points at ${artifact.path}, outside its bundle folder ${location}`);
    }

    const publicSpec = path.join(bundlesRoot, artifact.path);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(publicSpec)).digest('hex');
    if (sha256 !== artifact.sha256) {
        throw new Error(
            `${artifact.path} does not match the SHA-256 in its manifest; ECOM's bundles are stale at this ref`
        );
    }

    return { version: manifest.schemaVersion, publicSpec };
}
