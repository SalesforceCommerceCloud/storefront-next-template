//#region src/design/preload/index.ts
const PRIORITY = {
	style: 0,
	entry: 1,
	dependency: 2
};
function validateManifest(manifest) {
	if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.resources) || !manifest.components || !manifest.compression) throw new Error("Unsupported or malformed Page Designer preload manifest");
}
function estimatedBytes(resource, strategy) {
	if (strategy === "brotli") return resource.estimatedBrotliBytes;
	if (strategy === "gzip") return resource.estimatedGzipBytes;
	return Math.max(resource.estimatedBrotliBytes, resource.estimatedGzipBytes);
}
function joinBundlePath(bundlePath, file) {
	let base = bundlePath.replace(/\/+$/, "");
	let relativeFile = file.replace(/^\/+/, "");
	if (base.endsWith("/assets") && relativeFile.startsWith("assets/")) relativeFile = relativeFile.slice(7);
	if (!base) base = "";
	return `${base}/${relativeFile}`;
}
function dedupePreloadResources(resources) {
	const seen = /* @__PURE__ */ new Set();
	return resources.filter((resource) => {
		const key = `${resource.kind}:${resource.href}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
function resolvePreloadResources(manifest, typeIds, options) {
	validateManifest(manifest);
	const strategy = options.compressedSizeStrategy ?? "max";
	const maxModuleEstimatedTransferBytes = options.maxModuleEstimatedTransferBytes ?? 25e4;
	const maxModuleRawBytes = options.maxModuleRawBytes ?? 75e4;
	const warnAtResources = options.warnAtResources ?? 40;
	const unknownTypeIds = /* @__PURE__ */ new Set();
	const byFile = /* @__PURE__ */ new Map();
	let encounterOrder = 0;
	const addResources = (indices, role) => {
		for (const index of indices ?? []) {
			const resource = manifest.resources[index];
			if (!resource) throw new Error(`Page Designer preload manifest references missing resource ${index}`);
			const existing = byFile.get(resource.file);
			if (!existing) byFile.set(resource.file, {
				...resource,
				role,
				encounterOrder: encounterOrder++
			});
			else if (PRIORITY[role] < PRIORITY[existing.role]) byFile.set(resource.file, {
				...resource,
				role,
				encounterOrder: existing.encounterOrder
			});
		}
	};
	for (const typeId of new Set(typeIds)) {
		const component = manifest.components[typeId];
		if (!component) {
			unknownTypeIds.add(typeId);
			continue;
		}
		addResources(component.styles, "style");
		addResources(component.entries, "entry");
		addResources(component.dependencies, "dependency");
	}
	if (unknownTypeIds.size > 0) options.onWarning?.({
		code: "unknown-type-ids",
		typeIds: [...unknownTypeIds].sort()
	});
	const candidates = [...byFile.values()].sort((a, b) => {
		const roleDifference = PRIORITY[a.role] - PRIORITY[b.role];
		if (roleDifference !== 0) return roleDifference;
		return a.role === "style" ? a.encounterOrder - b.encounterOrder : a.file.localeCompare(b.file);
	});
	let selectedModuleEstimatedTransferBytes = 0;
	let selectedModuleRawBytes = 0;
	const selected = [];
	const omittedModules = [];
	for (const resource of candidates) {
		if (resource.role === "style") {
			selected.push(resource);
			continue;
		}
		const charge = estimatedBytes(resource, strategy);
		if (selectedModuleEstimatedTransferBytes + charge > maxModuleEstimatedTransferBytes || selectedModuleRawBytes + resource.bytes > maxModuleRawBytes) {
			omittedModules.push({
				file: resource.file,
				estimatedTransferBytes: charge,
				rawBytes: resource.bytes
			});
			continue;
		}
		selected.push(resource);
		selectedModuleEstimatedTransferBytes += charge;
		selectedModuleRawBytes += resource.bytes;
	}
	if (omittedModules.length > 0) options.onWarning?.({
		code: "module-budget-exceeded",
		selectedModuleEstimatedTransferBytes,
		selectedModuleRawBytes,
		omittedModules
	});
	if (selected.length >= warnAtResources) options.onWarning?.({
		code: "resource-count",
		selectedResources: selected.length,
		warnAtResources
	});
	return selected.map((resource) => ({
		kind: resource.kind,
		href: joinBundlePath(options.bundlePath, resource.file)
	}));
}

//#endregion
export { dedupePreloadResources, resolvePreloadResources };
//# sourceMappingURL=design-preload.js.map