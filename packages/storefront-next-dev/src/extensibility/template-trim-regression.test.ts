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
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '@babel/parser';
import { afterEach, describe, expect, it } from 'vitest';
import trimExtensions from './trim-extensions';

const templateRoot = fileURLToPath(new URL('../../../template', import.meta.url));
const fixtureRoots: string[] = [];
const extensionConfig = {
    extensions: {
        SFDC_EXT_BOPIS: { folder: 'bopis' },
        SFDC_EXT_SHIPPING_DELIVERY: { folder: 'shipping-delivery' },
    },
};
const deliveryEstimatePresentationIntegrationFiles = [
    'src/components/product-view/product-info.tsx',
    'src/components/product-view/product-view.tsx',
    'src/verticals/footwear/components/product-view/product-info.tsx',
    'src/verticals/footwear/components/product-view/product-view.tsx',
    'src/verticals/furniture/components/product-view/how-to-get-it.tsx',
];
const deliveryEstimatePresentationTestFiles = [
    'src/components/product-view/product-info.test.tsx',
    'src/components/product-view/product-view.test.tsx',
    'src/verticals/footwear/components/product-view/product-info.test.tsx',
    'src/verticals/footwear/components/product-view/product-view.test.tsx',
    'src/verticals/furniture/components/product-view/how-to-get-it.test.tsx',
];
const deliveryOptionsTestFile = 'src/components/fulfillment/delivery-options.test.tsx';
const footwearCategoryRefinementsFile = 'src/verticals/footwear/components/category-refinements/index.tsx';
const estimatedDeliveryTestFile = 'src/extensions/shipping-delivery/components/estimated-delivery/index.test.tsx';
const deliveryEstimateCalculatorTargetTestFile =
    'src/extensions/shipping-delivery/components/target/delivery-estimate-calculator-target.test.tsx';
const deliveryEstimateCalculatorSkeletonFile =
    'src/extensions/shipping-delivery/components/target/delivery-estimate-calculator-skeleton.tsx';
const coordinatedEstimateTestNames = [
    'keeps focus on Pickup when a coordinated estimate settles after Pickup is selected',
    'does not move focus when the previous product request settles after a variant change',
    'coordinates a resolved estimate with the explicitly eligible Delivery host',
    'keeps resolved estimate controls at the standalone target without an eligible host',
    'defaults a direct estimator to standalone presentation even with an eligible provider host',
    'coordinates a variant estimate with the master product presentation host',
    'keeps a hard-error calculator at the standalone target',
    'uses only the primary matching host and ignores stale host cleanup',
    'clears coordinated success before showing destination editing',
    'moves coordinated cookie-restoration loading into Delivery',
    'uses the destination link and fallback guidance in the composed Delivery option',
    'clears coordinated presentation on product change',
    'coordinates only one estimator source and leaves duplicate estimators standalone',
    'resolves every aria-labelledby reference in coordinated presentation',
];

function createFixture(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sfnext-trim-regression-'));
    fixtureRoots.push(root);
    const relativeFiles = [
        'src/components/fulfillment/delivery-options.tsx',
        deliveryOptionsTestFile,
        'src/components/fulfillment/stories/delivery-options.stories.tsx',
        'src/components/fulfillment/fulfillment-option-picker.tsx',
        'src/components/fulfillment/cart-delivery-option.tsx',
        'src/components/checkout/checkout-form-page.tsx',
        'src/components/product-view/product-info.tsx',
        'src/components/product-view/product-info.test.tsx',
        'src/components/product-view/product-view.tsx',
        'src/components/product-view/product-view.test.tsx',
        'src/hooks/product/use-product-actions.ts',
        'src/extensions/locales/de-DE/index.ts',
        'src/extensions/shipping-delivery/target-config.json',
        estimatedDeliveryTestFile,
        deliveryEstimateCalculatorTargetTestFile,
        deliveryEstimateCalculatorSkeletonFile,
        'src/routes/_app.product.$productId.tsx',
        'src/verticals/cosmetic/routes/_app.product.$productId.tsx',
        'src/verticals/foundations/routes/_app.product.$productId.tsx',
        'src/verticals/foundations/routes/_app.product.$productId.test.tsx',
        'src/verticals/footwear/routes/_app.product.$productId.tsx',
        footwearCategoryRefinementsFile,
        'src/verticals/footwear/components/product-view/product-view.tsx',
        'src/verticals/footwear/components/product-view/product-view.test.tsx',
        'src/verticals/footwear/components/product-view/product-info.tsx',
        'src/verticals/footwear/components/product-view/product-info.test.tsx',
        'src/verticals/furniture/components/product-view/how-to-get-it.tsx',
        'src/verticals/furniture/components/product-view/how-to-get-it.test.tsx',
    ];

    for (const relativeFile of relativeFiles) {
        const destination = path.join(root, relativeFile);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(templateRoot, relativeFile), destination);
    }
    fs.writeFileSync(path.join(root, 'src/extensions/config.json'), JSON.stringify(extensionConfig));
    fs.mkdirSync(path.join(root, 'src/extensions/locales/de-DE'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'src/extensions/locales/de-DE/index.ts'),
        [
            '// @sfdc-extension-line SFDC_EXT_BOPIS',
            "import bopisTranslations from '@/extensions/bopis/locales/de-DE/translations.json';",
            'export default {',
            '    // @sfdc-extension-line SFDC_EXT_BOPIS',
            '    extBopis: bopisTranslations,',
            '};',
        ].join('\n')
    );
    return root;
}

