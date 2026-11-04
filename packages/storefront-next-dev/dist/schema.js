import { z } from "zod";

//#region src/audit/bundle/schema.ts
/** Where `prepare` writes the bundle analysis, relative to the run folder. */
const BUNDLE_DIR = "bundle";
const BUNDLE_ANALYSIS = `${BUNDLE_DIR}/analysis.json`;
/** The build's visualizer report, copied into the run for the user to open. */
const BUNDLE_VISUALIZER = `${BUNDLE_DIR}/client-bundle-size.html`;
const BUNDLE_SCHEMA_VERSION = 2;
/**
* The smallest saving worth a recommendation: 30 KiB of minified JavaScript, about 10 KiB over the network. Below it a
* change costs more review than it saves; the big wins (a 100–200 KiB library loaded for a closed overlay) are far above.
*/
const MIN_RECOMMENDED_BYTES = 30 * 1024;
const bytes = z.number().int().nonnegative();
/** A source file: project-relative (`src/components/header.tsx`) or within a package (`zod/v4/core/schemas.js`). */
const sourceRef = z.object({
	file: z.string(),
	line: z.number().int().positive().optional(),
	excerpt: z.string().optional()
}).strict();
/** Who owns a module: an npm package, a project folder, or bytes the bundler adds. */
const ownerKindSchema = z.enum([
	"npm",
	"project",
	"build"
]);
/** What the browser downloaded on the deployed site: sizes only, since its files can't be tied to the local build. */
const liveTotalsSchema = z.object({
	scripts: z.number().int().nonnegative(),
	decodedBytes: bytes,
	transferBytes: bytes,
	beforeLoad: z.number().int().nonnegative(),
	beforeLoadDecodedBytes: bytes,
	beforeLoadTransferBytes: bytes
}).strict();
const bundlePackageSchema = z.object({
	name: z.string(),
	kind: ownerKindSchema,
	bytes,
	modules: z.number().int().nonnegative(),
	largestModules: z.array(z.object({
		file: z.string(),
		bytes
	}).strict()),
	versions: z.array(z.string()).optional(),
	importers: z.array(sourceRef),
	importerCount: z.number().int().nonnegative(),
	deferrableBytes: bytes.optional()
}).strict();
const bundleCandidateSchema = z.object({
	importer: sourceRef,
	target: z.string(),
	package: z.string(),
	savedBytes: bytes,
	savedModules: z.number().int().positive(),
	lazyElsewhere: z.array(z.string()).optional()
}).strict();
const bundleChunkSchema = z.object({
	file: z.string(),
	bytes,
	owners: z.array(z.object({
		name: z.string(),
		bytes
	}).strict())
}).strict();
/** The page's routes in the local build: everything here comes from building the project folder, not from the live site. */
const localPageSchema = z.object({
	chunks: z.number().int().nonnegative(),
	bytes,
	largest: z.array(bundleChunkSchema),
	packages: z.array(bundlePackageSchema),
	candidates: z.array(bundleCandidateSchema)
}).strict();
const bundlePageSchema = z.object({
	page: z.string(),
	runId: z.string(),
	lighthouseArtifact: z.string(),
	observedLoadMs: z.number().nullable(),
	live: liveTotalsSchema,
	route: z.object({
		ids: z.array(z.string()).min(1),
		source: z.enum(["page", "url"])
	}).strict().nullable(),
	local: localPageSchema.nullable()
}).strict();
const bundleAnalysisSchema = z.object({
	schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
	status: z.enum([
		"complete",
		"partial",
		"unavailable"
	]),
	notes: z.array(z.string()),
	build: z.object({
		packageManager: z.string(),
		durationMs: z.object({
			analyze: z.number().nullable(),
			plain: z.number().nullable()
		}).strict(),
		visualizer: z.string().nullable(),
		chunks: z.number().int().nonnegative(),
		withMaps: z.number().int().nonnegative(),
		bytes,
		attribution: z.object({
			modules: bytes,
			unmappedModules: bytes,
			preloadLists: bytes,
			routerManifest: bytes,
			glue: bytes
		}).strict()
	}).strict().nullable(),
	pages: z.array(bundlePageSchema),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();

//#endregion
export { MIN_RECOMMENDED_BYTES as a, bundlePackageSchema as c, BUNDLE_VISUALIZER as i, bundlePageSchema as l, BUNDLE_DIR as n, bundleAnalysisSchema as o, BUNDLE_SCHEMA_VERSION as r, bundleCandidateSchema as s, BUNDLE_ANALYSIS as t };