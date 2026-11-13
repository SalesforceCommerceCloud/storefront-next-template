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
import type { RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getShopperContextHelpers, type ShopperContext } from '@/lib/api/shopper-context.server';
import { getLogger } from '@/lib/logger.server';
import {
    SHOPPER_CONTEXT_SEARCH_PARAMS,
    QUALIFIER_MAPPING_PARAM_NAME,
    type QualifierMapping,
    QUALIFIER_MAPPING_API_FIELD_NAME,
    SOURCE_CODE_API_FIELD_NAME,
    SHOPPER_CONTEXT_COOKIE_NAME_BASE,
    SOURCE_CODE_COOKIE_NAME_BASE,
    SHOPPER_CONTEXT_COOKIE_EXPIRY_SECONDS,
    SOURCE_CODE_COOKIE_EXPIRY_SECONDS,
} from '@/lib/shopper-context/constants';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import { parseJsonToStringRecord } from '@/lib/utils';
import { isDesignModeActive, isPreviewModeActive } from '@salesforce/storefront-next-runtime/design/mode';
import { isNativeStoreSelectionEnabled } from '@/lib/shopper-context/store-selection';

/**
 * Check if Page Designer edit or preview mode is active
 * @param url - URL object to check for mode parameter
 * @returns true if in Page Designer mode
 */
export function isPageDesignerMode(url: URL): boolean {
    return isDesignModeActive(url) || isPreviewModeActive(url);
}

const customQualifiersMapping = SHOPPER_CONTEXT_SEARCH_PARAMS.customQualifiers as Record<string, QualifierMapping>;
const customQualifiersKeys = Object.keys(customQualifiersMapping);
const customQualifiersApiFieldNames = customQualifiersKeys.map(
    (key) => customQualifiersMapping[key][QUALIFIER_MAPPING_API_FIELD_NAME]
);

const assignmentQualifiersMapping = SHOPPER_CONTEXT_SEARCH_PARAMS.assignmentQualifiers as Record<
    string,
    QualifierMapping
>;
const assignmentQualifiersKeys = Object.keys(assignmentQualifiersMapping);
const assignmentQualifiersApiFieldNames = assignmentQualifiersKeys.map(
    (key) => assignmentQualifiersMapping[key][QUALIFIER_MAPPING_API_FIELD_NAME]
);

const couponCodesMapping = SHOPPER_CONTEXT_SEARCH_PARAMS.couponCodes as QualifierMapping;
const customerGroupIdsMapping = SHOPPER_CONTEXT_SEARCH_PARAMS.customerGroupIds as QualifierMapping | undefined;
const rememberedRootKeys = new Set(
    Object.values(SHOPPER_CONTEXT_SEARCH_PARAMS)
        .filter((mapping) => QUALIFIER_MAPPING_PARAM_NAME in mapping)
        .map((mapping) => {
            const entry = mapping as QualifierMapping;
            return entry[QUALIFIER_MAPPING_API_FIELD_NAME] ?? entry[QUALIFIER_MAPPING_PARAM_NAME];
        })
        .filter((key) => key !== SOURCE_CODE_API_FIELD_NAME)
);

export const isCustomQualifier = (key: string): boolean => {
    return customQualifiersApiFieldNames.includes(key) || customQualifiersKeys.includes(key);
};

export const isAssignmentQualifier = (key: string): boolean => {
    return assignmentQualifiersApiFieldNames.includes(key) || assignmentQualifiersKeys.includes(key);
};

export const isCouponCode = (key: string): boolean => {
    return (
        couponCodesMapping[QUALIFIER_MAPPING_API_FIELD_NAME] === key ||
        couponCodesMapping[QUALIFIER_MAPPING_PARAM_NAME] === key
    );
};

export const isCustomerGroupIds = (key: string): boolean => {
    return (
        customerGroupIdsMapping?.[QUALIFIER_MAPPING_API_FIELD_NAME] === key ||
        customerGroupIdsMapping?.[QUALIFIER_MAPPING_PARAM_NAME] === key
    );
};

