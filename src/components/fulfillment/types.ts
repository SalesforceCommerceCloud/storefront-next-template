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

export const FULFILLMENT_OPTION_IDS = {
    DELIVERY: 'delivery',
    PICKUP: 'pickup',
} as const;

export type FulfillmentOptionId = (typeof FULFILLMENT_OPTION_IDS)[keyof typeof FULFILLMENT_OPTION_IDS];

export type FulfillmentMetadataValue =
    | string
    | number
    | boolean
    | null
    | FulfillmentMetadataValue[]
    | { [key: string]: FulfillmentMetadataValue };

export type FulfillmentMetadata = Record<string, FulfillmentMetadataValue>;

export interface FulfillmentOptionAvailability {
    available: boolean;
    disabledReason?: string;
}

export interface FulfillmentOptionDescriptor<OptionId extends string = FulfillmentOptionId> {
    id: OptionId;
    order?: number;
    label: string;
    description?: string;
    menuLabel?: string;
    availability: FulfillmentOptionAvailability;
}

export interface FulfillmentOptionContributor<OptionId extends string = FulfillmentOptionId> {
    option: FulfillmentOptionDescriptor<OptionId>;
    defaultSelected?: boolean;
    /** Return false to handle the interaction without updating the selected option. */
    onSelect?: () => boolean | void;
    createSelection?: (optionId: OptionId) => SelectedFulfillmentOption<OptionId>;
}

export interface SelectedFulfillmentOption<
    OptionId extends string = FulfillmentOptionId,
    Metadata extends FulfillmentMetadata = FulfillmentMetadata,
> {
    optionId: OptionId;
    metadata?: Metadata;
}

export interface SerializedFulfillmentSelection {
    optionId: string;
    metadata?: FulfillmentMetadata;
}

export function createFulfillmentSelection<
    OptionId extends string,
    Metadata extends FulfillmentMetadata = FulfillmentMetadata,
>(optionId: OptionId, metadata?: Metadata): SelectedFulfillmentOption<OptionId, Metadata> {
    return metadata ? { optionId, metadata } : { optionId };
}

export function serializeFulfillmentSelection(selection: SerializedFulfillmentSelection): string {
    return JSON.stringify(selection);
}
