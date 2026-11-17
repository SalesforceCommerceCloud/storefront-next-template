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
import { spawnSync } from 'node:child_process';
import { resolveDependents, type ExtensionConfig } from './dependency-utils';

const templateRoot = fileURLToPath(new URL('../../../template', import.meta.url));
const fixtureRoots: string[] = [];
const extensionConfig = {
    extensions: {
        SFDC_EXT_STORE_LOCATOR: { folder: 'store-locator' },
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
        'src/middlewares/auth.server.ts',
        'src/middlewares/auth.utils.ts',
        'src/middlewares/site-context.server.ts',
        'src/lib/auth/auth-recovery.server.ts',
        'src/lib/auth/recovery-routes.server.ts',
        'src/types/compiled-routes.d.ts',
        'src/test-utils/__mocks__/compiled-routes.ts',
        'src/lib/api/auth/complete-registered-login.server.integration.test.ts',
        'src/routes/resource.auth-recovery.ts',
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
        'src/routes/_app.p.$.tsx',
        'src/verticals/cosmetic/routes/_app.p.$.tsx',
        'src/verticals/foundations/routes/_app.p.$.tsx',
        'src/verticals/foundations/routes/_app.p.$.test.tsx',
        'src/verticals/footwear/routes/_app.p.$.tsx',
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

it('executes stripped auth/site middleware and retained core login coverage after dependent removal', async () => {
    // Windows temp paths may use an 8.3 alias (RUNNER~1). Vite resolves long paths,
    // so canonicalize the fixture before config/setup resolution and spawning.
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'sfnext-stripped-auth-')));
    fixtureRoots.push(root);
    fs.cpSync(templateRoot, root, {
        recursive: true,
        filter: (file) => !/(?:^|[/\\])(node_modules|build|\.react-router|storybook-static)(?:[/\\]|$)/.test(file),
    });
    const config: ExtensionConfig = JSON.parse(fs.readFileSync(path.join(root, 'src/extensions/config.json'), 'utf8'));
    const removed = resolveDependents('SFDC_EXT_STORE_LOCATOR', config);
    expect(removed).toContain('SFDC_EXT_BOPIS');
    const selected = Object.fromEntries(Object.keys(config.extensions).map((key) => [key, !removed.includes(key)]));
    await trimExtensions(root, selected, config);
    const strippedPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(strippedPackage.dependencies['@salesforce/storefront-next-runtime']).toBeDefined();
    for (const relativeFile of ['src/middlewares/auth.server.ts', 'src/middlewares/site-context.server.ts']) {
        const source = fs.readFileSync(path.join(root, relativeFile), 'utf8');
        expectValidTypeScriptJsx(source);
        expect(source).not.toContain('isAuthRecoveryRequest');
        expect(source).not.toContain('isPreferredStoreMutationRequest');
        expect(source).not.toContain('Invalid recovery context');
        expect(source).not.toContain('authRecoveryReturnContext');
    }
    expect(fs.existsSync(path.join(root, 'src/routes/resource.auth-recovery.ts'))).toBe(false);
    for (const file of [
        'src/lib/auth/recovery-routes.server.ts',
        'src/types/compiled-routes.d.ts',
        'src/test-utils/__mocks__/compiled-routes.ts',
    ]) {
        expect(fs.existsSync(path.join(root, file))).toBe(false);
    }
    expect(fs.readFileSync(path.join(root, 'vitest.config.ts'), 'utf8')).not.toContain(
        'virtual:storefront-next/compiled-routes'
    );
    expect(fs.existsSync(path.join(root, 'src/extensions/bopis'))).toBe(false);
    // Run against this copy's aliases and real middleware imports in a separate Vitest
    // process. Sharing only installed dependencies prevents the source tree's module
    // cache or aliases from silently substituting untrimmed implementations.
    fs.symlinkSync(path.join(templateRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    const packageFile = path.join(root, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    delete packageJson.volta;
    fs.writeFileSync(packageFile, JSON.stringify(packageJson));
    const testFile = 'src/middlewares/stripped-auth.integration.test.ts';
    fs.writeFileSync(path.join(root, testFile), strippedAuthIntegration);
    const reportFile = path.join(root, 'stripped-auth-results.json');
    const vitestCli = path.join(templateRoot, 'node_modules/vitest/vitest.mjs');
    const result = spawnSync(
        process.execPath,
        [
            vitestCli,
            'run',
            testFile,
            'src/lib/api/auth/complete-registered-login.server.integration.test.ts',
            '--reporter=json',
            `--outputFile=${reportFile}`,
        ],
        {
            cwd: root,
            encoding: 'utf8',
            timeout: 60000,
            env: { ...process.env, VERTICAL: 'fashion' },
        }
    );
    expect(result.error, result.stderr).toBeUndefined();
    const reportText = fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf8') : 'No JSON report was written';
    expect(result.status, `${result.stdout}\n${result.stderr}\n${reportText}`).toBe(0);
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    expectStrippedReport(report, {
        [path.join(root, testFile)]: 2,
        [path.join(root, 'src/lib/api/auth/complete-registered-login.server.integration.test.ts')]: 23,
    });
}, 90000);

type StrippedReport = {
    success: boolean;
    numFailedTests: number;
    numFailedTestSuites: number;
    testResults: { name: string; status: string; assertionResults: { status: string }[] }[];
};

function expectStrippedReport(report: StrippedReport, expected: Record<string, number>) {
    expect(report.success).toBe(true);
    expect(report.numFailedTests).toBe(0);
    expect(report.numFailedTestSuites).toBe(0);
    expect(report.testResults.map((result) => fs.realpathSync(result.name)).sort()).toEqual(
        Object.keys(expected)
            .map((file) => fs.realpathSync(file))
            .sort()
    );
    for (const [file, minimum] of Object.entries(expected)) {
        const result = report.testResults.find((suite) => fs.realpathSync(suite.name) === fs.realpathSync(file));
        expect(result?.status).toBe('passed');
        expect(result?.assertionResults.length).toBeGreaterThanOrEqual(minimum);
        expect(result?.assertionResults.every((assertion) => assertion.status === 'passed')).toBe(true);
    }
}

it('rejects failed collection and wrong file identity while allowing added passing tests', () => {
    const file = fileURLToPath(import.meta.url);
    const report: StrippedReport = {
        success: true,
        numFailedTests: 0,
        numFailedTestSuites: 0,
        testResults: [{ name: file, status: 'passed', assertionResults: [{ status: 'passed' }, { status: 'passed' }] }],
    };
    expect(() => expectStrippedReport(report, { [file]: 1 })).not.toThrow();
    expect(() => expectStrippedReport({ ...report, numFailedTestSuites: 1 }, { [file]: 1 })).toThrow();
    expect(() => expectStrippedReport({ ...report, numFailedTests: 1 }, { [file]: 1 })).toThrow();
    expect(() => expectStrippedReport(report, { [`${file}.bogus`]: 1 })).toThrow();
});

const strippedAuthIntegration = `
import { readdirSync } from 'node:fs';
import { createCookie, createStaticHandler, RouterContextProvider } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { applyUrlConfig, siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { mockI18nContext } from '@salesforce/storefront-next-runtime/i18n';
import { createInstance } from 'i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { siteContextMiddleware } from './site-context.server';
import authMiddleware from './auth.server';
import { mockConfig } from '@/test-utils/config';
import { buildMockAccessToken } from '@/test-utils/auth';
import { performanceTimerContext } from './performance-metrics';
import { createMaintenance, maintenanceContext } from '@/lib/maintenance';
import { loggerContext } from '@/lib/logger.server';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each([
    ['/resource/auth-recovery?site=invalid&lng=unknown&returnTo=%2Faction%2Flogin', 'GET'],
    ['/action/set-selected-store', 'POST'],
])('returns an ordinary missing-route response without recovery for %s', async (endpoint, method) => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('SCAPI_PROXY_HOST', '');
    const fetch = vi.fn(() => { throw new Error('Missing routes must not refresh auth'); });
    vi.stubGlobal('fetch', fetch);
    const config = {
        ...mockConfig,
        url: { ...mockConfig.url, prefix: '/shop/:siteId/:localeId?', excludeRoutes: ['/resource/**', '/action/**'] },
        siteDetectionConfig: { order: ['cookie', 'path'] },
        localeDetectionConfig: { order: ['cookie', 'path'] },
    };
    const context = new RouterContextProvider();
    context.set(appConfigContext, config);
    context.set(performanceTimerContext, undefined);
    context.set(maintenanceContext, createMaintenance());
    context.set(loggerContext, { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    mockI18nContext(context, { locale: 'en-US', instance: createInstance() });
    const siteCookie = (await createCookie('site_id').serialize('RefArch')).split(';')[0];
    const localeCookie = (await createCookie('lng').serialize('en-US')).split(';')[0];
    const accessToken = buildMockAccessToken({ rcid: 'registered-customer', chid: 'RefArch' });
    const request = new Request('https://example.com' + endpoint, {
        method,
        headers: { Cookie: siteCookie + '; ' + localeCookie + '; cc-at_RefArch=' + accessToken + '; cc-nx_RefArch=refresh-proof' },
    });
    // Collect retained endpoint files from the stripped copy, then use the SDK's
    // real prefix/exclusion compiler instead of a hand-authored missing-route stub.
    const routes = readdirSync('src/routes')
        .filter((file) => /^(resource|action)\\..*\\.tsx?$/.test(file) && !file.includes('.test.'))
        .map((file) => ({ id: file, path: file.replace(/\\.tsx?$/, '').replaceAll('.', '/'), file }));
    expect(routes.some(({ path }) => path === 'resource/auth-recovery' || path === 'action/set-selected-store')).toBe(false);
    const compiled = applyUrlConfig({ routes, urlConfig: config.url, wrapperFile: 'wrapper.tsx' });
    const handler = createStaticHandler(compiled);
    const args = { request, context, params: {}, pattern: '/', url: new URL(request.url) };
    const result = await siteContextMiddleware(args, async () => {
        expect(context.get(siteContext).site.id).toBe('RefArch');
        expect(context.get(siteContext).locale.id).toBe('en-US');
        return authMiddleware(args, async () => {
            const result = await handler.query(request);
            expect(result).not.toBeInstanceOf(Response);
            return new Response('Missing route', { status: result.statusCode });
        });
    });
    expect(result.status).toBe(404);
    expect(result.headers.get('x-sfnext-auth-recovery')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
});
`;

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
    it.each([
        'src/root.tsx',
        'src/lib/api/auth/complete-registered-login.server.ts',
        'src/routes/_empty.logout.ts',
        'src/routes/_app.p.$.loader.test.ts',
        'src/routes/_app.p.$.tsx',
        'src/verticals/cosmetic/routes/_app.p.$.tsx',
        'src/verticals/footwear/routes/_app.p.$.tsx',
        'src/verticals/foundations/routes/_app.p.$.tsx',
        'src/verticals/furniture/routes/_app.p.$.tsx',
        'src/verticals/luxury/routes/_app.p.$.tsx',
    ])('strips Store Locator safely from %s', async (file) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sfnext-login-trim-'));
        fixtureRoots.push(root);
        const config = {
            extensions: {
                SFDC_EXT_STORE_LOCATOR: { folder: 'store-locator' },
                SFDC_EXT_BOPIS: { folder: 'bopis' },
                SFDC_EXT_RATINGS_REVIEWS: { folder: 'ratings-reviews' },
                SFDC_EXT_SHIPPING_DELIVERY: { folder: 'shipping-delivery' },
                SFDC_EXT_PRODUCT_CONTENT: { folder: 'product-content' },
            },
        };
        fs.mkdirSync(path.join(root, 'src/extensions'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src/extensions/config.json'), JSON.stringify(config));
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.copyFileSync(path.join(templateRoot, file), path.join(root, file));

        await trimExtensions(
            root,
            {
                SFDC_EXT_STORE_LOCATOR: false,
                SFDC_EXT_BOPIS: false,
                SFDC_EXT_RATINGS_REVIEWS: true,
                SFDC_EXT_SHIPPING_DELIVERY: true,
                SFDC_EXT_PRODUCT_CONTENT: true,
            },
            config as never
        );

        const source = fs.readFileSync(path.join(root, file), 'utf8');
        expectValidTypeScriptJsx(source);
        expect(source).not.toContain('resolveSelectedStore');
        expect(source).not.toContain('promoteGuestSelectedStore');
        expect(source).not.toContain('updateSelectedStore');
        expect(source).not.toContain('@/extensions/store-locator');
        if (file.endsWith('/_app.p.$.tsx')) {
            expect(source).toMatch(/export\s+async\s+function\s+loader\b/);
            expect(source).toMatch(/fetchProductById\(context,\s*productLookupId,/);
            expect(source).toContain('product = await productPromise');
            expect(source).not.toContain('@/extensions/bopis');
            expect(source).not.toMatch(
                /loadPdpPickupInventory|PdpPickupInventory|PickupInventoryProvider|pickupInventory/
            );
            expect(source).not.toContain('selectionPromise');
        }
        if (file.includes('_empty.logout')) {
            expect(source).toContain('destroyAuthServer(context)');
            expect(source).toContain('destroyBasket(context)');
        }
        if (file.includes('complete-registered-login')) {
            expect(source).toContain('updateAuth(context, response)');
            expect(source).toContain('registeredLoginCompletedContext');
            expect(source).not.toContain('@/extensions/store-locator');
            expect(source).not.toMatch(
                /prepareStoreSelectionForLogin|reconcileStoreAfterAuthentication|sourceHasItems/
            );
        }
    });

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
            path.join(root, 'src/verticals/foundations/routes/_app.p.$.test.tsx'),
            'utf8'
        );
        expectValidTypeScriptJsx(foundationsProductRouteTest);
        expect(foundationsProductRouteTest).toContain(
            '@/extensions/shipping-delivery/context/shipping-delivery-context'
        );
        expect(foundationsProductRouteTest).not.toContain('@/extensions/bopis');
        expect(foundationsProductRouteTest).not.toContain('pickup-context');

        for (const relativeFile of [
            'src/routes/_app.p.$.tsx',
            'src/verticals/cosmetic/routes/_app.p.$.tsx',
            'src/verticals/foundations/routes/_app.p.$.tsx',
            'src/verticals/footwear/routes/_app.p.$.tsx',
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
        expect(fs.existsSync(path.join(root, 'src/verticals/foundations/routes/_app.p.$.test.tsx'))).toBe(false);
        for (const relativeFile of [
            'src/routes/_app.p.$.tsx',
            'src/verticals/cosmetic/routes/_app.p.$.tsx',
            'src/verticals/foundations/routes/_app.p.$.tsx',
            'src/verticals/footwear/routes/_app.p.$.tsx',
        ]) {
            const routeSource = fs.readFileSync(path.join(root, relativeFile), 'utf8');
            expectValidTypeScriptJsx(routeSource);
            expect(routeSource).not.toContain('ShippingDeliveryProvider');
        }
    });
});
