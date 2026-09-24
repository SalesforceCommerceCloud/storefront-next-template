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

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { useContext, useEffect } from 'react';
import CollapsibleSection from '.';
import { CollapsibleLoadingContext } from './collapsible-loading-context';

/** Click the summary and wait for all React effects to flush. */
const clickSummary = (container: HTMLElement): Promise<void> =>
    act(async () => {
        fireEvent.click(container.querySelector('summary') as HTMLElement);
        await Promise.resolve();
    });

describe('CollapsibleSection', () => {
    describe('label', () => {
        test('renders the label text in the summary', () => {
            render(<CollapsibleSection label="Description:">content</CollapsibleSection>);

            expect(screen.getByText('Description:')).toBeInTheDocument();
        });
    });

    describe('children — lazy mounting', () => {
        test('does not render children when closed by default', () => {
            render(
                <CollapsibleSection label="Section">
                    <p>Child content here</p>
                </CollapsibleSection>
            );

            expect(screen.queryByText('Child content here')).not.toBeInTheDocument();
        });

        test('renders children immediately when defaultOpen is true', () => {
            render(
                <CollapsibleSection label="Section" defaultOpen>
                    <p>Child content here</p>
                </CollapsibleSection>
            );

            expect(screen.getByText('Child content here')).toBeInTheDocument();
        });

        test('mounts children on click and keeps them mounted after closing', async () => {
            const { container } = render(
                <CollapsibleSection label="Section">
                    <p>Child content here</p>
                </CollapsibleSection>
            );

            expect(screen.queryByText('Child content here')).not.toBeInTheDocument();

            // Click to open — synchronous children appear once effects flush
            await clickSummary(container);

            expect(screen.getByText('Child content here')).toBeInTheDocument();

            // Click to close — children stay mounted (lazy-mount preserved)
            await clickSummary(container);

            expect(screen.getByText('Child content here')).toBeInTheDocument();
        });
    });

    describe('open / close behaviour', () => {
        test('is closed by default when defaultOpen is not provided', () => {
            const { container } = render(<CollapsibleSection label="Section">content</CollapsibleSection>);

            expect(container.querySelector('details')).not.toHaveAttribute('open');
        });

        test('is closed when defaultOpen is false', () => {
            const { container } = render(
                <CollapsibleSection label="Section" defaultOpen={false}>
                    content
                </CollapsibleSection>
            );

            expect(container.querySelector('details')).not.toHaveAttribute('open');
        });

        test('is open when defaultOpen is true', () => {
            const { container } = render(
                <CollapsibleSection label="Section" defaultOpen>
                    content
                </CollapsibleSection>
            );

            expect(container.querySelector('details')).toHaveAttribute('open');
        });

        test('opens on click when there is no loading child', async () => {
            const { container } = render(<CollapsibleSection label="Section">content</CollapsibleSection>);

            await clickSummary(container);

            expect(container.querySelector('details')).toHaveAttribute('open');
        });

        test('closes on second click', async () => {
            const { container } = render(<CollapsibleSection label="Section">content</CollapsibleSection>);

            await clickSummary(container);
            expect(container.querySelector('details')).toHaveAttribute('open');

            await clickSummary(container);
            expect(container.querySelector('details')).not.toHaveAttribute('open');
        });
    });

    describe('className', () => {
        test('applies the group class by default', () => {
            const { container } = render(<CollapsibleSection label="Section">content</CollapsibleSection>);

            expect(container.querySelector('details')).toHaveClass('group');
        });

        test('merges custom className with the group class', () => {
            const { container } = render(
                <CollapsibleSection label="Section" className="mt-6 custom-class">
                    content
                </CollapsibleSection>
            );

            const details = container.querySelector('details');
            expect(details).toHaveClass('group');
            expect(details).toHaveClass('mt-6');
            expect(details).toHaveClass('custom-class');
        });
    });

    describe('chevron icon', () => {
        test('renders a chevron icon inside the summary when idle', () => {
            const { container } = render(<CollapsibleSection label="Section">content</CollapsibleSection>);

            expect(container.querySelector('summary svg')).toBeInTheDocument();
            expect(container.querySelector('summary [class*="animate-spin"]')).not.toBeInTheDocument();
        });
    });

    describe('loading state via CollapsibleLoadingContext', () => {
        // Children's effects run before parent effects, so setLoading(true) in
        // this child is always visible to CollapsibleSection's useEffect.
        function LoadTrigger({ loading }: { loading: boolean }) {
            const ctx = useContext(CollapsibleLoadingContext);
            useEffect(() => {
                ctx?.setLoading(loading);
                return () => ctx?.setLoading(false);
            }, [ctx, loading]);
            return null;
        }

        test('shows spinner and defers open when child is loading', async () => {
            const { container } = render(
                <CollapsibleSection label="Section">
                    <LoadTrigger loading={true} />
                </CollapsibleSection>
            );

            await clickSummary(container);

            // Spinner visible, chevron hidden, section still closed
            expect(container.querySelector('summary [class*="animate-spin"]')).toBeInTheDocument();
            expect(container.querySelector('summary svg')).not.toBeInTheDocument();
            expect(container.querySelector('details')).not.toHaveAttribute('open');
        });

        test('opens and restores chevron once loading completes', async () => {
            const { container, rerender } = render(
                <CollapsibleSection label="Section">
                    <LoadTrigger loading={true} />
                </CollapsibleSection>
            );

            await clickSummary(container);

            // Swap loading child for a non-loading one to simulate fetch completion
            await act(async () => {
                rerender(
                    <CollapsibleSection label="Section">
                        <LoadTrigger loading={false} />
                    </CollapsibleSection>
                );
                await Promise.resolve();
            });

            await waitFor(() => {
                expect(container.querySelector('details')).toHaveAttribute('open');
            });
            expect(container.querySelector('summary svg')).toBeInTheDocument();
            expect(container.querySelector('summary [class*="animate-spin"]')).not.toBeInTheDocument();
        });
    });

    describe('forceOpen + hideToggle — static (non-interactive) mode', () => {
        test('renders a plain header with no <details>/<summary> disclosure control', () => {
            const { container } = render(
                <CollapsibleSection label="Movement" forceOpen hideToggle>
                    <p>Spec content</p>
                </CollapsibleSection>
            );

            // A permanently-open section has nothing to toggle, so it must not expose a focusable
            // disclosure control that does nothing on Enter/Space.
            expect(container.querySelector('details')).not.toBeInTheDocument();
            expect(container.querySelector('summary')).not.toBeInTheDocument();

            // The label renders as static text and the content is always visible.
            expect(container.querySelector('[data-slot="collapsible-heading"]')?.textContent).toBe('Movement');
            expect(screen.getByText('Spec content')).toBeInTheDocument();
        });

        test('renders footer content in static mode', () => {
            render(
                <CollapsibleSection label="Case" forceOpen hideToggle footer={<span>Footer note</span>}>
                    <p>Body</p>
                </CollapsibleSection>
            );

            expect(screen.getByText('Footer note')).toBeInTheDocument();
        });
    });
});
