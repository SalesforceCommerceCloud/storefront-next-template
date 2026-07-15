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
import { RootComponentProvider, RootComponentResetProvider, useIsRootComponent } from './RootComponentContext';

function Probe() {
    return <span data-testid="probe">{String(useIsRootComponent())}</span>;
}

describe('RootComponentContext', () => {
    afterEach(() => {
        cleanup();
    });

    it('defaults to false with no provider', () => {
        render(<Probe />);
        expect(screen.getByTestId('probe').textContent).toBe('false');
    });

    it('is true within a RootComponentProvider', () => {
        render(
            <RootComponentProvider>
                <Probe />
            </RootComponentProvider>
        );
        expect(screen.getByTestId('probe').textContent).toBe('true');
    });

    it('is false again below a RootComponentResetProvider (non-propagation)', () => {
        render(
            <RootComponentProvider>
                <RootComponentResetProvider>
                    <Probe />
                </RootComponentResetProvider>
            </RootComponentProvider>
        );
        expect(screen.getByTestId('probe').textContent).toBe('false');
    });
});
