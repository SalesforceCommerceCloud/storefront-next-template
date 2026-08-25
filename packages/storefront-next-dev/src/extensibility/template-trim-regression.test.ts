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

function createFixture(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sfnext-trim-regression-'));
    fixtureRoots.push(root);
    const relativeFiles = [
        'src/components/fulfillment/delivery-options.tsx',
        'src/components/fulfillment/fulfillment-option-picker.tsx',
        'src/components/fulfillment/cart-delivery-option.tsx',
        'src/components/checkout/checkout-form-page.tsx',
        'src/components/product-view/product-info.tsx',
        'src/components/product-view/product-info.test.tsx',
        'src/components/product-view/product-view.tsx',
        'src/hooks/product/use-product-actions.ts',
        'src/extensions/locales/de-DE/index.ts',
        'src/extensions/shipping-delivery/target-config.json',
        'src/routes/_app.product.$productId.tsx',
        'src/verticals/cosmetic/routes/_app.product.$productId.tsx',
        'src/verticals/foundations/routes/_app.product.$productId.tsx',
        'src/verticals/foundations/routes/_app.product.$productId.test.tsx',
        'src/verticals/footwear/routes/_app.product.$productId.tsx',
        'src/verticals/footwear/components/product-view/product-view.tsx',
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
