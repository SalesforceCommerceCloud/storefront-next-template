//#region src/design/registry/registry.ts
/**
* Framework-agnostic ComponentRegistry manages component loading with static registration.
*
* Features:
* - Framework agnostic core with adapter pattern
* - Lazy loading via framework adapters for code splitting
* - Static component registration via build plugins (no dynamic discovery)
* - Design mode decoration via framework adapters
* - Request deduplication for concurrent component loads
* - Component metadata handled via API (not stored in registry)
*
* @template TProps - Component props type
*
* @example
* ```tsx
* const registry = new ComponentRegistry({
*   adapter: new ReactAdapter(),
*   designDecorator: createDesignDecorator,
* });
*
* // Components are pre-registered via static registry plugin
* // Get a component
* const Hero = registry.getComponent('hero');
*
* // Preload for SSR
* await registry.preload('hero');
* ```
*/
var ComponentRegistry = class {
	registry = /* @__PURE__ */ new Map();
	pending = /* @__PURE__ */ new Map();
	inFlightRegistrations = /* @__PURE__ */ new Map();
	registrationErrors = /* @__PURE__ */ new Map();
	generation = 0;
	adapter;
	constructor({ adapter }) {
		this.adapter = adapter;
	}
	/**
	* Registers a component in the registry with the specified id.
	* If a component with the same id already exists, it will be overwritten.
	*/
	registerComponent(id, component) {
		const prev = this.registry.get(id) ?? {
			id,
			raw: null
		};
		this.registry.set(id, {
			...prev,
			id,
			raw: component
		});
	}
	/**
	* Registers a dynamic importer for a component id. Useful if you don't want to rely on scanning.
	*/
	registerImporter(id, importer, loaderNames) {
		const prev = this.registry.get(id) ?? {
			id,
			raw: null
		};
		const importerChanged = prev.import !== importer;
		const replacesImporter = Boolean(prev.import && importerChanged);
		this.registry.set(id, {
			...prev,
			id,
			import: importer,
			loaderNames,
			...replacesImporter ? {
				raw: null,
				lazy: void 0,
				fallback: void 0
			} : {}
		});
		if (importerChanged) {
			this.inFlightRegistrations.delete(id);
			this.registrationErrors.delete(id);
		}
	}
	/**
	* Retrieves a component by id. Returns a framework-specific component type.
	* In lazy loading scenarios, this will be a lazy component if the component
	* is discovered via dynamic import. In design mode, the returned component
	* is decorated via `designDecorator`.
	*/
	getComponent(id) {
		const e = this.ensureLocalEntry(id);
		const comp = e.raw ?? e.lazy ?? null;
		if (!comp) return null;
		return this.adapter.decorateComponent(comp);
	}
	/** Whether a component's concrete module export has already been registered. */
	hasConcreteComponent(id) {
		return Boolean(this.registry.get(id)?.raw);
	}
	/**
	* Preload the JS chunk for a component id (use in route loaders/SSR to avoid waterfalls).
	*
	* This method ensures the component module is loaded and cached. Concurrent calls
	* for the same component ID are automatically deduplicated via the pending map
	* in ensureDiscovered().
	*
	* @throws Error if the component cannot be discovered
	*/
	async preload(id) {
		const e = await this.ensureDiscovered(id);
		if (e?.lazy || e?.raw) return;
		throw new Error(`Component "${id}" could not be discovered (no importer, no raw/lazy).`);
	}
	/** Load and register a component's concrete export. */
	loadAndRegister(id) {
		const entry = this.registry.get(id);
		if (!entry?.import) {
			const error = /* @__PURE__ */ new Error(`Unknown component type "${id}"`);
			this.registrationErrors.set(id, error);
			return Promise.reject(error);
		}
		if (entry.raw) return Promise.resolve();
		const pending = this.inFlightRegistrations.get(id);
		if (pending) return pending;
		this.registrationErrors.delete(id);
		const importer = entry.import;
		let importedModule;
		try {
			importedModule = importer();
		} catch (cause) {
			const error = cause instanceof Error ? cause : new Error(`Failed to load component "${id}"`, { cause });
			this.registrationErrors.set(id, error);
			return Promise.reject(error);
		}
		const trackedRegistration = Promise.resolve(importedModule).then((module) => {
			if (!module.default) throw new Error(`Component "${id}" has no default export`);
			const current = this.registry.get(id);
			if (!current) throw new Error(`Component registration for "${id}" was cancelled`);
			if (current.import !== importer) return this.loadAndRegister(id);
			this.registry.set(id, {
				...current,
				raw: module.default,
				fallback: module.fallback ?? current.fallback
			});
		}).catch((cause) => {
			const error = cause instanceof Error ? cause : new Error(`Failed to load component "${id}"`, { cause });
			if (this.registry.get(id)?.import === importer) this.registrationErrors.set(id, error);
			throw error;
		}).finally(() => {
			if (this.inFlightRegistrations.get(id) === trackedRegistration) this.inFlightRegistrations.delete(id);
		});
		this.inFlightRegistrations.set(id, trackedRegistration);
		return trackedRegistration;
	}
	/** Return a terminal concrete-registration error without clearing it. */
	getRegistrationError(id) {
		return this.registrationErrors.get(id);
	}
	clearRegistrationError(id) {
		this.registrationErrors.delete(id);
	}
	/** Return and clear a terminal registration error so a later attempt can retry. */
	consumeRegistrationError(id) {
		const error = this.getRegistrationError(id);
		this.clearRegistrationError(id);
		return error;
	}
	/** Get loader function names for external invocation. */
	getLoaderNames(id) {
		return this.registry.get(id)?.loaderNames;
	}
	hasLoaders(id) {
		const loaderNames = this.registry.get(id)?.loaderNames;
		return Boolean(loaderNames?.loader || loaderNames?.clientLoader);
	}
	/**
	* Call a loader function for a component externally.
	*
	* @param id - Component ID
	* @param loaderArgs - Arguments to pass to the loader function
	* @param loaderType - Type of loader to call ('loader' or 'clientLoader')
	* @returns Promise resolving to the loader result
	*/
	async callLoader(id, loaderArgs, loaderType = "loader") {
		const loaderName = this.getLoaderNames(id)?.[loaderType];
		if (!loaderName) return;
		const entry = this.registry.get(id);
		if (!entry?.import) throw new Error(`No importer found for component: ${id}`);
		try {
			const loaderFunction = (await entry.import())[loaderName];
			if (typeof loaderFunction !== "function") return;
			return await loaderFunction(loaderArgs);
		} catch (error) {
			throw new Error(`Failed to call ${loaderType} for component '${id}': ${error.message}`);
		}
	}
	/** Get fallback component if available. */
	getFallback(id) {
		return this.registry.get(id)?.fallback;
	}
	/**
	* Returns all registered component IDs.
	* Useful for debugging and introspection.
	*/
	getRegisteredIds() {
		return Array.from(this.registry.keys());
	}
	/**
	* Checks if a component is registered.
	*/
	has(id) {
		return this.registry.has(id);
	}
	/**
	* Clears all cached components and cancels pending discoveries.
	* In-flight async operations will be cancelled and their promises will reject.
	* Useful for testing or hot module replacement.
	*/
	clear() {
		this.generation += 1;
		this.registry.clear();
		this.pending.clear();
		this.inFlightRegistrations.clear();
		this.registrationErrors.clear();
	}
	ensureLocalEntry(id) {
		const cached = this.registry.get(id);
		if (cached) return cached;
		const placeholder = {
			id,
			raw: null
		};
		this.registry.set(id, placeholder);
		this.ensureDiscovered(id);
		return placeholder;
	}
	/**
	* Ensures a component is discovered and cached.
	* Only returns early if a raw (eagerly loaded) component exists.
	* Otherwise, attempts to discover via registered importer.
	*
	* @throws Error if the discovery is cancelled via clear()
	*/
	async ensureDiscovered(id) {
		const existing = this.registry.get(id);
		if (existing?.raw) return existing;
		const pending = this.pending.get(id);
		if (pending) return pending;
		const generation = this.generation;
		const work = (async () => {
			let entry = this.registry.get(id) ?? {
				id,
				raw: null
			};
			if (entry.import) {
				entry = await this.buildFromImporter(id, entry.import);
				if (generation !== this.generation) throw new Error(`Component discovery for "${id}" was cancelled`);
				const current = this.registry.get(id);
				if (!current) return null;
				if (current.import !== entry.import) return current;
				const discovered = {
					...current,
					...entry,
					raw: current.raw,
					fallback: entry.fallback ?? current.fallback
				};
				this.registry.set(id, discovered);
				return discovered;
			}
			return this.registry.get(id) ?? null;
		})();
		this.pending.set(id, work);
		try {
			return await work;
		} finally {
			if (this.pending.get(id) === work) this.pending.delete(id);
		}
	}
	async buildFromImporter(id, importer) {
		const mod = await importer();
		return this.buildFromLoadedModule(id, importer, mod);
	}
	buildFromLoadedModule(id, importer, mod) {
		return {
			id,
			raw: null,
			lazy: this.adapter.createLazyComponent(importer),
			import: importer,
			fallback: mod.fallback
		};
	}
};

//#endregion
export { ComponentRegistry };
//# sourceMappingURL=design.js.map