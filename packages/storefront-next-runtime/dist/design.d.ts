import { a as LoaderNames, n as ComponentModule, r as ComponentRegistryOptions, t as ComponentId } from "./types3.js";

//#region src/design/registry/registry.d.ts

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
declare class ComponentRegistry<TProps, TFrameworkComponent = unknown> {
  private readonly registry;
  private readonly pending;
  private readonly inFlightRegistrations;
  private generation;
  private readonly adapter;
  constructor({
    adapter
  }: ComponentRegistryOptions<TProps, TFrameworkComponent>);
  /**
   * Registers a component in the registry with the specified id.
   * If a component with the same id already exists, it will be overwritten.
   */
  registerComponent(id: ComponentId, component: TFrameworkComponent): void;
  /**
   * Registers a dynamic importer for a component id. Useful if you don't want to rely on scanning.
   */
  registerImporter(id: ComponentId, importer: () => Promise<ComponentModule<TProps, TFrameworkComponent>>, loaderNames?: LoaderNames): void;
  /**
   * Retrieves a component by id. Returns a framework-specific component type.
   * In lazy loading scenarios, this will be a lazy component if the component
   * is discovered via dynamic import. In design mode, the returned component
   * is decorated via `designDecorator`.
   */
  getComponent(id: ComponentId): TFrameworkComponent | null;
  /** Whether a component's concrete module export has already been registered. */
  hasConcreteComponent(id: ComponentId): boolean;
  /**
   * Preload the JS chunk for a component id (use in route loaders/SSR to avoid waterfalls).
   *
   * This method ensures the component module is loaded and cached. Concurrent calls
   * for the same component ID are automatically deduplicated via the pending map
   * in ensureDiscovered().
   *
   * @throws Error if the component cannot be discovered
   */
  preload(id: ComponentId): Promise<void>;
  /**
   * Loads and registers a component's concrete export.
   * Unknown component IDs are ignored so callers can pass IDs collected from external content.
   */
  loadAndRegister(id: ComponentId): Promise<void>;
  /** Get loader function names for external invocation. */
  getLoaderNames(id: ComponentId): LoaderNames | undefined;
  hasLoaders(id: ComponentId): boolean;
  /**
   * Call a loader function for a component externally.
   *
   * @param id - Component ID
   * @param loaderArgs - Arguments to pass to the loader function
   * @param loaderType - Type of loader to call ('loader' or 'clientLoader')
   * @returns Promise resolving to the loader result
   */
  callLoader(id: ComponentId, loaderArgs: unknown, loaderType?: keyof LoaderNames): Promise<unknown>;
  /** Get fallback component if available. */
  getFallback(id: ComponentId): TFrameworkComponent | undefined;
  /**
   * Returns all registered component IDs.
   * Useful for debugging and introspection.
   */
  getRegisteredIds(): ComponentId[];
  /**
   * Checks if a component is registered.
   */
  has(id: ComponentId): boolean;
  /**
   * Clears all cached components and cancels pending discoveries.
   * In-flight async operations will be cancelled and their promises will reject.
   * Useful for testing or hot module replacement.
   */
  clear(): void;
  private ensureLocalEntry;
  /**
   * Ensures a component is discovered and cached.
   * Only returns early if a raw (eagerly loaded) component exists.
   * Otherwise, attempts to discover via registered importer.
   *
   * @throws Error if the discovery is cancelled via clear()
   */
  private ensureDiscovered;
  private buildFromImporter;
  private buildFromLoadedModule;
}
//#endregion
export { ComponentRegistry };
//# sourceMappingURL=design.d.ts.map