/**
 * For couponCodes/customerGroupIds normalization.
 */
function normalizeArrayQualifierValue(apiFieldName: string, value: string): string {
    if (!isCouponCode(apiFieldName) && !isCustomerGroupIds(apiFieldName)) return value.trim();
    const segments = value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
    return segments.join(',');
}

/**
 * Shared logic: extract qualifiers from key-value entries.
 * Used by extractQualifiersFromUrl and extractQualifiersFromInput.
 */
function extractQualifiersFromEntries(entries: Iterable<[string, string]>): {
    qualifiers: Record<string, string>;
    sourceCodeQualifiers: Record<string, string>;
} {
    const qualifiers: Record<string, string> = {};
    const sourceCodeQualifiers: Record<string, string> = {};

    for (const [searchParamKey, searchParamValue] of entries) {
        if (!searchParamKey) continue;

        const mapping = SHOPPER_CONTEXT_SEARCH_PARAMS[searchParamKey];
        let apiFieldName: string | undefined;
        let qualifierMapping: QualifierMapping | undefined;

        // Check if it's a root-level qualifier (e.g., src)
        if (mapping && QUALIFIER_MAPPING_PARAM_NAME in mapping) {
            qualifierMapping = mapping as QualifierMapping;
        }
        // Check if it's a customQualifier (e.g., customQualifiers.deviceType)
        else if (isCustomQualifier(searchParamKey)) {
            qualifierMapping = customQualifiersMapping[searchParamKey];
        }
        // Check if it's an assignmentQualifier (e.g., assignmentQualifiers.store)
        else if (isAssignmentQualifier(searchParamKey)) {
            qualifierMapping = assignmentQualifiersMapping[searchParamKey];
        }

        if (qualifierMapping) {
            apiFieldName =
                qualifierMapping[QUALIFIER_MAPPING_API_FIELD_NAME] ?? qualifierMapping[QUALIFIER_MAPPING_PARAM_NAME];
            if (apiFieldName === SOURCE_CODE_API_FIELD_NAME) {
                // Strip CR/LF before the value reaches the bare-string `dwsourcecode_*` cookie
                // (Node `Headers.append` rejects CR/LF in Set-Cookie values, dropping the write).
                sourceCodeQualifiers[apiFieldName] = searchParamValue.replace(/[\r\n]/g, '').trim();
            } else {
                qualifiers[apiFieldName] = normalizeArrayQualifierValue(apiFieldName, searchParamValue);
            }
        }
    }

    return { qualifiers, sourceCodeQualifiers };
}

/**
 * Extract qualifiers from URL query parameters into a map
 * Uses SHOPPER_CONTEXT_SEARCH_PARAMS to determine which qualifiers to extract
 */
export function extractQualifiersFromUrl(url: URL): {
    qualifiers: Record<string, string>;
    sourceCodeQualifiers: Record<string, string>;
} {
    return extractQualifiersFromEntries(url.searchParams.entries());
}

/**
 * Extract qualifiers from an object into a map
 * Uses SHOPPER_CONTEXT_SEARCH_PARAMS to determine which qualifiers to extract
 */
export function extractQualifiersFromInput(input: Record<string, string>): {
    qualifiers: Record<string, string>;
    sourceCodeQualifiers: Record<string, string>;
} {
    return extractQualifiersFromEntries(Object.entries(input));
}

/**
 * Compute effective source code context
 * Merges new source code state with current source code state from cookie
 *
 * @param newSourceCodeContext - New source code state (e.g., from URL or UI)
 * @param currentSourceCodeContext - Current source code state from cookie
 * @returns Effective source code context (merged state)
 */
export function computeEffectiveSourceCodeContext(
    newSourceCodeContext: Record<string, string>,
    currentSourceCodeContext: Record<string, string>
): Record<string, string> {
    const effectiveSourceCodeContext: Record<string, string> = { ...currentSourceCodeContext };

    // Update sourceCode if present in newSourceCodeContext (allow null, but not undefined)
    if (newSourceCodeContext.sourceCode !== undefined) {
        effectiveSourceCodeContext.sourceCode = newSourceCodeContext.sourceCode;
    }

    return effectiveSourceCodeContext;
}

