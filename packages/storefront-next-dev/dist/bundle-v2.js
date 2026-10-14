import { a as getProjectDependencyTree, o as getProjectPkg, s as getPwaKitDependencies } from "./utils.js";
import os from "os";
import path from "path";
import fs from "fs-extra";
import { Minimatch } from "minimatch";
import archiver from "archiver";

//#region src/bundle.ts
/**
* Create a bundle from the build directory
*/
/**
* Dependencies recorded in bundle metadata: the project's declared dependencies
* plus the resolved versions of PWA Kit / Storefront Next packages.
*/
const getBundleDependencies = (projectDirectory) => {
	const { dependencies = {}, devDependencies = {} } = getProjectPkg(projectDirectory);
	const dependencyTree = getProjectDependencyTree(projectDirectory);
	const pwaKitDeps = dependencyTree ? getPwaKitDependencies(dependencyTree) : {};
	return {
		...dependencies,
		...devDependencies,
		...pwaKitDeps
	};
};
const createBundle = async (options) => {
	const { message, ssr_parameters, ssr_only, ssr_shared, buildDirectory, projectDirectory, projectSlug } = options;
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "storefront-next-dev-push-"));
	const destination = path.join(tmpDir, "build.tar");
	const filesInArchive = [];
	if (!ssr_only || ssr_only.length === 0 || !ssr_shared || ssr_shared.length === 0) throw new Error("no ssrOnly or ssrShared files are defined");
	return new Promise((resolve, reject) => {
		const output = fs.createWriteStream(destination);
		const archive = archiver("tar");
		archive.pipe(output);
		const newRoot = path.join(projectSlug, "bld", "");
		const storybookExclusionMatchers = [
			"**/*.stories.tsx",
			"**/*.stories.ts",
			"**/*-snapshot.tsx",
			".storybook/**/*",
			"storybook-static/**/*",
			"**/__mocks__/**/*",
			"**/__snapshots__/**/*"
		].map((pattern) => new Minimatch(pattern, { nocomment: true }));
		archive.directory(buildDirectory, "", (entry) => {
			if (entry.name && storybookExclusionMatchers.some((matcher) => matcher.match(entry.name))) return false;
			if (entry.stats?.isFile() && entry.name) filesInArchive.push(entry.name);
			entry.prefix = newRoot;
			return entry;
		});
		archive.on("error", reject);
		output.on("finish", () => {
			try {
				const bundle_metadata = { dependencies: getBundleDependencies(projectDirectory) };
				const data = fs.readFileSync(destination);
				const encoding = "base64";
				fs.rmSync(tmpDir, { recursive: true });
				const createGlobMatcher = (patterns) => {
					const allPatterns = patterns.map((pattern) => new Minimatch(pattern, { nocomment: true })).filter((pattern) => !pattern.empty);
					const positivePatterns = allPatterns.filter((pattern) => !pattern.negate);
					const negativePatterns = allPatterns.filter((pattern) => pattern.negate);
					return (filePath) => {
						if (filePath) {
							const positive = positivePatterns.some((pattern) => pattern.match(filePath));
							const negative = negativePatterns.some((pattern) => !pattern.match(filePath));
							return positive && !negative;
						}
						return false;
					};
				};
				resolve({
					message,
					encoding,
					data: data.toString(encoding),
					ssr_parameters,
					ssr_only: filesInArchive.filter(createGlobMatcher(ssr_only)),
					ssr_shared: filesInArchive.filter(createGlobMatcher(ssr_shared)),
					bundle_metadata
				});
			} catch (err) {
				reject(err);
			}
		});
		archive.finalize().catch(reject);
	});
};

//#endregion
//#region src/bundle-v2.ts
/** config.server.ts SSR parameter keys and their v2 bundle (PascalCase) equivalents. */
const V2_SSR_PARAMETER_KEYS = {
	ssrFunctionNodeVersion: "SSRFunctionNodeVersion",
	envBasePath: "EnvBasePath"
};
/** Rename known camelCase SSR parameters to the PascalCase keys the v2 bundle config expects. */
function toV2SsrParameters(params) {
	return Object.fromEntries(Object.entries(params).map(([key, value]) => [V2_SSR_PARAMETER_KEYS[key] ?? key, value]));
}

//#endregion
export { createBundle as n, getBundleDependencies as r, toV2SsrParameters as t };