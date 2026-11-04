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
 *
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import fixture from '../../../__fixtures__/audit-result.json';
import type { AuditResult, Recommendation } from '../types';
import type { Evaluation } from '../lib/audit';
import { BundleBreakdown, RECOMMENDATIONS_RULE_ID } from './BundleBreakdown';

type Bundle = NonNullable<AuditResult['bundle']>;
type BundlePage = Bundle['pages'][number];

const base = fixture as unknown as AuditResult;
const pdp: BundlePage = {
    page: 'pdp',
    runId: 'run-1',
    lighthouseArtifact: 'runs/run-1/lhr.json',
    observedLoadMs: 4200,
    live: {
        scripts: 14,
        decodedBytes: 1_520_000,
        transferBytes: 480_000,
        beforeLoad: 11,
        beforeLoadDecodedBytes: 1_300_000,
        beforeLoadTransferBytes: 410_000,
    },
    route: { ids: ['root', 'routes/_app', 'routes/_app.product.$productId'], source: 'url' },
    local: {
        chunks: 9,
        bytes: 1_180_000,
        largest: [
            {
                file: 'assets/entry.client-a1b2.js',
                bytes: 410_000,
                owners: [
                    { name: 'react-dom', bytes: 180_000 },
                    { name: 'react-router', bytes: 90_000 },
                ],
            },
            { file: 'assets/product-c3d4.js', bytes: 205_000, owners: [{ name: 'src/components', bytes: 120_000 }] },
        ],
        packages: [
            {
                name: 'react-dom',
                kind: 'npm',
                bytes: 180_000,
                modules: 3,
                largestModules: [],
                importers: [],
                importerCount: 0,
            },
            {
                name: 'zod',
                kind: 'npm',
                bytes: 96_000,
                modules: 40,
                largestModules: [],
                versions: ['3.23.8', '4.1.0'],
                importers: [{ file: 'src/lib/schema.ts', line: 1 }],
                importerCount: 1,
                deferrableBytes: 96_000,
            },
            {
                name: 'src/components',
                kind: 'project',
                bytes: 120_000,
                modules: 30,
                largestModules: [],
                importers: [],
                importerCount: 0,
            },
            {
                name: '(bundler)',
                kind: 'build',
                bytes: 4_000,
                modules: 1,
                largestModules: [],
                importers: [],
                importerCount: 0,
            },
        ],
        candidates: [
            {
                importer: {
                    file: 'src/components/store-locator.tsx',
                    line: 4,
                    excerpt: "import { MapView } from 'maplibre-gl';",
                },
                target: 'maplibre-gl',
                package: 'maplibre-gl',
                savedBytes: 210_000,
                savedModules: 12,
                lazyElsewhere: ['src/routes/_app.stores.tsx'],
            },
            {
                importer: { file: 'src/lib/schema.ts' },
                target: 'zod',
                package: 'zod',
                savedBytes: 96_000,
                savedModules: 40,
            },
        ],
    },
};
const bundle: Bundle = {
    schemaVersion: 2,
    status: 'complete',
    notes: [],
    build: {
        packageManager: 'pnpm',
        durationMs: { analyze: 41_000, plain: 33_000 },
        visualizer: 'bundle/client-bundle-size.html',
        chunks: 40,
        withMaps: 40,
        bytes: 2_400_000,
        attribution: {
            modules: 2_300_000,
            unmappedModules: 40_000,
            preloadLists: 20_000,
            routerManifest: 30_000,
            glue: 10_000,
        },
    },
    pages: [pdp, { ...pdp, page: 'plp', route: null, local: null }],
    skipped: [{ page: 'home', reason: 'Lighthouse recorded no first-party scripts for this page.' }],
};
const recommendation: Recommendation = {
    pages: ['pdp'],
    title: 'Load the store locator map when its dialog opens',
    change: 'lazy-component',
    trigger: 'interaction',
    target: 'maplibre-gl',
    how: 'Wrap `StoreLocator` in `React.lazy` and render it inside the dialog.',
    files: [
        { file: 'src/components/store-locator.tsx', line: 4 },
        { file: 'src/components/header.tsx', line: 88 },
    ],
    savings: [{ page: 'pdp', bytes: 210_000, upTo: true }],
};
const reviewed = (extra: Partial<Evaluation>): Evaluation => ({
    ruleId: RECOMMENDATIONS_RULE_ID,
    disposition: 'finding',
    title: 'Reduce JavaScript on load',
    severity: 'medium',
    summary: 'Two imports can load later.',
    evidence: [{ type: 'source', file: 'src/components/store-locator.tsx', line: 4 }],
    ...extra,
});
const withBundle = (value: Bundle | undefined, evaluations: Evaluation[] = []): AuditResult => ({
    ...base,
    bundle: value,
    evaluations: [...base.evaluations, ...evaluations],
});
const section = (name: string) =>
    screen.getByRole('heading', { name: new RegExp(`^${name}`) }).closest('section') as HTMLElement;

