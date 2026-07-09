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
import type { HtmlContent } from '@/components/html-fragment/types';

/**
 * @feature-stub Product Content (server module)
 * @status stub — no backend integration
 *
 * Server-only API for the Product Content extension. Ships with mock fixtures so
 * the PDP collapsible sections, returns & warranty card, and "Ask assistant" FAQ
 * are fully functional out of the box. A merchant integrating a real CMS or PIM
 * should replace the body of each function below — call sites in the loader and
 * UITarget wrappers do not change.
 *
 * Mock note: fixtures return the same values for every product. The `_productId`
 * parameter is intentionally accepted but ignored.
 *
 * See docs/README-FEATURE-STUBS.md for the full list and guidance on
 * productionizing or removing stubs.
 */

export type { HtmlContent };

export interface ReturnsAndWarrantyData {
    title: string;
    description: string;
    returnsPolicy: {
        heading: string;
        intro: string;
        conditions: string[];
        howToReturn: string[];
        note?: string;
    };
    warranty: {
        heading: string;
        intro: string;
        whatsCovered: string[];
        whatsNotCovered: string[];
        claimsProcess: string;
    };
    exchanges: {
        heading: string;
        intro: string;
        process: string;
    };
    needHelp?: {
        intro: string;
        email: string;
        phone: string;
    };
}

export interface ProductDescriptionData {
    heading: string;
    intro: string;
    features: HtmlContent[];
}

export type IngredientsData = HtmlContent;
export type UsageInstructionsData = HtmlContent;
export type CareInstructionsData = HtmlContent;
export type TechSpecsData = HtmlContent;

const MOCK_RETURNS_AND_WARRANTY_DATA: ReturnsAndWarrantyData = {
    title: '30-Day Returns & 1 Year Warranty',
    description: 'Returns accepted within 30 days. Full warranty coverage included.',
    returnsPolicy: {
        heading: '30-Day Returns Policy',
        intro: "We want you to love your purchase. If you're not completely satisfied, you can return most items within 30 days of delivery for a full refund or exchange.",
        conditions: [
            'Items must be in original, unworn condition',
            'Original tags and packaging must be included',
            'Items must not show signs of use or damage',
            'Proof of purchase required',
        ],
        howToReturn: [
            'Log into your account and go to Order History',
            'Select the item(s) you wish to return',
            'Print the prepaid return label',
            'Package the item(s) securely and attach the label',
            'Drop off at any authorized carrier location',
        ],
        note: 'Return shipping costs are the responsibility of the customer unless the item is defective or incorrect.',
    },
    warranty: {
        heading: '1-Year Warranty',
        intro: "All products come with a comprehensive 1-year manufacturer's warranty covering defects in materials and workmanship.",
        whatsCovered: [
            'Manufacturing defects',
            'Material defects',
            'Workmanship issues',
            'Premature wear under normal use',
        ],
        whatsNotCovered: [
            'Normal wear and tear',
            'Damage from misuse or accidents',
            'Damage from improper care or cleaning',
            'Modifications or alterations',
        ],
        claimsProcess:
            "To file a warranty claim, contact our customer service team with your order number, photos of the defect, and a description of the issue. We'll review your claim and provide a resolution within 5-7 business days.",
    },
    exchanges: {
        heading: 'Exchanges',
        intro: 'Need a different size or color? We offer hassle-free exchanges within 30 days of purchase. Exchanges are subject to product availability.',
        process:
            "Follow the same return process and specify that you'd like an exchange. We'll process your exchange once we receive your original item.",
    },
    needHelp: {
        intro: 'Our customer service team is here to assist you.',
        email: 'support@marketstreet.com',
        phone: '1-800-123-4567',
    },
};

const MOCK_INGREDIENTS_DATA: IngredientsData = {
    html: '<ul><li>High-density composite resin</li><li>UV-resistant matte coating</li><li>Weighted stabilizing core</li></ul>',
    contentType: 'bulleted-list',
};

const MOCK_USAGE_INSTRUCTIONS_DATA: UsageInstructionsData = {
    html: '<ul><li>Place on any flat, stable surface</li><li>Position near natural light for best effect</li><li>Rotate periodically to appreciate all angles</li></ul>',
    contentType: 'bulleted-list',
};

const MOCK_CARE_INSTRUCTIONS_DATA: CareInstructionsData = {
    html: '<ul><li>Hand wash cold</li><li>Do not wring or twist</li><li>Hang dry</li><li>Iron on low heat on reverse side</li></ul>',
    contentType: 'bulleted-list',
};

const MOCK_TECH_SPECS_DATA: TechSpecsData = {
    html: '<table style="border: none;"><tr style="border: none;"><td style="font-weight: normal">Material:</td><td>Premium composite</td></tr><tr style="border: none;"><td style="font-weight: normal">Finish:</td><td>Matte</td></tr><tr style="border: none;"><td style="font-weight: normal">Origin:</td><td>Made in Portugal</td></tr></table>',
    contentType: 'table-2-column',
};

/**
 * Fetch returns & warranty content for a product. Replace the body of this
 * function with a real CMS / commerce-cloud call when integrating.
 */
export function getReturnsAndWarranty(_productId?: string): Promise<ReturnsAndWarrantyData> {
    return Promise.resolve(MOCK_RETURNS_AND_WARRANTY_DATA);
}

/** Fetch ingredients / materials content. Replace the body with a real backend call. */
export function getIngredientsData(_productId?: string): Promise<IngredientsData> {
    return Promise.resolve(MOCK_INGREDIENTS_DATA);
}

/** Fetch usage instructions content. Replace the body with a real backend call. */
export function getUsageInstructions(_productId?: string): Promise<UsageInstructionsData> {
    return Promise.resolve(MOCK_USAGE_INSTRUCTIONS_DATA);
}

/** Fetch care instructions content. Replace the body with a real backend call. */
export function getCareInstructions(_productId?: string): Promise<CareInstructionsData> {
    return Promise.resolve(MOCK_CARE_INSTRUCTIONS_DATA);
}

/** Fetch technical specifications content. Replace the body with a real backend call. */
export function getTechSpecs(_productId?: string): Promise<TechSpecsData> {
    return Promise.resolve(MOCK_TECH_SPECS_DATA);
}

/**
 * Mapping of section key → server function for the merchant-customizable
 * collapsible PDP sections (see `lib/pdp-sections.ts`). Each entry returns
 * pre-rendered HTML content; render order is controlled by `pdp-sections.ts`.
 */
export const pdpSectionApi = {
    getIngredientsData,
    getUsageInstructions,
    getCareInstructions,
    getTechSpecs,
} as const;

export type PdpSectionApiMethod = keyof typeof pdpSectionApi;
