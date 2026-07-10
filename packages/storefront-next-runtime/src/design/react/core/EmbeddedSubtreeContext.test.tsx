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
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { EmbeddedSubtreeProvider, useIsWithinEmbeddedSubtree } from './EmbeddedSubtreeContext';

function Probe() {
    return <span data-testid="probe">{String(useIsWithinEmbeddedSubtree())}</span>;
}

describe('EmbeddedSubtreeContext', () => {
    afterEach(() => {
        cleanup();
    });

    it('defaults to false with no provider', () => {
        render(<Probe />);
        expect(screen.getByTestId('probe').textContent).toBe('false');
    });

    it('is false when the nearest provider is told the subtree is not embedded', () => {
        render(
            <EmbeddedSubtreeProvider embedded={false}>
                <Probe />
            </EmbeddedSubtreeProvider>
        );
        expect(screen.getByTestId('probe').textContent).toBe('false');
    });

    it('is true within a provider told the subtree is embedded', () => {
        render(
            <EmbeddedSubtreeProvider embedded={true}>
                <Probe />
            </EmbeddedSubtreeProvider>
        );
        expect(screen.getByTestId('probe').textContent).toBe('true');
    });

    it('stays true in a nested provider that passes embedded={false}', () => {
        render(
            <EmbeddedSubtreeProvider embedded={true}>
                <EmbeddedSubtreeProvider embedded={false}>
                    <Probe />
                </EmbeddedSubtreeProvider>
            </EmbeddedSubtreeProvider>
        );
        expect(screen.getByTestId('probe').textContent).toBe('true');
    });
});
