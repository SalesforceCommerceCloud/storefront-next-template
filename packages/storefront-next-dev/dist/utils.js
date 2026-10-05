import { t as logger } from "./logger.js";
import { execSync } from "child_process";
import os from "os";
import path from "path";
import fs from "fs-extra";

//#region src/utils.ts
const getDefaultBuildDir = (targetDir) => path.join(targetDir, "build");
const NODE_ENV = process.env.NODE_ENV || "development";
/**
* Get project package.json
*/
const getProjectPkg = (projectDir) => {
	const packagePath = path.join(projectDir, "package.json");
	try {
		return fs.readJSONSync(packagePath);
	} catch {
		throw new Error(`Could not read project package at "${packagePath}"`);
	}
};
/**
* Get MRT configuration with priority logic: .env -> package.json -> defaults
*
* Note: .env loading is handled once at startup in the oclif init hook (src/hooks/init.ts) before any command runs.
*/
const getMrtConfig = (projectDir) => {
	const pkg = getProjectPkg(projectDir);
	const defaultMrtProject = process.env.MRT_PROJECT ?? pkg.name;
	if (!defaultMrtProject || defaultMrtProject.trim() === "") throw new Error("Project name couldn't be determined. Do one of these options:\n  1. Set MRT_PROJECT in your .env file, or\n  2. Ensure package.json has a valid \"name\" field.");
	const defaultMrtTarget = process.env.MRT_ENVIRONMENT ?? process.env.MRT_TARGET ?? void 0;
	logger.debug("MRT configuration resolved", {
		projectDir,
		envMrtProject: process.env.MRT_PROJECT,
		envMrtEnvironment: process.env.MRT_ENVIRONMENT,
		envMrtTarget: process.env.MRT_TARGET,
		packageName: pkg.name,
		resolvedProject: defaultMrtProject,
		resolvedTarget: defaultMrtTarget
	});
	return {
		defaultMrtProject,
		defaultMrtTarget
	};
};
/**
* Get project dependency tree (simplified version)
*/
const getProjectDependencyTree = (projectDir) => {
	try {
		const tmpFile = path.join(os.tmpdir(), `npm-ls-${Date.now()}.json`);
		execSync(`npm ls --all --json > ${tmpFile}`, {
			stdio: "ignore",
			cwd: projectDir
		});
		const data = fs.readJSONSync(tmpFile);
		fs.unlinkSync(tmpFile);
		return data;
	} catch {
		return null;
	}
};
/**
* Get PWA Kit dependencies from dependency tree
*/
const getPwaKitDependencies = (dependencyTree) => {
	if (!dependencyTree) return {};
	const pwaKitDependencies = ["@salesforce/storefront-next-dev"];
	const result = {};
	const searchDeps = (tree) => {
		if (tree.dependencies) for (const [name, dep] of Object.entries(tree.dependencies)) {
			if (pwaKitDependencies.includes(name)) result[name] = dep.version || "unknown";
			if (dep.dependencies) searchDeps({ dependencies: dep.dependencies });
		}
	};
	searchDeps(dependencyTree);
	return result;
};
/**
* Get default commit message from git
*/
const getDefaultMessage = (projectDir) => {
	try {
		return `${execSync("git rev-parse --abbrev-ref HEAD", {
			encoding: "utf8",
			cwd: projectDir
		}).trim()}: ${execSync("git rev-parse --short HEAD", {
			encoding: "utf8",
			cwd: projectDir
		}).trim()}`;
	} catch {
		logger.debug("Using default bundle message as no message was provided and not in a Git repo.");
		return "PWA Kit Bundle";
	}
};
/**
* Given a project directory and a record of config overrides, generate a new .env file with the overrides based on the .env.default file.
* @param projectDir
* @param configOverrides
*/
const generateEnvFile = (projectDir, configOverrides) => {
	const envDefaultPath = path.join(projectDir, ".env.default");
	const envPath = path.join(projectDir, ".env");
	if (!fs.existsSync(envDefaultPath)) {
		console.warn(`${envDefaultPath} not found`);
		return;
	}
	const envOutputLines = fs.readFileSync(envDefaultPath, "utf8").split("\n").map((line) => {
		if (!line || line.trim().startsWith("#")) return line;
		const eqIndex = line.indexOf("=");
		if (eqIndex === -1) return line;
		const key = line.slice(0, eqIndex);
		const originalValue = line.slice(eqIndex + 1);
		return `${key}=${(Object.prototype.hasOwnProperty.call(configOverrides, key) ? configOverrides[key] : void 0) ?? originalValue}`;
	});
	fs.writeFileSync(envPath, envOutputLines.join("\n"));
};

//#endregion
export { getProjectDependencyTree as a, getMrtConfig as i, getDefaultBuildDir as n, getProjectPkg as o, getDefaultMessage as r, getPwaKitDependencies as s, generateEnvFile as t };