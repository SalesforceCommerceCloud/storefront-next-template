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
import { describe, test, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { SwatchGroup } from './swatch-group';
import { Swatch } from './swatch';

// Mock child swatch components for testing
const MockSwatch = ({ value, children, ...props }: { value: string; children: React.ReactNode }) => (
    <button data-testid={`swatch-${value}`} value={value} {...props}>
        {children}
    </button>
);

// Helper to render within a memory router with all providers
const renderInRouter = (element: React.ReactElement, opts?: { initialEntries?: string[] }) => {
    const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{element}</AllProvidersWrapper> }], {
        initialEntries: opts?.initialEntries ?? ['/'],
    });
    return render(<RouterProvider router={router} />);
};

describe('SwatchGroup', () => {
    test('renders with label and display name', () => {
        render(
            <SwatchGroup label="Color" displayName="Navy Blue">
                <MockSwatch value="navy">Navy</MockSwatch>
                <MockSwatch value="black">Black</MockSwatch>
            </SwatchGroup>
        );

        expect(screen.getByText('Color:')).toBeInTheDocument();
        expect(screen.getByText('Navy Blue')).toBeInTheDocument();
    });

    test('handles empty children gracefully', () => {
        render(<SwatchGroup label="Color">{null}</SwatchGroup>);

        expect(screen.getByText('Color:')).toBeInTheDocument();
        expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    test('renders with proper radiogroup accessibility attributes', () => {
        render(
            <SwatchGroup label="Color">
                <MockSwatch value="red">Red</MockSwatch>
                <MockSwatch value="blue">Blue</MockSwatch>
            </SwatchGroup>
        );

        const radioGroup = screen.getByRole('radiogroup');
        expect(radioGroup).toHaveAttribute('aria-labelledby');
    });

    test('links radiogroup to visible label via aria-labelledby', () => {
        render(
            <SwatchGroup label="Size">
                <MockSwatch value="small">S</MockSwatch>
                <MockSwatch value="large">L</MockSwatch>
            </SwatchGroup>
        );

        const radioGroup = screen.getByRole('radiogroup');
        const labelledById = radioGroup.getAttribute('aria-labelledby');
        expect(labelledById).toBeTruthy();
        if (labelledById) {
            const labelElement = document.getElementById(labelledById);
            expect(labelElement).toBeInTheDocument();
            expect(labelElement).toHaveTextContent('Size:');
        }
    });

    test('calls handleChange when selection changes', async () => {
        const user = userEvent.setup();
        const handleChange = vi.fn();

        render(
            <SwatchGroup label="Color" handleChange={handleChange}>
                <Swatch value="red" mode="click">
                    Red
                </Swatch>
                <Swatch value="blue" mode="click">
                    Blue
                </Swatch>
            </SwatchGroup>
        );

        const redSwatch = screen.getByRole('radio', { name: /red/i });
        await user.click(redSwatch);

        expect(handleChange).toHaveBeenCalledWith('red');
    });

    test('handles keyboard navigation with arrow keys', async () => {
        const user = userEvent.setup();

        renderInRouter(
            <SwatchGroup label="Size">
                <Swatch value="small" href="/small">
                    Small
                </Swatch>
                <Swatch value="medium" href="/medium">
                    Medium
                </Swatch>
                <Swatch value="large" href="/large">
                    Large
                </Swatch>
            </SwatchGroup>
        );

        const swatches = screen.getAllByRole('radio');

        // Focus first swatch
        swatches[0].focus();

        // Arrow right should move to next swatch
        await user.keyboard('{ArrowRight}');
        expect(swatches[1]).toHaveFocus();

        // Arrow left should move to previous swatch
        await user.keyboard('{ArrowLeft}');
        expect(swatches[0]).toHaveFocus();

        // Arrow down should move to next swatch
        await user.keyboard('{ArrowDown}');
        expect(swatches[1]).toHaveFocus();

        // Arrow up should move to previous swatch
        await user.keyboard('{ArrowUp}');
        expect(swatches[0]).toHaveFocus();
    });

    test('wraps keyboard navigation at boundaries', async () => {
        const user = userEvent.setup();

        renderInRouter(
            <SwatchGroup label="Size">
                <Swatch value="small" href="/small">
                    Small
                </Swatch>
                <Swatch value="large" href="/large">
                    Large
                </Swatch>
            </SwatchGroup>
        );

        const swatches = screen.getAllByRole('radio');

        // Focus last swatch
        swatches[1].focus();

        // Arrow right should wrap to first swatch
        await user.keyboard('{ArrowRight}');
        await waitFor(() => {
            expect(swatches[0]).toHaveFocus();
        });

        // Arrow left should wrap to last swatch
        await user.keyboard('{ArrowLeft}');
        expect(swatches[1]).toHaveFocus();
    });

    test('sets correct selected state based on value prop', () => {
        renderInRouter(
            <SwatchGroup label="Color" value="blue">
                <Swatch value="red" href="/red">
                    Red
                </Swatch>
                <Swatch value="blue" href="/blue">
                    Blue
                </Swatch>
                <Swatch value="green" href="/green">
                    Green
                </Swatch>
            </SwatchGroup>
        );

        const redSwatch = screen.getByRole('radio', { name: /red/i });
        const blueSwatch = screen.getByRole('radio', { name: /blue/i });
        const greenSwatch = screen.getByRole('radio', { name: /green/i });

        expect(redSwatch).not.toBeChecked();
        expect(blueSwatch).toBeChecked();
        expect(greenSwatch).not.toBeChecked();
    });

    test('sets correct focusable state - selected item is focusable', () => {
        renderInRouter(
            <SwatchGroup label="Color" value="blue">
                <Swatch value="red" href="/red">
                    Red
                </Swatch>
                <Swatch value="blue" href="/blue">
                    Blue
                </Swatch>
                <Swatch value="green" href="/green">
                    Green
                </Swatch>
            </SwatchGroup>
        );

        const redSwatch = screen.getByRole('radio', { name: /red/i });
        const blueSwatch = screen.getByRole('radio', { name: /blue/i });
        const greenSwatch = screen.getByRole('radio', { name: /green/i });

        expect(redSwatch).toHaveAttribute('tabIndex', '-1');
        expect(blueSwatch).toHaveAttribute('tabIndex', '0');
        expect(greenSwatch).toHaveAttribute('tabIndex', '-1');
    });

    test('sets first item as focusable when no value selected', () => {
        renderInRouter(
            <SwatchGroup label="Color">
                <Swatch value="red" href="/red">
                    Red
                </Swatch>
                <Swatch value="blue" href="/blue">
                    Blue
                </Swatch>
                <Swatch value="green" href="/green">
                    Green
                </Swatch>
            </SwatchGroup>
        );

        const redSwatch = screen.getByRole('radio', { name: /red/i });
        const blueSwatch = screen.getByRole('radio', { name: /blue/i });
        const greenSwatch = screen.getByRole('radio', { name: /green/i });

        expect(redSwatch).toHaveAttribute('tabIndex', '0');
        expect(blueSwatch).toHaveAttribute('tabIndex', '-1');
        expect(greenSwatch).toHaveAttribute('tabIndex', '-1');
    });

    test('applies custom className when provided', () => {
        renderInRouter(
            <SwatchGroup label="Color" className="custom-swatch-group">
                <Swatch value="red" href="/red">
                    Red
                </Swatch>
            </SwatchGroup>
        );

        const container = screen.getByRole('radiogroup').parentElement;
        expect(container).toHaveClass('custom-swatch-group');
    });

    test('does not render label when not provided', () => {
        renderInRouter(
            <SwatchGroup>
                <Swatch value="red" href="/red">
                    Red
                </Swatch>
            </SwatchGroup>
        );

        expect(screen.queryByText(/:/)).not.toBeInTheDocument();
    });

    test('updates selected index when value prop changes', () => {
        renderInRouter(
            <SwatchGroup label="Color" value="red">
                <Swatch value="red" href="/red">
                    Red
                </Swatch>
                <Swatch value="blue" href="/blue">
                    Blue
                </Swatch>
            </SwatchGroup>
        );

        let redSwatch = screen.getByRole('radio', { name: /red/i });
        let blueSwatch = screen.getByRole('radio', { name: /blue/i });

        expect(redSwatch).toBeChecked();
        expect(blueSwatch).not.toBeChecked();

        // Update value prop by re-rendering with new value
        cleanup();
        renderInRouter(
            <SwatchGroup label="Color" value="blue">
                <Swatch value="red" href="/red">
                    Red
                </Swatch>
                <Swatch value="blue" href="/blue">
                    Blue
                </Swatch>
            </SwatchGroup>
        );

        redSwatch = screen.getByRole('radio', { name: /red/i });
        blueSwatch = screen.getByRole('radio', { name: /blue/i });

        expect(redSwatch).not.toBeChecked();
        expect(blueSwatch).toBeChecked();
    });
});
