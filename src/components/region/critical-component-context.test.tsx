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
import { describe, expect, test } from 'vitest';
import { CriticalComponentProvider, useIsCriticalComponent } from './critical-component-context';

function Probe({ id }: { id: string }) {
    return <span data-testid={id}>{String(useIsCriticalComponent(id))}</span>;
}

describe('CriticalComponentContext', () => {
    test('marks only component IDs supplied by the current page', () => {
        render(
            <CriticalComponentProvider value={['critical']}>
                <Probe id="critical" />
                <Probe id="non-critical" />
            </CriticalComponentProvider>
        );

        expect(screen.getByTestId('critical')).toHaveTextContent('true');
        expect(screen.getByTestId('non-critical')).toHaveTextContent('false');
    });

    test('defaults to non-critical outside a provider', () => {
        render(<Probe id="component" />);
        expect(screen.getByTestId('component')).toHaveTextContent('false');
    });
});
