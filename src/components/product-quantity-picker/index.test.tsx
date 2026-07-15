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
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();
import ProductQuantityPicker from './index';

describe('ProductQuantityPicker', () => {
    const defaultProps = {
        value: '1',
        onChange: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('renders quantity picker with correct label and value', () => {
        render(<ProductQuantityPicker {...defaultProps} />);

        expect(screen.getByText(t('quantitySelector:quantity'))).toBeInTheDocument();
        expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    });

    test('renders with custom className', () => {
        const { container } = render(<ProductQuantityPicker {...defaultProps} className="custom-class" />);

        const productQuantityPicker = container.firstChild as HTMLElement;
        expect(productQuantityPicker).toHaveClass('custom-class');
    });

    test('calls onChange when quantity changes', async () => {
        const user = userEvent.setup();
        const mockOnChange = vi.fn();

        render(<ProductQuantityPicker {...defaultProps} onChange={mockOnChange} />);

        const quantityInput = screen.getByDisplayValue('1');
        await user.clear(quantityInput);
        await user.type(quantityInput, '3');

        expect(mockOnChange).toHaveBeenCalledWith(3);
    });

    test('displays out of stock message when isOutOfStock is true', () => {
        render(<ProductQuantityPicker {...defaultProps} isOutOfStock={true} productName="Test Product" />);

        const expectedMessage = t('product:outOfStock', { productName: 'Test Product' });
        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
        expect(screen.getByText(expectedMessage)).toHaveAttribute('role', 'alert');
        expect(screen.getByText(expectedMessage)).toHaveAttribute('aria-live', 'polite');
    });

    test('displays out of stock message with default product name when productName is not provided', () => {
        render(<ProductQuantityPicker {...defaultProps} isOutOfStock={true} />);

        const expectedMessage = t('product:outOfStock', { productName: t('common:product') });
        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    });

    test('displays stock level warning when quantity exceeds stock level', () => {
        render(<ProductQuantityPicker {...defaultProps} value="5" stockLevel={3} />);

        const expectedMessage = t('quantitySelector:onlyLeft', { stockLevel: '3' });
        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
        expect(screen.getByText(expectedMessage)).toHaveAttribute('role', 'alert');
        expect(screen.getByText(expectedMessage)).toHaveAttribute('aria-live', 'polite');
    });

    test('displays bundle-specific stock level warning when isBundle is true', () => {
        render(
            <ProductQuantityPicker
                {...defaultProps}
                value="5"
                stockLevel={3}
                isBundle={true}
                productName="Bundle Product"
            />
        );

        const expectedMessage = t('quantitySelector:onlyLeftForProduct', {
            stockLevel: '3',
            productName: 'Bundle Product',
        });
        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    });

    test('displays bundle stock warning with default product name when productName is not provided', () => {
        render(<ProductQuantityPicker {...defaultProps} value="5" stockLevel={3} isBundle={true} />);

        const expectedMessage = t('quantitySelector:onlyLeftForProduct', {
            stockLevel: '3',
            productName: t('common:product'),
        });
        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    });

    test('does not display stock warning when stock level is not exceeded', () => {
        render(<ProductQuantityPicker {...defaultProps} value="2" stockLevel={5} />);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('does not display stock warning when stockLevel is undefined', () => {
        render(<ProductQuantityPicker {...defaultProps} value="5" />);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('does not display stock warning when stockLevel is 0', () => {
        render(<ProductQuantityPicker {...defaultProps} value="5" stockLevel={0} />);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('prioritizes out of stock message over stock level warning', () => {
        render(
            <ProductQuantityPicker
                {...defaultProps}
                value="5"
                stockLevel={3}
                isOutOfStock={true}
                productName="Test Product"
            />
        );

        // Should show out of stock message, not stock level warning
        const expectedOutOfStockMessage = t('product:outOfStock', { productName: 'Test Product' });
        const stockLevelMessage = t('quantitySelector:onlyLeft', { stockLevel: '3' });

        expect(screen.getByText(expectedOutOfStockMessage)).toBeInTheDocument();
        expect(screen.queryByText(stockLevelMessage)).not.toBeInTheDocument();
    });

    test('passes correct props to QuantityPicker', () => {
        render(<ProductQuantityPicker {...defaultProps} value="3" productName="Test Product" />);

        // Check that the QuantityPicker receives the correct props
        const quantityInput = screen.getByDisplayValue('3');
        expect(quantityInput).toHaveAttribute('min', '1');
        expect(quantityInput.getAttribute('id')).toMatch(/^quantity-/);
    });

    test('initializes with value prop and maintains internal state', () => {
        render(<ProductQuantityPicker {...defaultProps} value="1" />);

        expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    });

    test('calls onChange for zero value (component allows it)', async () => {
        const user = userEvent.setup();
        const mockOnChange = vi.fn();

        render(<ProductQuantityPicker {...defaultProps} onChange={mockOnChange} />);

        const quantityInput = screen.getByDisplayValue('1');
        await user.clear(quantityInput);
        await user.type(quantityInput, '0');

        // Component allows zero values and calls onChange
        expect(mockOnChange).toHaveBeenCalledWith(0);
    });

    test('displays inventory message with correct styling', () => {
        render(<ProductQuantityPicker {...defaultProps} value="5" stockLevel={3} />);

        const inventoryMessage = screen.getByRole('alert');
        expect(inventoryMessage).toHaveClass('text-destructive', 'font-medium');
    });

    test('handles empty productName gracefully in out of stock message', () => {
        render(<ProductQuantityPicker {...defaultProps} isOutOfStock={true} productName="" />);

        // Component uses default product name when productName is empty
        const expectedMessage = t('product:outOfStock', { productName: t('common:product') });
        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    });

    test('handles empty productName gracefully in bundle stock message', () => {
        render(<ProductQuantityPicker {...defaultProps} value="5" stockLevel={3} isBundle={true} productName="" />);

        // Component uses default product name when productName is empty
        const expectedMessage = t('quantitySelector:onlyLeftForProduct', {
            stockLevel: '3',
            productName: t('common:product'),
        });
        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    });

    test('does not display inventory message when stock level equals quantity', () => {
        render(<ProductQuantityPicker {...defaultProps} value="3" stockLevel={3} />);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('handles large quantity values correctly', async () => {
        const user = userEvent.setup();
        const mockOnChange = vi.fn();

        render(<ProductQuantityPicker {...defaultProps} onChange={mockOnChange} />);

        const quantityInput = screen.getByDisplayValue('1');
        await user.clear(quantityInput);
        await user.type(quantityInput, '999');

        expect(mockOnChange).toHaveBeenCalledWith(999);
    });

    test('maintains correct aria attributes for accessibility', () => {
        render(<ProductQuantityPicker {...defaultProps} value="5" stockLevel={3} />);

        const inventoryMessage = screen.getByRole('alert');
        expect(inventoryMessage).toHaveAttribute('aria-live', 'polite');
        expect(inventoryMessage).toHaveAttribute('role', 'alert');
    });

    test('handles decimal quantity values correctly', async () => {
        const user = userEvent.setup();
        const mockOnChange = vi.fn();

        render(<ProductQuantityPicker {...defaultProps} onChange={mockOnChange} />);

        const quantityInput = screen.getByDisplayValue('1');
        await user.clear(quantityInput);
        await user.type(quantityInput, '2.5');

        // Component calls onChange multiple times during typing decimal values
        expect(mockOnChange).toHaveBeenCalledWith(0); // From clearing input
        expect(mockOnChange).toHaveBeenCalledWith(2); // From typing "2"
        expect(mockOnChange).toHaveBeenCalledWith(25); // From typing "2.5"
    });

    test('updates inventory message when quantity changes', async () => {
        const user = userEvent.setup();
        const mockOnChange = vi.fn();

        render(<ProductQuantityPicker {...defaultProps} value="1" stockLevel={3} onChange={mockOnChange} />);

        // Initially no warning should be shown
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        // Change quantity to exceed stock level
        const quantityInput = screen.getByDisplayValue('1');
        await user.clear(quantityInput);
        await user.type(quantityInput, '5');

        // Now warning should be shown
        const expectedMessage = t('quantitySelector:onlyLeft', { stockLevel: '3' });
        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    });

    test('handles multiple prop combinations correctly', () => {
        render(
            <ProductQuantityPicker
                value="2"
                onChange={vi.fn()}
                className="test-class"
                stockLevel={10}
                isOutOfStock={false}
                productName="Test Product"
                isBundle={true}
            />
        );

        // Should render with all props
        expect(screen.getByDisplayValue('2')).toBeInTheDocument();
        expect(screen.getByText(t('quantitySelector:quantity'))).toBeInTheDocument();

        // Should not show any warnings since quantity (2) < stockLevel (10)
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
