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
import { createContext, type RouterContextProvider } from 'react-router';
import type { Clients, Middleware } from '@/scapi';

/**
 * Names of SCAPI clients that support middleware registration.
 *
 * Derived from the {@link Clients} type by selecting only keys whose values
 * expose a `use` method (i.e. ProxyClient instances), which excludes
 * non-client members like `auth`, `basket`, and `use`.
 */
type ScapiClientName = {
    [K in keyof Clients]: Clients[K] extends { use: (middleware: Middleware) => void } ? K : never;
}[keyof Clients];

export interface ScapiMiddlewareEntry {
    /**
     * Factory that receives the router context and returns an openapi-fetch
     * middleware to register, or `null` to skip registration.
     *
     * Called by {@link createApiClients} after all React Router middleware has
     * run, so every context value is guaranteed to be available regardless of
     * middleware ordering.
     */
    factory: (context: RouterContextProvider | Readonly<RouterContextProvider>, clients: Clients) => Middleware | null;
    /**
     * Set when `onRequest` may return a synthetic `Response`. openapi-fetch then short-circuits the remaining request
     * middleware and skips all response/error handlers, so these entries must run before middleware creates state that
     * requires response/error cleanup.
     */
    mayReturnResponse?: boolean;
    /**
     * Scope the middleware to specific SCAPI clients.
     * When omitted, the middleware is registered globally on all clients.
     */
    clients?: ScapiClientName[];
}

/**
 * Per-request registry of SCAPI middleware factories, keyed by an
 * application-supplied string. Re-registering the same key replaces the
 * previous entry in place without changing its registration order — this
 * makes the registry idempotent across the (rare but possible) cases where
 * a router middleware fires more than once within a single request, while
 * still preserving insertion order within each registration phase. Entries
 * that may return a synthetic response run before ordinary middleware.
 */
export class ScapiMiddlewareRegistry {
    private readonly map = new Map<string, ScapiMiddlewareEntry>();

    /**
     * Register or replace the entry for `key`. If `key` was previously
     * registered the new entry takes its slot, preserving the original
     * registration order. Otherwise the entry is appended to the end.
     */
    register(key: string, entry: ScapiMiddlewareEntry): void {
        // `Map.set` on an existing key updates the value in place without
        // disturbing iteration order — exactly the semantics we want.
        this.map.set(key, entry);
    }

    /**
     * Iterates entries in registration order. The {@link createApiClients}
     * loop consumes this to apply each factory's middleware to the right
     * SCAPI clients.
     */
    entries(): IterableIterator<ScapiMiddlewareEntry> {
        return this.map.values();
    }

    /** True when an entry has been registered under `key`. */
    has(key: string): boolean {
        return this.map.has(key);
    }
}

/**
 * React Router context holding the per-request {@link ScapiMiddlewareRegistry}.
 *
 * Default value is `null` so producers cannot accidentally register on the
 * module-level default — that would let entries accumulate across requests
 * and middleware to compound. Use {@link getScapiMiddlewareRegistry}
 * to obtain a request-scoped registry, lazily allocated on first access.
 */
export const scapiMiddlewareContext = createContext<ScapiMiddlewareRegistry | null>(null);

/**
 * Returns the per-request {@link ScapiMiddlewareRegistry}, allocating and
 * storing one on the first call within a given request. Use this in
 * preference to `context.get(scapiMiddlewareContext)` when registering
 * middleware factories.
 *
 * Accepts `Readonly<RouterContextProvider>` because that's how
 * {@code MiddlewareFunction} types its context parameter — the marker is
 * structural, the underlying class methods are still callable.
 */
export function getScapiMiddlewareRegistry(
    context: RouterContextProvider | Readonly<RouterContextProvider>
): ScapiMiddlewareRegistry {
    let registry = context.get(scapiMiddlewareContext);
    if (!registry) {
        registry = new ScapiMiddlewareRegistry();
        // `Readonly<T>` only marks own properties readonly, not class
        // methods — `.set` is still callable. Cast keeps the API
        // compatible with router middleware function signatures.
        (context as RouterContextProvider).set(scapiMiddlewareContext, registry);
    }
    return registry;
}