/**
 * Compute effective shopper context (excluding source code)
 * Merges new shopper context state with current shopper context state from cookie
 * Handles customQualifiers, assignmentQualifiers, and other qualifiers
 *
 * @param newShopperContext - New shopper context state (e.g., from URL or UI)
 * @param currentShopperContext - Current shopper context state from cookie
 * @returns Effective shopper context (merged state)
 */
export function computeEffectiveShopperContext(
    newShopperContext: Record<string, string>,
    currentShopperContext: Record<string, string>
): Record<string, string> {
    const effectiveShopperContext: Record<string, string> = { ...currentShopperContext };
    Object.keys(newShopperContext).forEach((key) => {
        if (newShopperContext[key] !== undefined) {
            effectiveShopperContext[key] = newShopperContext[key];
        }
    });

    return effectiveShopperContext;
}

/**
 * Shared function to update shopper context
 * Used by both middleware and action to avoid code duplication
 *
 * @param params - Parameters for updating shopper context
 * @param params.context - React Router context
 * @param params.usid - Shopper's unique identifier
 * @param params.newShopperContext - New qualifiers to merge (excluding sourceCode)
 * @param params.newSourceCodeContext - New source code qualifiers to merge
 * @param params.cookieHeader - Raw Cookie header string from the request
 * @returns Promise resolving to an object with setCookieHeaders to apply to the response
 */
export async function updateShopperContext({
    context,
    usid,
    newShopperContext,
    newSourceCodeContext,
    cookieHeader,
}: {
    context: Readonly<RouterContextProvider>;
    usid: string;
    newShopperContext: Record<string, string>;
    newSourceCodeContext: Record<string, string>;
    cookieHeader: string | null;
}): Promise<{ setCookieHeaders: string[] }> {
    const logger = getLogger(context);
    const feature = getConfig(context).features.shopperContext;
    if (!feature.enabled) return { setCookieHeaders: [] };
    const ownedKeys =
        isNativeStoreSelectionEnabled(feature) || feature.storeSelection?.cleanup
            ? (feature.storeSelection?.qualifierKeys ?? [])
            : [];
    newShopperContext = Object.fromEntries(
        Object.entries(newShopperContext).filter(([key]) => !ownedKeys.includes(key))
    );
    const setCookieHeaders: string[] = [];

    // Get current context from cookies using cookie-utils (same as other app cookies; adds siteId suffix)
    // httpOnly: true (server-only); action reads from request Cookie header
    const cookieConfig = getCookieConfig({ httpOnly: true }, context);
    const shopperContextCookieHandler = createCookie<string>(SHOPPER_CONTEXT_COOKIE_NAME_BASE, cookieConfig, context);
    const sourceCodeCookieHandler = createCookie<string>(SOURCE_CODE_COOKIE_NAME_BASE, cookieConfig, context);

    const cookieContext = cookieHeader
        ? parseJsonToStringRecord(await shopperContextCookieHandler.parse(cookieHeader))
        : {};
    const currentShopperContext = Object.fromEntries(
        Object.entries(cookieContext).filter(([key]) => !ownedKeys.includes(key))
    );
    // Source-code cookie is stored as a bare string for SFRA hybrid compatibility — SFRA reads
    // the same `dwsourcecode_*` cookie name and expects the plain source-code value.
    const rawSourceCode = cookieHeader ? await sourceCodeCookieHandler.parse(cookieHeader) : null;
    const currentSourceCodeContext: Record<string, string> = rawSourceCode ? { sourceCode: rawSourceCode } : {};

    // Compute effective context by merging new with current
    const effectiveShopperContext = computeEffectiveShopperContext(newShopperContext, currentShopperContext);
    const effectiveSourceCodeContext = computeEffectiveSourceCodeContext(
        newSourceCodeContext,
        currentSourceCodeContext
    );

    // Check if there are any updates
    const hasNewContext = Object.keys(newShopperContext).length > 0;
    const hasNewSourceCodeContext = Object.keys(newSourceCodeContext).length > 0;

    // Only call API if there are updates
    if (hasNewContext || hasNewSourceCodeContext) {
        const shopperContextBody = buildShopperContextBody(newShopperContext, newSourceCodeContext);
        await getShopperContextHelpers(context, usid).update(shopperContextBody, {
            initialContext: buildShopperContextBody(
                // Cookies contain canonical API names, which can differ from URL aliases.
                Object.fromEntries(
                    Object.entries(effectiveShopperContext).filter(
                        ([key]) => isCustomQualifier(key) || isAssignmentQualifier(key) || rememberedRootKeys.has(key)
                    )
                ),
                effectiveSourceCodeContext
            ),
        });
    }

    // Serialize updated cookies as Set-Cookie headers. The shopper-context cookie is JSON-encoded
    // (carries multiple qualifiers); the source-code cookie is a bare string so SFRA storefronts
    // sharing the same `dwsourcecode_*` cookie name can read it directly.
    try {
        if (hasNewSourceCodeContext) {
            const header = await sourceCodeCookieHandler.serialize(effectiveSourceCodeContext.sourceCode ?? '', {
                maxAge: SOURCE_CODE_COOKIE_EXPIRY_SECONDS,
            });
            setCookieHeaders.push(header);
        }

        if (hasNewContext) {
            const header = await shopperContextCookieHandler.serialize(JSON.stringify(effectiveShopperContext), {
                maxAge: SHOPPER_CONTEXT_COOKIE_EXPIRY_SECONDS,
            });
            setCookieHeaders.push(header);
        }
    } catch (cookieError) {
        logger.error('Failed to serialize shopper context cookie', {
            error: cookieError instanceof Error ? cookieError.message : String(cookieError),
        });
    }

    return { setCookieHeaders };
}

