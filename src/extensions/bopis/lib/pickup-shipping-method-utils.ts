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

// Re-export shared pickup-method utilities. The canonical implementations live in
// `@/lib/shipping/pickup-method` so the bopis and shipping-delivery extensions share one source
// of truth; this barrel preserves the historical import path for bopis consumers.
export {
    PICKUP_SHIPPING_METHOD_ID,
    isPickupShippingMethod,
    getPickupShippingMethodId,
} from '@/lib/shipping/pickup-method';
