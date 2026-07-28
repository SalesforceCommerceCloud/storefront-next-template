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
    private readonly cancelled = new Set<ComponentId>();

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
        this.registry.set(id, { ...prev, id, import: importer, loaderNames });
    }

    /**
     * Retrieves a component by id. Returns a framework-specific component type.
     * In lazy loading scenarios, this will be a lazy component if the component
     * is discovered via dynamic import. In design mode, the returned component
     * is decorated via `designDecorator`.
     */
    getComponent(id: ComponentId): TFrameworkComponent | null {
        const e = this.ensureLocalEntry(id);
        if (!e) return null;

        const comp = e.raw ?? e.lazy ?? null;
        if (!comp) return null;

        return this.adapter.decorateComponent(comp);
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

    /** Get loader function names for external invocation. */
    getLoaderNames(id: ComponentId): LoaderNames | undefined {
        return this.registry.get(id)?.loaderNames;
    }

    hasLoaders(id: ComponentId): boolean {
        return Object.values(this.registry.get(id)?.loaderNames || {}).filter(Boolean).length > 0;
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
            return Promise.resolve(undefined);
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
        // Mark all pending discoveries as cancelled
        for (const id of this.pending.keys()) {
            this.cancelled.add(id);
        }

        this.registry.clear();
        this.pending.clear();
    }

    /* ==================== Private Methods ==================== */

    private ensureLocalEntry(id: ComponentId): Entry<TProps, TFrameworkComponent> | null {
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

        if (this.pending.has(id)) {
            return this.pending.get(id) ?? null;
        }

        const work = (async () => {
            // Check if cancelled before starting work
            if (this.cancelled.has(id)) {
                this.cancelled.delete(id);
                throw new Error(`Component discovery for "${id}" was cancelled`);
            }

            // Handle explicit importer registered via static registry
            let entry = this.registry.get(id) ?? ({ id, raw: null } as Entry<TProps, TFrameworkComponent>);
            if (entry.import) {
                entry = await this.buildFromImporter(id, entry.import);

                // Check if cancelled after async operation
                if (this.cancelled.has(id)) {
                    this.cancelled.delete(id);
                    throw new Error(`Component discovery for "${id}" was cancelled`);
                }

                this.registry.set(id, entry);
                return entry;
            }

            // No fallback scanning needed - components are pre-registered via static registry
            return this.registry.get(id) ?? null;
        })();

        this.pending.set(id, work);
        try {
            const done = await work;
            this.pending.delete(id);
            return done;
        } catch (error) {
            this.pending.delete(id);
            throw error;
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
