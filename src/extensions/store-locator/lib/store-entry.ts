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
import type { FulfillmentOptionId } from '@/components/fulfillment/types';

export type FulfillmentMode = FulfillmentOptionId;

/** Merchant entry policy. Enable after the entry UX and shared basket-switching integration are approved. */
export type StoreEntryConfig = {
    enabled: boolean;
    /** Enable only after implementing the server-side city-search provider. Defaults to false. */
    citySearchEnabled?: boolean;
    countries?: string[];
    distanceUnit?: 'km' | 'mi';
    /** Soft entry is the default; required entry must be explicitly enabled by the merchant. */
    policy?: 'soft' | 'required';
    fulfillmentModes: FulfillmentMode[];
};

export type StoreEntryEligibility = {
    eligible: boolean;
    /** Optional localized display data; never parsed to decide eligibility. */
    status?: string;
    services?: string[];
};

export function isFulfillmentMode(value: unknown): value is FulfillmentMode {
    return value === 'pickup' || value === 'delivery';
}
