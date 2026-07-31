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

/**
 * Engagement adapter registration tests — verifies the enable/disable gate
 * for each adapter, focusing on the data360 branch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeEngagementAdapters } from './register';
import type { AppConfig } from '@/types/config';

const mockAddAdapter = vi.fn();
vi.mock('./store', () => ({
    addAdapter: (...args: unknown[]) => mockAddAdapter(...args),
}));

const baseToggles = {
    view_page: true,
    view_product: true,
    view_search: true,
    view_category: true,
    view_recommender: true,
    click_product_in_category: false,
    click_product_in_search: false,
    click_product_in_recommender: false,
    cart_item_add: false,
    checkout_start: false,
    checkout_step: false,
    view_search_suggestion: false,
    click_search_suggestion: false,
    wishlist_item_added: false,
    wishlist_item_removed: false,
    wishlist_viewed: false,
    wishlist_item_merged: false,
    wishlist_merged: false,
};

function makeConfig(data360Enabled: boolean): AppConfig {
    return {
        engagement: {
            adapters: {
                einstein: { enabled: false, eventToggles: baseToggles },
                activeData: { enabled: false, eventToggles: baseToggles },
                data360: {
                    enabled: data360Enabled,
                    appSourceId: 'app-source-id',
                    tenantId: 'test-tenant',
                    siteId: 'RefArch',
                    webStoreId: 'sfnext',
                    eventToggles: baseToggles,
                },
            },
        },
    } as unknown as AppConfig;
}

describe('initializeEngagementAdapters — data360', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('registers the data360 adapter when enabled', () => {
        initializeEngagementAdapters(makeConfig(true));
        const names = mockAddAdapter.mock.calls.map((c) => c[0]);
        expect(names).toContain('data360');
    });

    it('does not register the data360 adapter when disabled', () => {
        initializeEngagementAdapters(makeConfig(false));
        const names = mockAddAdapter.mock.calls.map((c) => c[0]);
        expect(names).not.toContain('data360');
    });
});
