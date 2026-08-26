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

export interface ShippingEstimate {
    shippingOptions: ShippingEstimateOption[];
    deliveryWindow: ShippingEstimateOption['deliveryWindow'];
}

export interface ShippingDestination {
    postalCode: string;
    countryCode?: string;
}

export interface ShippingEstimateOption {
    shippingMethodId: string;
    name?: string;
    description?: string;
    carrier?: string;
    price?: number;
    currency?: string;
    deliveryWindow: {
        startAt: string;
        endAt: string;
    };
    orderCutoffAt?: string;
}

export type ShippingEstimateResult =
    | { success: true; productId: string; zipcode: string; countryCode: string; estimate: ShippingEstimate }
    | { success: false; empty: true; productId: string; zipcode: string; countryCode: string }
    | {
          success: false;
          empty?: false;
          productId?: string;
          zipcode?: string;
          countryCode?: string;
          fallbackDeliveryDescription?: string;
      };
