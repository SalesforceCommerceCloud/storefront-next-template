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
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import {
    ComponentHydrationMarker,
    CriticalRegionProvider,
    useIsInCriticalRegion,
    useWasServerRendered,
} from './critical-component-context';

function Probe() {
    return (
        <span data-testid="critical-region" data-server-rendered={String(useWasServerRendered('probe'))}>
            {String(useIsInCriticalRegion())}
        </span>
    );
}

describe('CriticalRegionContext', () => {
    test('marks descendants of a critical region', () => {
        render(
            <CriticalRegionProvider>
                <Probe />
            </CriticalRegionProvider>
        );

        expect(screen.getByTestId('critical-region')).toHaveTextContent('true');
        expect(screen.getByTestId('critical-region')).toHaveAttribute('data-server-rendered', 'false');
    });

    test('marks an actual server render', () => {
        vi.stubEnv('SSR', true);
        let html: string;
        try {
            html = renderToString(
                <CriticalRegionProvider>
                    <Probe />
                </CriticalRegionProvider>
            );
        } finally {
            vi.unstubAllEnvs();
        }

        expect(html).toContain('data-server-rendered="true"');
    });

    test.each([
        ['inside', true],
        ['outside', false],
    ])('recognizes an SSR instance marker by its ID %s a critical region', (_, critical) => {
        const marker = document.createElement('template');
        marker.id = 'pdc-probe';
        document.body.append(marker);

        render(
            critical ? (
                <CriticalRegionProvider>
                    <Probe />
                </CriticalRegionProvider>
            ) : (
                <Probe />
            )
        );

        expect(screen.getByTestId('critical-region')).toHaveAttribute('data-server-rendered', 'true');
        marker.remove();
    });

    test('serializes the exact component instance and type', () => {
        const { container } = render(<ComponentHydrationMarker componentId="hero-1" componentTypeId="Content.hero" />);

        const marker = container.querySelector<HTMLElement>('[data-pdct]');
        expect(marker?.id).toBe('pdc-hero-1');
        expect(marker?.dataset.pdct).toBe('Content.hero');
    });

    test('defaults to non-critical outside a provider', () => {
        render(<Probe />);
        expect(screen.getByTestId('critical-region')).toHaveTextContent('false');
    });
});