describe('BundleBreakdown', () => {
    it('shows what the live site downloaded against the budget', () => {
        render(<BundleBreakdown result={withBundle(bundle)} label="pdp" />);
        const live = section('Measured on the live site');
        expect(within(live).getByText('1.52 MB')).toBeTruthy();
        expect(within(live).getByText('budget 1.40 MB, uncompressed')).toBeTruthy();
        expect(within(live).getByText('469 KB')).toBeTruthy();
        expect(within(live).getByText('14')).toBeTruthy();
        expect(within(live).getByText('11 before the load event')).toBeTruthy();
    });

    it('breaks the local build down by owner, chunk and costly import', () => {
        render(<BundleBreakdown result={withBundle(bundle)} label="pdp" />);
        const local = section('Local build analysis');
        expect(
            within(local)
                .getByRole('link', { name: /Open bundle visualizer/ })
                .getAttribute('href')
        ).toBe('/api/bundle/visualizer');
        expect(within(local).getByText('routes/_app.product.$productId')).toBeTruthy();
        expect(within(local).getByText(/found from its URL\./)).toBeTruthy();
        expect(within(local).getByText('1.18 MB')).toBeTruthy();
        expect(within(local).getByText('9')).toBeTruthy();

        const owners = section("What it's made of");
        expect(within(owners).getByText('package · 2 versions bundled')).toBeTruthy();
        expect(within(owners).getByText('project code')).toBeTruthy();
        expect(within(owners).getByText('added by the bundler')).toBeTruthy();
        const chunks = section('Largest chunks');
        expect(within(chunks).getByText('react-dom, react-router')).toBeTruthy();

        const imports = section('Imports that pull in the most code');
        expect(within(imports).getByText('src/components/store-locator.tsx:4')).toBeTruthy();
        expect(within(imports).getByText('src/routes/_app.stores.tsx')).toBeTruthy();
        expect(within(imports).getByText('src/lib/schema.ts')).toBeTruthy();
        expect(within(imports).getAllByText(/already loaded lazily/)).toHaveLength(1);
    });

    it('lists the AI recommendations for the page with their measured savings', () => {
        render(
            <BundleBreakdown
                result={withBundle(bundle, [reviewed({ recommendations: [recommendation] })])}
                label="pdp"
            />
        );
        const recommendations = section('Recommendations');
        expect(within(recommendations).getByText(recommendation.title)).toBeTruthy();
        expect(
            within(recommendations).getByText(/Load the component later on interaction · up to 205 KB less up front ·/)
        ).toBeTruthy();
        expect(within(recommendations).getByText('React.lazy').tagName).toBe('CODE');
        // The import statement shows under the file entry for its own line only.
        expect(within(recommendations).getAllByText("import { MapView } from 'maplibre-gl';")).toHaveLength(1);
        expect(within(recommendations).getByText('src/components/header.tsx:88')).toBeTruthy();
    });

    it('describes recommendations without a trigger or a measured saving', () => {
        const replace: Recommendation = {
            pages: ['pdp', 'plp'],
            title: 'Validate with a smaller schema library',
            change: 'replace',
            target: 'zod',
            how: 'Swap zod for valibot.',
            files: [{ file: 'src/lib/schema.ts' }],
        };
        render(<BundleBreakdown result={withBundle(bundle, [reviewed({ recommendations: [replace] })])} label="pdp" />);
        expect(screen.getByText(/^Replace it ·/)).toBeTruthy();
        expect(screen.queryByText(/less up front/)).toBeNull();
    });

    it('explains an empty recommendations list', () => {
        const { rerender } = render(<BundleBreakdown result={withBundle(bundle)} label="pdp" />);
        expect(screen.getByText('This run has no AI review of the local build.')).toBeTruthy();

        rerender(
            <BundleBreakdown
                result={withBundle(bundle, [reviewed({ disposition: 'not-verified', summary: 'The build failed.' })])}
                label="pdp"
            />
        );
        expect(screen.getByText('The build failed.')).toBeTruthy();

        rerender(
            <BundleBreakdown
                result={withBundle(bundle, [reviewed({ recommendations: [recommendation] })])}
                label="plp"
            />
        );
        expect(screen.getByText('The AI made no recommendations for this page.')).toBeTruthy();
    });

    it('explains a page the local build could not be matched to', () => {
        const { rerender } = render(<BundleBreakdown result={withBundle(bundle)} label="plp" />);
        expect(
            screen.getByText("This page's route wasn't found in the local build, so there is no local analysis for it.")
        ).toBeTruthy();
        expect(screen.queryByText(/matched to the build by its route/)).toBeNull();

        rerender(
            <BundleBreakdown
                result={withBundle({ ...bundle, status: 'unavailable', build: null, notes: ['pnpm install failed.'] })}
                label="plp"
            />
        );
        expect(screen.getByText(/The project wasn't built/)).toBeTruthy();
        expect(screen.getByText('The local build analysis is incomplete.')).toBeTruthy();
        expect(screen.getByText('pnpm install failed.')).toBeTruthy();
        expect(screen.queryByRole('link', { name: /Open bundle visualizer/ })).toBeNull();
    });

    it('needs the module graph to trace imports', () => {
        const noGraph: Bundle = {
            ...bundle,
            status: 'partial',
            notes: ['The build wrote no module graph.'],
            pages: [{ ...pdp, live: { ...pdp.live, beforeLoad: 14 }, route: { ids: ['root'], source: 'page' } }],
        };
        const { rerender } = render(<BundleBreakdown result={withBundle(noGraph)} label="pdp" />);
        expect(screen.getByText(/Tracing imports needs the build/)).toBeTruthy();
        expect(screen.getByText('all before the load event')).toBeTruthy();
        expect(screen.getByText(/matched to the build by its route/).textContent).toMatch(/root\.$/);

        const notes = { ...bundle, notes: ['Source maps were missing for 2 chunks.'] };
        const local = pdp.local as NonNullable<typeof pdp.local>;
        const quiet: Bundle = { ...notes, pages: [{ ...pdp, local: { ...local, candidates: [] } }] };
        rerender(<BundleBreakdown result={withBundle(quiet)} label="pdp" />);
        expect(screen.getByText('No single import in the project pulls 10 KB or more into this page.')).toBeTruthy();
        expect(screen.getByText('Source maps were missing for 2 chunks.')).toBeTruthy();
        expect(screen.queryByText('The local build analysis is incomplete.')).toBeNull();
    });

    it('says why a page has no bundle analysis', () => {
        const { rerender } = render(<BundleBreakdown result={withBundle(bundle)} label="home" />);
        expect(screen.getByText('Lighthouse recorded no first-party scripts for this page.')).toBeTruthy();

        rerender(<BundleBreakdown result={withBundle(bundle)} label="cart" />);
        expect(screen.getByText("The run's bundle analysis doesn't include this page.")).toBeTruthy();

        rerender(<BundleBreakdown result={withBundle(undefined)} label="pdp" />);
        expect(screen.getByText(/This run has no bundle analysis/)).toBeTruthy();

        const older = { ...bundle, schemaVersion: 1 } as unknown as Bundle;
        rerender(<BundleBreakdown result={withBundle(older)} label="pdp" />);
        expect(screen.getByText(/from an earlier version of the audit/)).toBeTruthy();
    });
});
