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
import { describe, it, expect } from 'vitest';
import type { AppConfig } from '@/types/config';
import { extractClientConfig, SERVER_ONLY_NAMESPACES } from './app-config-client';

describe('extractClientConfig', () => {
    it('keeps store-selection mappings and cleanup policy on the server at large store counts', () => {
        const stores = Object.fromEntries(
            Array.from({ length: 4000 }, (_, i) => [
                `store-${i}`,
                { inventoryId: `inventory-${i}`, assignmentQualifiers: { store: `store-${i}` } },
            ])
        );
        const storeSelection = { storesBySite: { GroceryNext: stores }, qualifierKeys: ['store'], cleanup: false };
        const input = {
            features: {
                guestCheckout: true,
                shopperContext: { enabled: true, storeSelectionEnabled: true, storeSelection },
            },
        } as unknown as AppConfig;
        const client = extractClientConfig(input);
        expect(client.features.shopperContext).toEqual({ enabled: true, storeSelectionEnabled: true });
        expect(client.features.guestCheckout).toBe(true);
        expect(JSON.stringify(client)).not.toContain('inventory-3999');
        expect(input.features.shopperContext.storeSelection).toBe(storeSelection);
        expect(client.features.shopperContext.storeSelectionEnabled).toBe(true);
        expect(Object.keys(stores)).toHaveLength(4000);
    });

    it('strips every namespace listed in SERVER_ONLY_NAMESPACES', () => {
        // The list is the load-bearing contract the build-time guard also reads. If a future
        // namespace is added (or removed) it must be reflected here so the runtime stripping
        // matches the bundle-time denial.
        expect(SERVER_ONLY_NAMESPACES).toContain('serverExtension');

        const input = {
            features: { guestCheckout: true },
            serverExtension: { vendorOne: { scapiOverride: 'http://internal' } },
        } as unknown as AppConfig;

        const stripped = extractClientConfig(input) as Record<string, unknown>;

        expect(stripped.serverExtension).toBeUndefined();
        expect(stripped.features).toEqual({ guestCheckout: true });
    });

    it('is a no-op when the input has no server-only namespaces', () => {
        const input = { features: { guestCheckout: true } } as unknown as AppConfig;

        expect(extractClientConfig(input)).toEqual({ features: { guestCheckout: true } });
    });

    it('does not mutate the input', () => {
        // The original AppConfig is shared with the server-side runtime through React Router's
        // context — mutating it here would erase the server-only values from the source of
        // truth, breaking subsequent server-side reads in the same request.
        const input = {
            extension: { ext1: { apiKey: 'public' } },
            serverExtension: { ext1: { secret: 'private' } },
        } as unknown as AppConfig;

        extractClientConfig(input);

        expect((input as unknown as Record<string, unknown>).serverExtension).toEqual({
            ext1: { secret: 'private' },
        });
    });

    it('preserves the public extension namespace', () => {
        // Sanity check the parallel: app.extension is intentionally PUBLIC and must round-trip
        // through the extractor; only app.serverExtension is dropped.
        const input = {
            extension: { vendorOne: { apiKey: '' } },
            serverExtension: { vendorOne: { secret: 'x' } },
        } as unknown as AppConfig;

        const stripped = extractClientConfig(input) as Record<string, unknown>;

        expect(stripped.extension).toEqual({ vendorOne: { apiKey: '' } });
    });
});
