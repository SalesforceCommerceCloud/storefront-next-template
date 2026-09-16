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

import type {
    ComponentId,
    LoaderNames,
    ComponentModule,
    Entry,
    FrameworkAdapter,
    ComponentRegistryOptions,
} from './types';

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
export class ComponentRegistry<TProps, TFrameworkComponent = unknown> {
    private readonly registry = new Map<ComponentId, Entry<TProps, TFrameworkComponent>>();
    private readonly pending = new Map<ComponentId, Promise<Entry<TProps, TFrameworkComponent> | null>>();
    private readonly inFlightRegistrations = new Map<ComponentId, Promise<void>>();
    private readonly registrationErrors = new Map<ComponentId, Error>();
    private generation = 0;

    private readonly adapter: FrameworkAdapter<TProps, TFrameworkComponent>;

    constructor({ adapter }: ComponentRegistryOptions<TProps, TFrameworkComponent>) {
        this.adapter = adapter;
    }

    /**
     * Registers a component in the registry with the specified id.
     * If a component with the same id already exists, it will be overwritten.
     */
    registerComponent(id: ComponentId, component: TFrameworkComponent): void {
        const prev = this.registry.get(id) ?? ({ id, raw: null } as Entry<TProps, TFrameworkComponent>);
        this.registry.set(id, { ...prev, id, raw: component });
    }