function expectValidTypeScriptJsx(source: string): void {
    expect(() => parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx', 'decorators'] })).not.toThrow();
}

function expectNoUnusedBopisImports(source: string): void {
    expect(source).not.toMatch(/\bReactNode\b|\buseState\b/);
}

function hasObjectProperty(source: string, propertyName: string): boolean {
    let found = false;
    const visit = (value: unknown): void => {
        if (found || !value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }

        const node = value as {
            type?: string;
            key?: { type?: string; name?: string };
            [key: string]: unknown;
        };
        if (node.type === 'ObjectProperty' && node.key?.type === 'Identifier' && node.key.name === propertyName) {
            found = true;
            return;
        }
        Object.values(node).forEach(visit);
    };

    visit(parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx', 'decorators'] }));
    return found;
}

function expectTrimmedDeliveryDescription(source: string): void {
    expect(source).not.toMatch(/\blet\s+deliveryDescription\b/);
    expect(hasObjectProperty(source, 'defaultDeliveryDescription')).toBe(false);
}

function expectShippingDeliveryTestCoverage(
    root: string,
    { shippingEnabled, compositionEnabled }: { shippingEnabled: boolean; compositionEnabled: boolean }
): void {
    for (const relativeFile of deliveryEstimatePresentationTestFiles) {
        const source = fs.readFileSync(path.join(root, relativeFile), 'utf8');
        expectValidTypeScriptJsx(source);
        if (compositionEnabled) {
            expect(source).toContain('enableDeliveryEstimatePresentation');
        } else {
            expect(source).not.toContain('enableDeliveryEstimatePresentation');
            expect(source).not.toContain('data-enable-delivery-estimate-presentation');
        }
        if (!shippingEnabled) expect(source).not.toContain('@/extensions/shipping-delivery');
    }
}

function expectFulfillmentCompositionTestCoverage(
    root: string,
    { bopisEnabled, shippingEnabled }: { bopisEnabled: boolean; shippingEnabled: boolean }
): void {
    const deliveryOptionsTest = fs.readFileSync(path.join(root, deliveryOptionsTestFile), 'utf8');
    expectValidTypeScriptJsx(deliveryOptionsTest);
    if (bopisEnabled && shippingEnabled) {
        expect(deliveryOptionsTest).toContain('requires the exact Delivery and Pickup pair for estimate presentation');
        expect(deliveryOptionsTest).toContain('isDeliveryEstimatePresentationHost');
    } else {
        expect(deliveryOptionsTest).not.toContain(
            'requires the exact Delivery and Pickup pair for estimate presentation'
        );
        expect(deliveryOptionsTest).not.toContain('isDeliveryEstimatePresentationHost');
    }

    if (bopisEnabled) {
        expect(deliveryOptionsTest).toContain('uses caller instance IDs to keep multiple picker controls unique');
    } else {
        expect(deliveryOptionsTest).not.toContain('uses caller instance IDs to keep multiple picker controls unique');
    }

    const estimatedDeliveryTestPath = path.join(root, estimatedDeliveryTestFile);
    if (!shippingEnabled) {
        expect(fs.existsSync(estimatedDeliveryTestPath)).toBe(false);
        return;
    }

    const estimatedDeliveryTest = fs.readFileSync(estimatedDeliveryTestPath, 'utf8');
    expectValidTypeScriptJsx(estimatedDeliveryTest);
    expect(estimatedDeliveryTest).toContain('uses unique IDs for multiple standalone estimators');
    if (bopisEnabled) {
        expect(estimatedDeliveryTest).toContain(
            "import DeliveryOptions from '@/components/fulfillment/delivery-options'"
        );
        expect(estimatedDeliveryTest).toContain(
            "import { ShippingDeliveryProvider } from '@/extensions/shipping-delivery/context/shipping-delivery-context'"
        );
    } else {
        expect(estimatedDeliveryTest).not.toContain(
            "import DeliveryOptions from '@/components/fulfillment/delivery-options'"
        );
        expect(estimatedDeliveryTest).not.toContain(
            "import { ShippingDeliveryProvider } from '@/extensions/shipping-delivery/context/shipping-delivery-context'"
        );
    }
    for (const testName of coordinatedEstimateTestNames) {
        if (bopisEnabled) {
            expect(estimatedDeliveryTest).toContain(testName);
        } else {
            expect(estimatedDeliveryTest).not.toContain(testName);
        }
    }

    const calculatorTargetTest = fs.readFileSync(path.join(root, deliveryEstimateCalculatorTargetTestFile), 'utf8');
    expectValidTypeScriptJsx(calculatorTargetTest);
    if (bopisEnabled) {
        expect(calculatorTargetTest).toContain(
            "import DeliveryOptions from '@/components/fulfillment/delivery-options'"
        );
    } else {
        expect(calculatorTargetTest).not.toContain(
            "import DeliveryOptions from '@/components/fulfillment/delivery-options'"
        );
    }
}

function expectFootwearCategoryRefinements(root: string, bopisEnabled: boolean): void {
    const source = fs.readFileSync(path.join(root, footwearCategoryRefinementsFile), 'utf8');
    expectValidTypeScriptJsx(source);
    if (bopisEnabled) {
        expect(source).toContain("'ilids'");
        expect(source).toContain('RefineInventory');
    } else {
        expect(source).not.toContain("'ilids'");
        expect(source).not.toContain('RefineInventory');
    }
}

afterEach(() => {
    for (const root of fixtureRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('template extension trim regressions', () => {
    it('keeps the shipping delivery target when only Shipping Delivery is enabled', async () => {
        const root = createFixture();

        await trimExtensions(
            root,
            { SFDC_EXT_BOPIS: false, SFDC_EXT_SHIPPING_DELIVERY: true },
            extensionConfig as never
        );

        const source = fs.readFileSync(path.join(root, 'src/components/fulfillment/delivery-options.tsx'), 'utf8');
        expectValidTypeScriptJsx(source);
        expect(source).not.toContain('@sfdc-extension');
        expectNoUnusedBopisImports(source);
        expectTrimmedDeliveryDescription(source);
        const productInfoSource = fs.readFileSync(
            path.join(root, 'src/components/product-view/product-info.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(productInfoSource);
        expect(productInfoSource).toContain('targetId="sfcc.pdp.estimatedDelivery"');
        expect(productInfoSource.indexOf('targetId="sfcc.pdp.estimatedDelivery"')).toBeLessThan(
            productInfoSource.indexOf('<ProductQuantityPicker')
        );
        const shippingConfig = JSON.parse(
            fs.readFileSync(path.join(root, 'src/extensions/shipping-delivery/target-config.json'), 'utf8')
        );
        expect(shippingConfig).toEqual({
            components: [
                {
                    targetId: 'sfcc.pdp.estimatedDelivery',
                    path: 'extensions/shipping-delivery/components/target/delivery-estimate-summary-target.tsx',
                    order: 0,
                },
            ],
        });

        const cartSource = fs.readFileSync(
            path.join(root, 'src/components/fulfillment/cart-delivery-option.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(cartSource);
        expect(cartSource).not.toContain('Bopis');
        expect(cartSource).not.toContain('isSiteOutOfStock');
        expect(cartSource).toContain('return adapter');

        const productActionsSource = fs.readFileSync(
            path.join(root, 'src/hooks/product/use-product-actions.ts'),
            'utf8'
        );
        expectValidTypeScriptJsx(productActionsSource);
        expect(productActionsSource).toContain('type SelectedFulfillmentOption');

        const checkoutSource = fs.readFileSync(
            path.join(root, 'src/components/checkout/checkout-form-page.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(checkoutSource);
        expect(checkoutSource).not.toContain('import { CHECKOUT_STEPS }');
        expect(checkoutSource).toContain('type CheckoutStep');

        const localeSource = fs.readFileSync(path.join(root, 'src/extensions/locales/de-DE/index.ts'), 'utf8');
        expect(localeSource).not.toContain('@/extensions/bopis/locales/de-DE/translations.json');
        expect(localeSource).not.toContain('extBopis');

        const foundationsProductRouteTest = fs.readFileSync(
            path.join(root, 'src/verticals/foundations/routes/_app.product.$productId.test.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(foundationsProductRouteTest);
        expect(foundationsProductRouteTest).toContain(
            '@/extensions/shipping-delivery/context/shipping-delivery-context'
        );
        expect(foundationsProductRouteTest).not.toContain('@/extensions/bopis');
        expect(foundationsProductRouteTest).not.toContain('pickup-context');

        for (const relativeFile of [
            'src/routes/_app.product.$productId.tsx',
            'src/verticals/cosmetic/routes/_app.product.$productId.tsx',
            'src/verticals/foundations/routes/_app.product.$productId.tsx',
            'src/verticals/footwear/routes/_app.product.$productId.tsx',
        ]) {
            const routeSource = fs.readFileSync(path.join(root, relativeFile), 'utf8');
            expectValidTypeScriptJsx(routeSource);
            expect(routeSource).toContain('ShippingDeliveryProvider');
            expect(routeSource).not.toContain('initialDestinationPromise');
            expect(routeSource).not.toContain('getInitialDeliveryDestination');
        }

        const footwearProductView = fs.readFileSync(
            path.join(root, 'src/verticals/footwear/components/product-view/product-view.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(footwearProductView);
        expect(footwearProductView).not.toContain('useStoreLocator');
        expect(footwearProductView).not.toContain('inventoryIds');
        const footwearProductInfo = fs.readFileSync(
            path.join(root, 'src/verticals/footwear/components/product-view/product-info.tsx'),
            'utf8'
        );
        const furnitureHowToGetIt = fs.readFileSync(
            path.join(root, 'src/verticals/furniture/components/product-view/how-to-get-it.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(footwearProductInfo);
        expectValidTypeScriptJsx(furnitureHowToGetIt);
        for (const relativeFile of deliveryEstimatePresentationIntegrationFiles) {
            const integrationSource = fs.readFileSync(path.join(root, relativeFile), 'utf8');
            expectValidTypeScriptJsx(integrationSource);
            expect(integrationSource).not.toContain('enableDeliveryEstimatePresentation');
        }
        const storySource = fs.readFileSync(
            path.join(root, 'src/components/fulfillment/stories/delivery-options.stories.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(storySource);
        expect(storySource).not.toContain('ResolvedEstimateWithPickup');
        expect(storySource).not.toContain('@/extensions/shipping-delivery');
        expectShippingDeliveryTestCoverage(root, { shippingEnabled: true, compositionEnabled: false });
        expectFulfillmentCompositionTestCoverage(root, { bopisEnabled: false, shippingEnabled: true });
        expectFootwearCategoryRefinements(root, false);
    });

    it('keeps the direct pickup integration when only BOPIS is enabled', async () => {
        const root = createFixture();

        await trimExtensions(
            root,
            { SFDC_EXT_BOPIS: true, SFDC_EXT_SHIPPING_DELIVERY: false },
            extensionConfig as never
        );

        const source = fs.readFileSync(path.join(root, 'src/components/fulfillment/delivery-options.tsx'), 'utf8');
        expectValidTypeScriptJsx(source);
        expect(source).toContain('useBopisFulfillmentOption');
        expectTrimmedDeliveryDescription(source);
        for (const relativeFile of deliveryEstimatePresentationIntegrationFiles) {
            const integrationSource = fs.readFileSync(path.join(root, relativeFile), 'utf8');
            expectValidTypeScriptJsx(integrationSource);
            expect(integrationSource).not.toContain('enableDeliveryEstimatePresentation');
        }
        const storySource = fs.readFileSync(
            path.join(root, 'src/components/fulfillment/stories/delivery-options.stories.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(storySource);
        expect(storySource).not.toContain('ResolvedEstimateWithPickup');
        expect(storySource).not.toContain('@/extensions/shipping-delivery');
        expectShippingDeliveryTestCoverage(root, { shippingEnabled: false, compositionEnabled: false });
        expectFulfillmentCompositionTestCoverage(root, { bopisEnabled: true, shippingEnabled: false });
        expectFootwearCategoryRefinements(root, true);
    });

    it('keeps direct fulfillment composition when both extensions are enabled', async () => {
        const root = createFixture();

        await trimExtensions(
            root,
            { SFDC_EXT_BOPIS: true, SFDC_EXT_SHIPPING_DELIVERY: true },
            extensionConfig as never
        );

        const source = fs.readFileSync(path.join(root, 'src/components/fulfillment/delivery-options.tsx'), 'utf8');
        expectValidTypeScriptJsx(source);
        expect(source).toContain('useBopisFulfillmentOption');
        expect(source).not.toContain('virtual:fulfillment-contributors');
        expectTrimmedDeliveryDescription(source);
        for (const relativeFile of deliveryEstimatePresentationIntegrationFiles) {
            const integrationSource = fs.readFileSync(path.join(root, relativeFile), 'utf8');
            expectValidTypeScriptJsx(integrationSource);
            expect(integrationSource).toContain('enableDeliveryEstimatePresentation');
        }
        const storySource = fs.readFileSync(
            path.join(root, 'src/components/fulfillment/stories/delivery-options.stories.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(storySource);
        expect(storySource).toContain('DeliveryCalculatorDisclosure');
        expect(storySource).toContain('DeliveryEstimateCalculatorTarget');
        expectShippingDeliveryTestCoverage(root, { shippingEnabled: true, compositionEnabled: true });
        expectFulfillmentCompositionTestCoverage(root, { bopisEnabled: true, shippingEnabled: true });
        expectFootwearCategoryRefinements(root, true);
    });

    it('removes the fulfillment picker when BOPIS is not installed', async () => {
        const root = createFixture();

        await trimExtensions(
            root,
            { SFDC_EXT_BOPIS: false, SFDC_EXT_SHIPPING_DELIVERY: false },
            extensionConfig as never
        );

        const source = fs.readFileSync(path.join(root, 'src/components/fulfillment/delivery-options.tsx'), 'utf8');
        expectValidTypeScriptJsx(source);
        expect(source).not.toContain('virtual:fulfillment-contributors');
        expectNoUnusedBopisImports(source);
        expectTrimmedDeliveryDescription(source);
        for (const relativeFile of deliveryEstimatePresentationIntegrationFiles) {
            const integrationSource = fs.readFileSync(path.join(root, relativeFile), 'utf8');
            expectValidTypeScriptJsx(integrationSource);
            expect(integrationSource).not.toContain('enableDeliveryEstimatePresentation');
        }
        const storySource = fs.readFileSync(
            path.join(root, 'src/components/fulfillment/stories/delivery-options.stories.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(storySource);
        expect(storySource).not.toContain('ResolvedEstimateWithPickup');
        expect(storySource).not.toContain('@/extensions/shipping-delivery');
        const pickerSource = fs.readFileSync(
            path.join(root, 'src/components/fulfillment/fulfillment-option-picker.tsx'),
            'utf8'
        );
        expect(pickerSource).toContain('if (orderedOptions.length < 2) return null;');
        const productInfoSource = fs.readFileSync(
            path.join(root, 'src/components/product-view/product-info.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(productInfoSource);
        expect(productInfoSource).not.toContain('sfcc.pdp.estimatedDelivery');
        const productInfoTestSource = fs.readFileSync(
            path.join(root, 'src/components/product-view/product-info.test.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(productInfoTestSource);
        expect(productInfoTestSource).not.toContain("screen.getByRole('radiogroup')");
        expectShippingDeliveryTestCoverage(root, { shippingEnabled: false, compositionEnabled: false });
        expectFulfillmentCompositionTestCoverage(root, { bopisEnabled: false, shippingEnabled: false });
        expectFootwearCategoryRefinements(root, false);
        expect(
            fs.existsSync(path.join(root, 'src/verticals/foundations/routes/_app.product.$productId.test.tsx'))
        ).toBe(false);
        for (const relativeFile of [
            'src/routes/_app.product.$productId.tsx',
            'src/verticals/cosmetic/routes/_app.product.$productId.tsx',
            'src/verticals/foundations/routes/_app.product.$productId.tsx',
            'src/verticals/footwear/routes/_app.product.$productId.tsx',
        ]) {
            const routeSource = fs.readFileSync(path.join(root, relativeFile), 'utf8');
            expectValidTypeScriptJsx(routeSource);
            expect(routeSource).not.toContain('ShippingDeliveryProvider');
        }
    });
});
