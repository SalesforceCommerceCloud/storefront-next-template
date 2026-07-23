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
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Components
import QuantityPicker from './quantity-picker';

// Mock the useQuantityPicker hook
vi.mock('@/hooks/use-quantity-picker', () => ({
    useQuantityPicker: vi.fn(),
}));

const mockUseQuantityPicker = vi.mocked(await import('@/hooks/use-quantity-picker')).useQuantityPicker;

const defaultProps = {
    value: '2',
    onChange: vi.fn(),
    min: 0,
    productName: 'Test Product',
};

describe('QuantityPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock implementation
        mockUseQuantityPicker.mockReturnValue({
            inputValue: '2',
            inputRef: { current: null },
            isDecrementDisabled: false,
            isIncrementDisabled: false,
            isFocused: false,
            handleIncrement: vi.fn(),
            handleDecrement: vi.fn(),
            handleInputChange: vi.fn(),
            handleInputFocus: vi.fn(),
            handleInputBlur: vi.fn(),
            handleKeyDown: vi.fn(),
        });
    });

    describe('Basic Rendering', () => {
        test('should render quantity picker with all elements', () => {
            render(<QuantityPicker {...defaultProps} />);

            expect(screen.getByTestId('quantity-decrement')).toBeInTheDocument();
            expect(screen.getByTestId('quantity-increment')).toBeInTheDocument();
            expect(screen.getByDisplayValue('2')).toBeInTheDocument();
        });

        test('should pass correct props to useQuantityPicker hook', () => {
            render(<QuantityPicker {...defaultProps} />);

            expect(mockUseQuantityPicker).toHaveBeenCalledWith({
                value: '2',
                onChange: defaultProps.onChange,
                onBlur: undefined,
                min: 0,
            });
        });

        test('should pass onBlur when provided', () => {
            const onBlur = vi.fn();
            render(<QuantityPicker {...defaultProps} onBlur={onBlur} />);

            expect(mockUseQuantityPicker).toHaveBeenCalledWith({
                value: '2',
                onChange: defaultProps.onChange,
                onBlur,
                min: 0,
            });
        });

        test('should use default min value when not provided', () => {
            render(<QuantityPicker value="2" onChange={vi.fn()} />);

            expect(mockUseQuantityPicker).toHaveBeenCalledWith({
                value: '2',
                onChange: expect.any(Function),
                onBlur: undefined,
                min: 0,
            });
        });
    });

    describe('Button Functionality', () => {
        test('should call handleDecrement when decrement button is clicked', async () => {
            const mockHandleDecrement = vi.fn();
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '2',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: mockHandleDecrement,
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker {...defaultProps} />);

            await userEvent.click(screen.getByTestId('quantity-decrement'));
            expect(mockHandleDecrement).toHaveBeenCalledTimes(1);
        });

        test('should call handleIncrement when increment button is clicked', async () => {
            const mockHandleIncrement = vi.fn();
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '2',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: mockHandleIncrement,
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker {...defaultProps} />);

            await userEvent.click(screen.getByTestId('quantity-increment'));
            expect(mockHandleIncrement).toHaveBeenCalledTimes(1);
        });

        test('should disable decrement button when isDecrementDisabled is true', () => {
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '2',
                inputRef: { current: null },
                isDecrementDisabled: true,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker {...defaultProps} />);

            const decrementButton = screen.getByTestId('quantity-decrement');
            expect(decrementButton).toBeDisabled();
        });

        test('should not disable increment button', () => {
            render(<QuantityPicker {...defaultProps} />);

            const incrementButton = screen.getByTestId('quantity-increment');
            expect(incrementButton).not.toBeDisabled();
        });
    });

    describe('Input Functionality', () => {
        test('should display input value from hook', () => {
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '5',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker {...defaultProps} />);

            expect(screen.getByDisplayValue('5')).toBeInTheDocument();
        });

        test('should call handleInputChange when input value changes', async () => {
            const mockHandleInputChange = vi.fn();
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '2',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: mockHandleInputChange,
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker {...defaultProps} />);

            const input = screen.getByDisplayValue('2');
            await userEvent.type(input, '3');

            expect(mockHandleInputChange).toHaveBeenCalled();
        });

        test('should call handleInputFocus when input is focused', async () => {
            const mockHandleInputFocus = vi.fn();
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '2',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: mockHandleInputFocus,
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker {...defaultProps} />);

            const input = screen.getByDisplayValue('2');
            await userEvent.click(input);

            expect(mockHandleInputFocus).toHaveBeenCalled();
        });

        test('should call handleInputBlur when input loses focus', async () => {
            const mockHandleInputBlur = vi.fn();
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '2',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: mockHandleInputBlur,
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker {...defaultProps} />);

            const input = screen.getByDisplayValue('2');
            await userEvent.click(input);
            await userEvent.tab();

            expect(mockHandleInputBlur).toHaveBeenCalled();
        });

        test('should call handleKeyDown when key is pressed', async () => {
            const mockHandleKeyDown = vi.fn();
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '2',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: mockHandleKeyDown,
            });

            render(<QuantityPicker {...defaultProps} />);

            const input = screen.getByDisplayValue('2');
            await userEvent.type(input, '{enter}');

            expect(mockHandleKeyDown).toHaveBeenCalled();
        });
    });

    describe('Accessibility', () => {
        test('should have correct aria-labels for buttons', () => {
            render(<QuantityPicker {...defaultProps} />);

            const decrementButton = screen.getByTestId('quantity-decrement');
            const incrementButton = screen.getByTestId('quantity-increment');

            expect(decrementButton).toHaveAttribute('aria-label', 'Decrement Quantity for Test Product');
            expect(incrementButton).toHaveAttribute('aria-label', 'Increment Quantity for Test Product');
        });

        test('should use default product name when not provided', () => {
            render(<QuantityPicker value="2" onChange={vi.fn()} />);

            const decrementButton = screen.getByTestId('quantity-decrement');
            const incrementButton = screen.getByTestId('quantity-increment');

            expect(decrementButton).toHaveAttribute('aria-label', 'Decrement Quantity for the product');
            expect(incrementButton).toHaveAttribute('aria-label', 'Increment Quantity for the product');
        });

        test('should have correct aria-label for input', () => {
            render(<QuantityPicker {...defaultProps} />);

            const input = screen.getByDisplayValue('2');
            expect(input).toHaveAttribute('aria-label', 'Quantity');
        });

        test('should have correct input attributes', () => {
            render(<QuantityPicker {...defaultProps} min={1} />);

            const input = screen.getByDisplayValue('2');
            expect(input).toHaveAttribute('type', 'number');
            expect(input).toHaveAttribute('min', '1');
            expect(input).toHaveAttribute('step', '1');
        });
    });

    describe('Button Content', () => {
        test('should display correct symbols in buttons', () => {
            render(<QuantityPicker {...defaultProps} />);

            const decrementButton = screen.getByTestId('quantity-decrement');
            const incrementButton = screen.getByTestId('quantity-increment');

            expect(decrementButton).toHaveTextContent('−');
            expect(incrementButton).toHaveTextContent('+');
        });
    });

    describe('Edge Cases', () => {
        test('should handle string value', () => {
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker value="" onChange={vi.fn()} />);

            expect(screen.getByDisplayValue('')).toBeInTheDocument();
        });

        test('should handle zero value', () => {
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '0',
                inputRef: { current: null },
                isDecrementDisabled: true,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker value="0" onChange={vi.fn()} min={0} />);

            expect(screen.getByDisplayValue('0')).toBeInTheDocument();
            expect(screen.getByTestId('quantity-decrement')).toBeDisabled();
        });

        test('should handle negative min value', () => {
            render(<QuantityPicker value="2" onChange={vi.fn()} min={-5} />);

            expect(mockUseQuantityPicker).toHaveBeenCalledWith({
                value: '2',
                onChange: expect.any(Function),
                onBlur: undefined,
                min: -5,
            });
        });

        test('should handle large values', () => {
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '999999',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker value="999999" onChange={vi.fn()} />);

            expect(screen.getByDisplayValue('999999')).toBeInTheDocument();
        });
    });

    describe('Ref Handling', () => {
        test('should pass inputRef to input element', () => {
            const mockRef = { current: null };
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '2',
                inputRef: mockRef,
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker {...defaultProps} />);

            const input = screen.getByDisplayValue('2');
            expect(input).toBeInTheDocument();
            // Note: We can't directly test ref assignment in jsdom, but we can verify the component renders
        });
    });

    describe('Max Quantity Limit', () => {
        test('should pass max prop to useQuantityPicker hook', () => {
            render(<QuantityPicker {...defaultProps} max={5} />);

            expect(mockUseQuantityPicker).toHaveBeenCalledWith({
                value: '2',
                onChange: defaultProps.onChange,
                onBlur: undefined,
                min: 0,
                max: 5,
            });
        });

        test('should set max attribute on input element', () => {
            render(<QuantityPicker {...defaultProps} max={10} />);

            const input = screen.getByDisplayValue('2');
            expect(input).toHaveAttribute('max', '10');
        });

        test('should disable increment button when max is reached', () => {
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '5',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: true, // Max reached
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker value="5" onChange={vi.fn()} max={5} />);

            const incrementButton = screen.getByTestId('quantity-increment');
            expect(incrementButton).toBeDisabled();
        });

        test('should enable increment button when below max', () => {
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '3',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false, // Below max
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker value="3" onChange={vi.fn()} max={5} />);

            const incrementButton = screen.getByTestId('quantity-increment');
            expect(incrementButton).not.toBeDisabled();
        });

        test('should handle max limit for choice-based bonus products', () => {
            // Simulating a choice-based bonus product with max quantity of 2
            mockUseQuantityPicker.mockReturnValue({
                inputValue: '1',
                inputRef: { current: null },
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });

            render(<QuantityPicker value="1" onChange={vi.fn()} max={2} productName="Bonus Product" />);

            const input = screen.getByDisplayValue('1');
            expect(input).toHaveAttribute('max', '2');
        });

        test('should handle zero max value', () => {
            render(<QuantityPicker {...defaultProps} max={0} />);

            const input = screen.getByDisplayValue('2');
            expect(input).toHaveAttribute('max', '0');
        });

        test('should not set max attribute when max prop is undefined', () => {
            render(<QuantityPicker {...defaultProps} />);

            const input = screen.getByDisplayValue('2');
            expect(input).not.toHaveAttribute('max');
        });
    });

    describe('Focus management at value boundaries (WCAG 2.4.3)', () => {
        // A boundary button disables itself once the limit is reached. A disabled control
        // cannot hold focus, so focus would fall to the document body. The picker moves focus
        // to the input first so keyboard users keep a logical focus position.
        //
        // React assigns the object ref's `.current` to the real input node on mount, so the
        // spy is attached after render, once `inputRef.current` points at the rendered element
        // the component actually calls `.focus()` on.
        const setupWithRef = (inputValue: string) => {
            const inputRef: { current: HTMLInputElement | null } = { current: null };
            mockUseQuantityPicker.mockReturnValue({
                inputValue,
                inputRef,
                isDecrementDisabled: false,
                isIncrementDisabled: false,
                isFocused: false,
                handleIncrement: vi.fn(),
                handleDecrement: vi.fn(),
                handleInputChange: vi.fn(),
                handleInputFocus: vi.fn(),
                handleInputBlur: vi.fn(),
                handleKeyDown: vi.fn(),
            });
            return inputRef;
        };

        test('moves focus to the input when decrementing to the value where the button disables', async () => {
            // Decrement disables at value 1 (see use-quantity-picker). Going 2 -> 1 is the
            // transition that would strand focus on the about-to-be-disabled button.
            setupWithRef('2');

            render(<QuantityPicker value="2" onChange={vi.fn()} min={0} productName="Test Product" />);
            const focusSpy = vi.spyOn(screen.getByDisplayValue('2'), 'focus');
            await userEvent.click(screen.getByTestId('quantity-decrement'));

            expect(focusSpy).toHaveBeenCalledTimes(1);
        });

        test('moves focus to the input when incrementing to the maximum', async () => {
            setupWithRef('4');

            render(<QuantityPicker value="4" onChange={vi.fn()} min={0} max={5} productName="Test Product" />);
            const focusSpy = vi.spyOn(screen.getByDisplayValue('4'), 'focus');
            await userEvent.click(screen.getByTestId('quantity-increment'));

            expect(focusSpy).toHaveBeenCalledTimes(1);
        });

        test('does not move focus when a click stays away from a boundary', async () => {
            setupWithRef('3');

            render(<QuantityPicker value="3" onChange={vi.fn()} min={0} max={10} productName="Test Product" />);
            const focusSpy = vi.spyOn(screen.getByDisplayValue('3'), 'focus');
            await userEvent.click(screen.getByTestId('quantity-increment'));
            await userEvent.click(screen.getByTestId('quantity-decrement'));

            expect(focusSpy).not.toHaveBeenCalled();
        });
    });
});