    /**
     * Registers a dynamic importer for a component id. Useful if you don't want to rely on scanning.
     */
    registerImporter(
        id: ComponentId,
        importer: () => Promise<ComponentModule<TProps, TFrameworkComponent>>,
        loaderNames?: LoaderNames
    ): void {
        const prev = this.registry.get(id) ?? ({ id, raw: null } as Entry<TProps, TFrameworkComponent>);
        const importerChanged = prev.import !== importer;
        const replacesImporter = Boolean(prev.import && importerChanged);
        this.registry.set(id, {
            ...prev,
            id,
            import: importer,
            loaderNames,
            ...(replacesImporter ? { raw: null, lazy: undefined, fallback: undefined } : {}),
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
    getComponent(id: ComponentId): TFrameworkComponent | null {
        const e = this.ensureLocalEntry(id);

        const comp = e.raw ?? e.lazy ?? null;
        if (!comp) return null;

        return this.adapter.decorateComponent(comp);
    }

    /** Whether a component's concrete module export has already been registered. */
    hasConcreteComponent(id: ComponentId): boolean {
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
    async preload(id: ComponentId): Promise<void> {
        // Wait for discovery to finish (this.pending deduplicates concurrent calls)
        const e = await this.ensureDiscovered(id);

        // If we have a lazy or raw component, we're done.
        // The importer was already called during ensureDiscovered if needed.
        if (e?.lazy || e?.raw) {
            return;
        }

        // At this point discovery finished and we still don't have a component:
        // reject so the nearest ErrorBoundary can render an error state.
        throw new Error(`Component "${id}" could not be discovered (no importer, no raw/lazy).`);
    }

    /** Load and register a component's concrete export. */
    loadAndRegister(id: ComponentId): Promise<void> {
        const entry = this.registry.get(id);
        if (!entry?.import) {
            const error = new Error(`Unknown component type "${id}"`);
            this.registrationErrors.set(id, error);
            return Promise.reject(error);
        }
        if (entry.raw) return Promise.resolve();

        const pending = this.inFlightRegistrations.get(id);
        if (pending) return pending;
        this.registrationErrors.delete(id);

        const importer = entry.import;
        let importedModule: ReturnType<typeof importer>;
        try {
            importedModule = importer();
        } catch (cause) {
            const error = cause instanceof Error ? cause : new Error(`Failed to load component "${id}"`, { cause });
            this.registrationErrors.set(id, error);
            return Promise.reject(error);
        }

        const registration = Promise.resolve(importedModule)
            .then((module) => {
                if (!module.default) throw new Error(`Component "${id}" has no default export`);

                const current = this.registry.get(id);
                if (!current) throw new Error(`Component registration for "${id}" was cancelled`);
                if (current.import !== importer) return this.loadAndRegister(id);

                this.registry.set(id, {
                    ...current,
                    raw: module.default,
                    fallback: module.fallback ?? current.fallback,
                });
            })
            .catch((cause: unknown) => {
                const error = cause instanceof Error ? cause : new Error(`Failed to load component "${id}"`, { cause });
                if (this.registry.get(id)?.import === importer) this.registrationErrors.set(id, error);
                throw error;
            });
        const trackedRegistration = registration.finally(() => {
            if (this.inFlightRegistrations.get(id) === trackedRegistration) {
                this.inFlightRegistrations.delete(id);
            }
        });

        this.inFlightRegistrations.set(id, trackedRegistration);
        return trackedRegistration;
    }

    /** Return a terminal concrete-registration error without clearing it. */
    getRegistrationError(id: ComponentId): Error | undefined {
        return this.registrationErrors.get(id);
    }

    clearRegistrationError(id: ComponentId): void {
        this.registrationErrors.delete(id);
    }

    /** Return and clear a terminal registration error so a later attempt can retry. */
    consumeRegistrationError(id: ComponentId): Error | undefined {
        const error = this.getRegistrationError(id);
        this.clearRegistrationError(id);
        return error;
    }

    /** Get loader function names for external invocation. */
    getLoaderNames(id: ComponentId): LoaderNames | undefined {
        return this.registry.get(id)?.loaderNames;
    }

    hasLoaders(id: ComponentId): boolean {
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
    async callLoader(id: ComponentId, loaderArgs: unknown, loaderType: keyof LoaderNames = 'loader'): Promise<unknown> {
        // Get loader names for the component
        const loaderNames = this.getLoaderNames(id);
        const loaderName = loaderNames?.[loaderType];

        if (!loaderName) {
            return undefined;
        }

        // Get the entry to access the import function
        const entry = this.registry.get(id);
        if (!entry?.import) {
            throw new Error(`No importer found for component: ${id}`);
        }

        try {
            // Import the module and get the loader function
            const module = await entry.import();
            const loaderFunction = module[loaderName];

            if (typeof loaderFunction !== 'function') {
                return undefined;
            }

            // Call the loader function with the provided arguments
            return await loaderFunction(loaderArgs);
        } catch (error) {
            throw new Error(`Failed to call ${loaderType} for component '${id}': ${(error as Error).message}`);
        }
    }

    /** Get fallback component if available. */
    getFallback(id: ComponentId): TFrameworkComponent | undefined {
        return this.registry.get(id)?.fallback;
    }

    /**
     * Returns all registered component IDs.
     * Useful for debugging and introspection.
     */
    getRegisteredIds(): ComponentId[] {
        return Array.from(this.registry.keys());
    }

    /**
     * Checks if a component is registered.
     */
    has(id: ComponentId): boolean {
        return this.registry.has(id);
    }

    /**
     * Clears all cached components and cancels pending discoveries.
     * In-flight async operations will be cancelled and their promises will reject.
     * Useful for testing or hot module replacement.
     */
    clear(): void {
        this.generation += 1;
        this.registry.clear();
        this.pending.clear();
        this.inFlightRegistrations.clear();
        this.registrationErrors.clear();
    }

    /* ==================== Private Methods ==================== */

    private ensureLocalEntry(id: ComponentId): Entry<TProps, TFrameworkComponent> {
        const cached = this.registry.get(id);
        if (cached) {
            return cached;
        }

        // Create a placeholder entry so concurrent calls coalesce.
        const placeholder: Entry<TProps, TFrameworkComponent> = { id, raw: null };
        this.registry.set(id, placeholder);

        // Kick off discovery in background; callers that need it awaited should call ensureDiscovered.
        // oxlint-disable-next-line @typescript-eslint/no-floating-promises
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
    private async ensureDiscovered(id: ComponentId): Promise<Entry<TProps, TFrameworkComponent> | null> {
        const existing = this.registry.get(id);

        if (existing?.raw) return existing;

        const pending = this.pending.get(id);
        if (pending) return pending;

        const generation = this.generation;
        const work = (async () => {
            // Handle explicit importer registered via static registry
            let entry = this.registry.get(id) ?? ({ id, raw: null } as Entry<TProps, TFrameworkComponent>);
            if (entry.import) {
                entry = await this.buildFromImporter(id, entry.import);

                if (generation !== this.generation) {
                    throw new Error(`Component discovery for "${id}" was cancelled`);
                }

                const current = this.registry.get(id);
                if (!current) return null;
                if (current.import !== entry.import) return current;

                const discovered = {
                    ...current,
                    ...entry,
                    raw: current.raw,
                    fallback: entry.fallback ?? current.fallback,
                };
                this.registry.set(id, discovered);
                return discovered;
            }

            // No fallback scanning needed - components are pre-registered via static registry
            return this.registry.get(id) ?? null;
        })();

        this.pending.set(id, work);
        try {
            return await work;
        } finally {
            if (this.pending.get(id) === work) this.pending.delete(id);
        }
    }

    private async buildFromImporter(
        id: ComponentId,
        importer: () => Promise<ComponentModule<TProps, TFrameworkComponent>>
    ): Promise<Entry<TProps, TFrameworkComponent>> {
        const mod = await importer();
        return this.buildFromLoadedModule(id, importer, mod);
    }

    private buildFromLoadedModule(
        id: ComponentId,
        importer: () => Promise<ComponentModule<TProps, TFrameworkComponent>>,
        mod: ComponentModule<TProps, TFrameworkComponent>
    ): Entry<TProps, TFrameworkComponent> {
        // Use adapter to create lazy component
        const lazyComp = this.adapter.createLazyComponent(importer);

        return {
            id,
            raw: null,
            lazy: lazyComp,
            import: importer,
            fallback: mod.fallback,
        };
    }
}
