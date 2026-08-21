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
import { createQuerySerializer } from 'openapi-fetch';

/**
 * Parameters that should use repeated format (explode: true)
 * e.g., refine=price=(0..10)&refine=c_refinementColor=green
 */
const EXPLODED_PARAMS = ['refine'];

/**
 * Parameters that need automatic grouping by attribute ID
 * These parameters accept arrays like ['attrId=val1', 'attrId=val2', 'otherId=val3']
 * and group same attributes: ['attrId=val1|val2', 'otherId=val3']
 */
const GROUPED_PARAMS = ['refine'];

/**
 * Characters SCAPI treats as reserved inside a resource identifier value and expects to be
 * double-encoded: comma (its id-list separator) and percent (its escape char).
 * See https://developer.salesforce.com/docs/commerce/commerce-api/guide/url-encode.html
 *
 * openapi-fetch percent-encodes each value exactly once and joins multiple ids with a raw
 * comma. SCAPI decodes a comma-joined list once and only then splits on comma, so a comma or
 * percent that belongs to an id's value has to be encoded a second time here to survive that
 * decode intact. We encode "%" before "," so the "%" introduced for a comma is not re-encoded;
 * openapi-fetch's own encodeURIComponent pass then produces the final %252C / %2525 sequences.
 * The comma openapi-fetch inserts between list elements is left untouched and stays the
 * single-encoded separator SCAPI expects.
 */
function encodeScapiReservedChars(value: unknown): string {
    return String(value).replace(/%/g, '%25').replace(/,/g, '%2C');
}

/**
 * Groups refinement-style parameters by attribute ID
 * e.g., ['c_color=Black', 'c_color=Green', 'price=(0..20)']
 *    => ['c_color=Black|Green', 'price=(0..20)']
 */
function groupByAttribute(values: string[]): string[] {
    const groupMap = new Map<string, string[]>();

    for (const item of values) {
        const separatorIndex = item.indexOf('=');
        if (separatorIndex === -1) {
            // No separator found, keep as-is
            continue;
        }

        const attrId = item.substring(0, separatorIndex);
        const attrValue = item.substring(separatorIndex + 1);

        if (!groupMap.has(attrId)) {
            groupMap.set(attrId, []);
        }
        const attrValues = groupMap.get(attrId);
        if (attrValues) {
            attrValues.push(attrValue);
        }
    }

    return Array.from(groupMap.entries()).map(([attrId, attrValues]) => `${attrId}=${attrValues.join('|')}`);
}

/**
 * Default query serializer for Commerce Cloud APIs
 * - Most arrays use comma-separated format (explode: false)
 *   e.g., expand=promotions,variations,prices
 * - Certain parameters use repeated format (explode: true)
 *   e.g., refine=price=(0..10)&refine=c_refinementColor=green
 * - Some parameters are automatically grouped by attribute ID before serialization
 *   e.g., ['c_color=Black', 'c_color=Green'] => 'c_color=Black|Green'
 */
export function defaultQuerySerializer(queryParams: Record<string, unknown>): string {
    if (!queryParams || typeof queryParams !== 'object') return '';

    const defaultSerializer = createQuerySerializer({
        array: { style: 'form', explode: false },
    });

    const explodedSerializer = createQuerySerializer({
        array: { style: 'form', explode: true },
    });

    const queryString: string[] = [];
    for (const [name, value] of Object.entries(queryParams)) {
        if (value === undefined || value === null) continue;

        let processedValue = value;

        // Apply grouping for parameters that need it
        if (GROUPED_PARAMS.includes(name) && Array.isArray(value)) {
            processedValue = groupByAttribute(value as string[]);
        }

        // Double-encode SCAPI reserved chars in each id/value so the raw comma separator
        // openapi-fetch inserts between array elements stays the only comma SCAPI splits on.
        if (Array.isArray(processedValue)) {
            processedValue = processedValue.map(encodeScapiReservedChars);
        }

        const serializer = EXPLODED_PARAMS.includes(name) ? explodedSerializer : defaultSerializer;
        const serialized = serializer({ [name]: processedValue });
        if (serialized) queryString.push(serialized);
    }
    return queryString.join('&');
}