/**
 * Build ShopperContext API body
 *
 * @param contextMap - Map of key-value pairs for shopper context (includes both root-level and custom qualifiers)
 * @param sourceCodeContextMap - Map of key-value pairs for source code context
 * @returns ShopperContext body for API call
 */
export function buildShopperContextBody(
    contextMap: Record<string, string>,
    sourceCodeContextMap: Record<string, string>
): Partial<ShopperContext> {
    const body: Partial<ShopperContext> = {};

    if (sourceCodeContextMap.sourceCode !== undefined) {
        body.sourceCode = sourceCodeContextMap.sourceCode;
    }

    Object.keys(contextMap).forEach((key) => {
        // Validate key and value
        if (!key || typeof key !== 'string' || key.trim().length === 0) {
            return;
        }

        const rawValue = contextMap[key];

        // Skip if value is not a string
        if (typeof rawValue !== 'string') {
            return;
        }

        const isKeyCustomQualifier = isCustomQualifier(key);
        const isKeyAssignmentQualifier = isAssignmentQualifier(key);
        const isKeyCouponCode = isCouponCode(key);
        const isKeyCustomerGroupIds = isCustomerGroupIds(key);

        const valueArray = rawValue.split(',');
        const value = valueArray.length === 1 ? valueArray[0] : undefined;

        if (isKeyCouponCode && valueArray && Array.isArray(valueArray)) {
            body.couponCodes = rawValue === '' ? [] : valueArray;
        } else if (isKeyCustomerGroupIds && valueArray && Array.isArray(valueArray)) {
            body.customerGroupIds = rawValue === '' ? [] : valueArray;
        } else if (typeof value === 'string') {
            if (isKeyCustomQualifier) {
                // Add custom qualifiers
                body.customQualifiers = {
                    ...body.customQualifiers,
                    [key]: value,
                };
            } else if (isKeyAssignmentQualifier) {
                // Add assignment qualifiers
                body.assignmentQualifiers = {
                    ...body.assignmentQualifiers,
                    [key]: value,
                };
            } else {
                // Add root-level qualifiers
                (body as Record<string, string>)[key] = value;
            }
        }
    });

    return body;
}
