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
import type { ShopByStoreOption } from '@/extensions/shop-by-store';

/** Local visual data for the standalone scaffold. It is not shopper or store service data. */
export const SHOP_BY_STORE_FIXTURES: ShopByStoreOption[] = [
    {
        id: 'central-market',
        name: 'Central Market',
        address: '100 Market Street, City Center',
        distance: '0.6 mi away',
    },
    {
        id: 'riverside-store',
        name: 'Riverside Store',
        address: '42 River Road, Riverside',
        distance: '1.4 mi away',
    },
    {
        id: 'northside-store',
        name: 'Northside Store',
        address: '18 North Avenue, Northside',
        distance: '2.1 mi away',
    },
];
