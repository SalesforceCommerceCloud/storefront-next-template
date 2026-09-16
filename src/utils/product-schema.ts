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
import type { ShopperProducts } from '@/scapi';

type JsonLdObject = Record<string, unknown>;

// TODO: Remove when SCAPI types include `type` on PageMetaTag
interface PageMetaTag {
    type?: string;
    id?: string;
    value?: string;
}

/**
 * Deep-merges two plain objects. Values from `override` take precedence.
 * Arrays are replaced entirely (not concatenated) to preserve customer intent.
 * @mutates base
 */
export function deepMerge(base: JsonLdObject, override: JsonLdObject): JsonLdObject {
    for (const key of Object.keys(override)) {
        const overrideVal = override[key];
        const baseVal = base[key];

        if (
            overrideVal !== null &&
            typeof overrideVal === 'object' &&
            !Array.isArray(overrideVal) &&
            baseVal !== null &&
            typeof baseVal === 'object' &&
            !Array.isArray(baseVal)
        ) {
            deepMerge(baseVal as JsonLdObject, overrideVal as JsonLdObject);
        } else {
            base[key] = overrideVal;
        }
    }

    return base;
}

/**
 * Extracts JSON-LD schema objects from pageMetaTags.
 * Looks for entries with id "json-ld" and parses their value as JSON.
 */
export function parseJsonLdMetaTags(pageMetaTags: PageMetaTag[] | undefined | null): JsonLdObject | null {
    if (!pageMetaTags || !Array.isArray(pageMetaTags) || pageMetaTags.length === 0) {
        return null;
    }

    const jsonLdTags = pageMetaTags.filter(
        (tag) => tag.type === 'jsonld' && typeof tag.value === 'string' && tag.value
    );

    if (jsonLdTags.length === 0) {
        return null;
    }

    let merged: JsonLdObject | null = null;

    for (const tag of jsonLdTags) {
        try {
            const parsed = JSON.parse(tag.value as string);
            // Only accept plain objects (skip arrays/primitives). If multiple jsonld tags exist, deep-merge them sequentially.
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                merged = merged ? deepMerge(merged, parsed as JsonLdObject) : (parsed as JsonLdObject);
            }
        } catch {
            // Invalid JSON in pageMetaTag — skip silently
        }
    }

    return merged;
}

/**
 * Merges customer-defined JSON-LD attributes from pageMetaTags into a generated schema.
 * Customer values take priority over dynamically generated values.
 */
export function mergeJsonLdSchema<T extends JsonLdObject>(
    generatedSchema: T,
    pageMetaTags: PageMetaTag[] | undefined | null
): T {
    const customerSchema = parseJsonLdMetaTags(pageMetaTags);

    if (!customerSchema) {
        return generatedSchema;
    }

    return deepMerge(generatedSchema, customerSchema) as T;
}

/**
 * Schema.org Product JSON-LD structure
 * Based on https://schema.org/Product
 */
export interface ProductSchema extends Record<string, unknown> {
    '@context': string;
    '@type': 'Product';
    name?: string;
    description?: string;
    image?: string | string[];
    brand?: {
        '@type': 'Brand';
        name?: string;
    };
    sku?: string;
    mpn?: string;
    gtin?: string | string[];
    category?: string;
    productID?: string;
    offers?: {
        '@type': 'Offer';
        price?: string;
        priceCurrency?: string;
        availability?: string;
        url?: string;
        priceValidUntil?: string;
        itemCondition?: string;
        lowPrice?: string;
        highPrice?: string;
        seller?: {
            '@type': 'Organization';
            name?: string;
        };
    };
    aggregateRating?: {
        '@type': 'AggregateRating';
        ratingValue?: string;
        reviewCount?: string;
        bestRating?: string;
        worstRating?: string;
    };
    color?: string;
    additionalProperty?: Array<{
        '@type': 'PropertyValue';
        name: string;
        value: string | number;
    }>;
    url?: string;
}

/**
 * Helper to get the primary product image URL
 * Prioritizes large images for better SEO and rich results
 */
