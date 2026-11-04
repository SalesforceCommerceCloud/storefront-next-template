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
import { z } from 'zod';

/** Where `prepare` writes the bundle analysis, relative to the run folder. */
export const BUNDLE_DIR = 'bundle';
export const BUNDLE_ANALYSIS = `${BUNDLE_DIR}/analysis.json`;
/** The build's visualizer report, copied into the run for the user to open. */
export const BUNDLE_VISUALIZER = `${BUNDLE_DIR}/client-bundle-size.html`;
export const BUNDLE_SCHEMA_VERSION = 2;
/**
 * The smallest saving worth a recommendation: 30 KiB of minified JavaScript, about 10 KiB over the network. Below it a
 * change costs more review than it saves; the big wins (a 100–200 KiB library loaded for a closed overlay) are far above.
 */
export const MIN_RECOMMENDED_BYTES = 30 * 1024;

const bytes = z.number().int().nonnegative();
/** A source file: project-relative (`src/components/header.tsx`) or within a package (`zod/v4/core/schemas.js`). */
const sourceRef = z
    .object({ file: z.string(), line: z.number().int().positive().optional(), excerpt: z.string().optional() })
    .strict();

/** Who owns a module: an npm package, a project folder, or bytes the bundler adds. */
export const ownerKindSchema = z.enum(['npm', 'project', 'build']);

/** What the browser downloaded on the deployed site: sizes only, since its files can't be tied to the local build. */
export const liveTotalsSchema = z
    .object({
        scripts: z.number().int().nonnegative(),
        decodedBytes: bytes,
        transferBytes: bytes,
        beforeLoad: z.number().int().nonnegative(),
        beforeLoadDecodedBytes: bytes,
        beforeLoadTransferBytes: bytes,
    })
    .strict();

export const bundlePackageSchema = z
    .object({
        name: z.string(),
        kind: ownerKindSchema,
        /** Minified bytes of its modules in the page's initial chunks. */
        bytes,
        modules: z.number().int().nonnegative(),
        /** Its largest modules on the page, by minified bytes: what of it the page actually pulls in. */
        largestModules: z.array(z.object({ file: z.string(), bytes }).strict()),
        /** More than one installed version is bundled (npm packages only). */
        versions: z.array(z.string()).optional(),
        /** Project files that import it statically, each once; the first few. */
        importers: z.array(sourceRef),
        importerCount: z.number().int().nonnegative(),
        /** Bytes freed if every one of those project imports became lazy; absent when no project file imports it. */
        deferrableBytes: bytes.optional(),
    })
    .strict();

export const bundleCandidateSchema = z
    .object({
        importer: sourceRef,
        /** The imported module, displayed like `importer.file`. */
        target: z.string(),
        package: z.string(),
        /** Minified bytes the page would no longer load up front if this one import became lazy. */
        savedBytes: bytes,
        savedModules: z.number().int().positive(),
        /** Project files that already import the target with `import()`: the static import here defeats that split. */
        lazyElsewhere: z.array(z.string()).optional(),
    })
    .strict();

export const bundleChunkSchema = z
    .object({
        file: z.string(),
        bytes,
        /** Its largest owners, by minified bytes. */
        owners: z.array(z.object({ name: z.string(), bytes }).strict()),
    })
    .strict();

/** The page's routes in the local build: everything here comes from building the project folder, not from the live site. */
export const localPageSchema = z
    .object({
        /** The chunks React Router loads up front for these routes (the entry, each route module and their static imports). */
        chunks: z.number().int().nonnegative(),
        bytes,
        largest: z.array(bundleChunkSchema),
        /** Owners of that code, largest first. */
        packages: z.array(bundlePackageSchema),
        /** Static imports in project code that pull the most code into the page, largest first. Empty without the module graph. */
        candidates: z.array(bundleCandidateSchema),
    })
    .strict();

export const bundlePageSchema = z
    .object({
        page: z.string(),
        runId: z.string(),
        lighthouseArtifact: z.string(),
        observedLoadMs: z.number().nullable(),
        /** First-party scripts the live page loaded in its mobile cold-cache median run. */
        live: liveTotalsSchema,
        /**
         * The route branch, root first: the ids the live page's HTML names (route ids are file names, stable across builds),
         * else the local routes whose paths match the page URL.
         */
        route: z
            .object({ ids: z.array(z.string()).min(1), source: z.enum(['page', 'url']) })
            .strict()
            .nullable(),
        /** Null without a build, or when the route isn't in it. */
        local: localPageSchema.nullable(),
    })
    .strict();

export const bundleAnalysisSchema = z
    .object({
        schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
        /** complete: build and module graph; partial: one of them is missing; unavailable: no build. */
        status: z.enum(['complete', 'partial', 'unavailable']),
        /** Why the analysis is partial or unavailable, and anything that makes its numbers less certain. */
        notes: z.array(z.string()),
        build: z
            .object({
                packageManager: z.string(),
                durationMs: z.object({ analyze: z.number().nullable(), plain: z.number().nullable() }).strict(),
                /** The visualizer report in the run, when the analyze build wrote one. */
                visualizer: z.string().nullable(),
                chunks: z.number().int().nonnegative(),
                withMaps: z.number().int().nonnegative(),
                bytes,
                /** Every byte of the client build, in exactly one category. */
                attribution: z
                    .object({
                        modules: bytes,
                        unmappedModules: bytes,
                        preloadLists: bytes,
                        routerManifest: bytes,
                        glue: bytes,
                    })
                    .strict(),
            })
            .strict()
            .nullable(),
        pages: z.array(bundlePageSchema),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();

export type BundleAnalysis = z.infer<typeof bundleAnalysisSchema>;
export type BundlePage = z.infer<typeof bundlePageSchema>;
export type LocalPage = z.infer<typeof localPageSchema>;
export type BundleCandidate = z.infer<typeof bundleCandidateSchema>;
export type BundlePackage = z.infer<typeof bundlePackageSchema>;