function getPrimaryImageUrl(product: ShopperProducts.schemas['Product']): string | undefined {
    if (!product.imageGroups || product.imageGroups.length === 0) return undefined;

    // Try to get large image first (best quality for rich results)
    const largeGroup = product.imageGroups.find((group) => group.viewType === 'large');
    if (largeGroup?.images?.[0]?.link) {
        return largeGroup.images[0].link;
    }

    const mediumGroup = product.imageGroups.find((group) => group.viewType === 'medium');
    if (mediumGroup?.images?.[0]?.link) {
        return mediumGroup.images[0].link;
    }

    // Fallback to first available image
    const firstGroup = product.imageGroups[0];
    return firstGroup?.images?.[0]?.link;
}

/**
 * Helper to get product image URLs for schema
 * Returns up to 5 high-quality images (large/medium only, no thumbnails)
 * Schema.org supports multiple images but recommends 3-5 high-quality product views
 */
function getAllImageUrls(product: ShopperProducts.schemas['Product']): string[] {
    if (!product.imageGroups || product.imageGroups.length === 0) return [];

    const imageUrls: string[] = [];
    // Only include large and medium images (exclude small and thumbnail for schema)
    const qualityGroups = product.imageGroups.filter(
        (group) => group.viewType === 'large' || group.viewType === 'medium'
    );

    // Prioritize large images first
    const sortedGroups = [...qualityGroups].sort((a, b) => {
        if (a.viewType === 'large' && b.viewType !== 'large') return -1;
        if (a.viewType !== 'large' && b.viewType === 'large') return 1;
        return 0;
    });

    // Collect unique image URLs, limiting to 5 images max
    for (const group of sortedGroups) {
        if (imageUrls.length >= 5) break;
        for (const image of group.images || []) {
            if (imageUrls.length >= 5) break;
            if (image.link && !imageUrls.includes(image.link)) {
                imageUrls.push(image.link);
            }
        }
    }

    return imageUrls;
}

/**
 * Helper to determine availability status
 */
function getAvailabilityStatus(product: ShopperProducts.schemas['Product']): string {
    if (product.inventory?.orderable) {
        if (product.inventory.ats && product.inventory.ats > 0) {
            return 'https://schema.org/InStock';
        }
        if (product.inventory.backorderable) {
            return 'https://schema.org/BackOrder';
        }
        if (product.inventory.preorderable) {
            return 'https://schema.org/PreOrder';
        }
    }
    return 'https://schema.org/OutOfStock';
}

/**
 * Helper to get the best price from product
 */
function getPrice(product: ShopperProducts.schemas['Product']): number | undefined {
    // Use price if available
    if (product.price !== undefined && product.price !== null) {
        return product.price;
    }

    // Try tiered prices
    if (product.tieredPrices && product.tieredPrices.length > 0) {
        return product.tieredPrices[0].price;
    }

    // Try price ranges
    if (product.priceRanges && product.priceRanges.length > 0) {
        return product.priceRanges[0].minPrice;
    }

    return undefined;
}

/**
 * Helper to get currency from product
 */
function getCurrency(product: ShopperProducts.schemas['Product']): string | undefined {
    return product.currency;
}

/**
 * Generates a Product JSON-LD schema from product data
 *
 * @param product - Product data from SFCC API
 * @param productUrl - Absolute product URL using the public storefront domain. Pass the loader's
 *   canonical page URL so structured data matches the canonical <link> and og:url.
 *   Do NOT rely on slugUrl from product API data as it may contain internal routing URLs.
 * @returns Product schema object ready for JSON-LD
 */
export function generateProductSchema(product: ShopperProducts.schemas['Product'], productUrl?: string): ProductSchema {
    // Get values from product
    const productName = product.name || '';
    const productDescription = product.longDescription || product.shortDescription || product.pageDescription || '';
    const defaultImage = getPrimaryImageUrl(product);
    const allImages = getAllImageUrls(product);
    const price = getPrice(product);
    const currency = getCurrency(product);
    const availability = getAvailabilityStatus(product);

    // Use the provided productUrl (should be public URL from loader)
    // Never rely on product.slugUrl as it may contain internal routing URLs
    const finalProductUrl = productUrl;

    // Build schema with overrides taking precedence
    // For image: use array if we have multiple unique product views (2-5 images),
    // otherwise use single primary image
    const imageValue: string | string[] =
        allImages.length > 1 && allImages.length <= 5 ? allImages : defaultImage || '';

    const schema: ProductSchema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: productName,
        description: productDescription,
        image: imageValue,
        sku: product.id,
        productID: product.id,
        url: finalProductUrl,
    };

    // Add MPN (Manufacturer Part Number) if available
    if (product.manufacturerSKU && typeof product.manufacturerSKU === 'string') {
        schema.mpn = product.manufacturerSKU;
    }

    // Add GTIN/EAN if available (can be EAN, UPC, or other GTIN formats)
    if (product.ean) {
        schema.gtin = product.ean;
    }

    // Add brand if available
    if (product.brand) {
        let brandName: string | undefined;
        if (typeof product.brand === 'string') {
            brandName = product.brand;
        } else if (typeof product.brand === 'object' && product.brand !== null && 'name' in product.brand) {
            brandName = (product.brand as { name?: string }).name;
        }

        if (brandName) {
            schema.brand = {
                '@type': 'Brand',
                name: brandName,
            };
        }
    }

    // Add offers (price, currency, availability)
    if (price !== undefined && currency) {
        const offer: NonNullable<ProductSchema['offers']> = {
            '@type': 'Offer',
            price: price.toFixed(2),
            priceCurrency: currency,
            availability,
            url: finalProductUrl,
            itemCondition: 'https://schema.org/NewCondition',
        };

        // Add price range if product has min/max prices (for master products with variants)
        if (product.priceMax && product.priceMax !== price) {
            offer.highPrice = product.priceMax.toFixed(2);
            offer.lowPrice = price.toFixed(2);
        } else if (product.price && product.priceMax && product.priceMax > product.price) {
            offer.highPrice = product.priceMax.toFixed(2);
            offer.lowPrice = product.price.toFixed(2);
        }

        // Add price valid until (optional - can be set to a future date for promotions)
        // For now, we'll set it to 1 year from now as a default
        const validUntil = new Date();
        validUntil.setFullYear(validUntil.getFullYear() + 1);
        offer.priceValidUntil = validUntil.toISOString().split('T')[0];

        schema.offers = offer;
    }

    // Add category if available
    if (product.primaryCategoryId) {
        schema.category = product.primaryCategoryId;
    }

    // Add color and other variation attributes
    if (product.variationAttributes && product.variationAttributes.length > 0) {
        const colorAttr = product.variationAttributes.find((attr) => attr.id === 'color');
        if (colorAttr?.values?.[0]?.value) {
            // Try to get the display name first, fallback to value
            const colorValue = colorAttr.values[0].name || colorAttr.values[0].value;
            schema.color = colorValue;
        }

        // Add all variation attributes as additional properties for better search visibility
        const variationProps: Array<{ '@type': 'PropertyValue'; name: string; value: string }> = [];
        product.variationAttributes.forEach((attr) => {
            if (attr.id && attr.values && attr.values.length > 0) {
                // For attributes with multiple values, join them
                const values = attr.values
                    .map((v) => v.name || v.value)
                    .filter((v): v is string => Boolean(v))
                    .join(', ');
                if (values) {
                    variationProps.push({
                        '@type': 'PropertyValue',
                        name: attr.name || attr.id,
                        value: values,
                    });
                }
            }
        });

        // Merge with existing additionalProperty if any
        if (variationProps.length > 0) {
            schema.additionalProperty = [...(schema.additionalProperty || []), ...variationProps];
        }
    }

    // Add additional properties from custom attributes
    if (product.customAttributes && Array.isArray(product.customAttributes)) {
        const additionalProps: Array<{ '@type': 'PropertyValue'; name: string; value: string | number }> = [];
        product.customAttributes.forEach((attr: { id?: string; value?: unknown }) => {
            if (attr.id && attr.value !== undefined && attr.value !== null) {
                additionalProps.push({
                    '@type': 'PropertyValue',
                    name: attr.id,
                    value: attr.value as string | number,
                });
            }
        });
        // Merge with existing additionalProperty (from variation attributes)
        if (additionalProps.length > 0) {
            schema.additionalProperty = [...(schema.additionalProperty || []), ...additionalProps];
        }
    }

    return mergeJsonLdSchema(schema, product.pageMetaTags as PageMetaTag[] | undefined);
}
