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

import { buildSitePath } from '../utils/url-utils';

const { I } = inject();

/**
 * Order List Page Object
 * Encapsulates interactions with the order list page at /account/orders
 *
 * Features:
 * - View list of customer orders
 * - Navigate to order details
 * - Pagination support
 * - Loading states (skeleton)
 * - Error states
 */
class OrderListPage {
    locators = {
        // Page header (OrderListHeader renders an h1 with h4 typography styling)
        pageTitle: locate('h1').withText('Order History').as('Page Title'),
        pageSubtitle: locate('p.text-muted-foreground').as('Page Subtitle'),

        // Order list - each order is a Link wrapping a Card
        orderCard: locate('a[href*="/account/orders/"]').as('Order Card Link'),
        orderCardFirst: locate('a[href*="/account/orders/"]').first().as('First Order Card Link'),

        // Order card elements (within the card structure)
        orderDate: locate('p.text-xs').withText('Order Date').as('Order Date Label'),
        orderTotal: locate('p.text-xs').withText('Total').as('Order Total Label'),
        orderItems: locate('p.text-xs').withText('Items').as('Order Items Label'),
        orderStatus: locate('[data-testid="order-status-badge"]').as('Order Status Badge'),
        viewDetailsLink: locate('span').withText('View Order Details').as('View Details Link'),

        // Loading states
        orderListSkeleton: locate('.animate-pulse').as('Order List Skeleton'),

        // Empty state - button with "Continue Shopping" text
        emptyStateMessage: locate('button').withText('Continue Shopping').as('Empty State'),

        // Footer showing total count
        totalOrdersText: locate('[data-testid="total-orders-text"]').as('Total Orders Text'),
    };

    /**
     * Navigate to order list page
     * @param url - Optional URL override (defaults to /account/orders)
     */
    navigate(url: string = '/account/orders'): void {
        I.amOnPage(buildSitePath(url));
        I.waitForElement(this.locators.pageTitle, 30);
    }

    /**
     * Validate that the page loaded successfully
     */
    validatePageLoaded(): void {
        I.seeElement(this.locators.pageTitle);
    }

    /**
     * Get the number of visible order cards
     * @returns Promise<number> - Number of order cards
     */
    async getOrderCount(): Promise<number> {
        const count = await I.grabNumberOfVisibleElements(this.locators.orderCard);
        return count;
    }

    /**
     * Get order number from a specific order card by extracting from href
     * @param index - Order card index (0-based)
     * @returns Promise<string> - Order number
     */
    async getOrderNumber(index: number = 0): Promise<string> {
        const hrefs = await I.grabAttributeFromAll('a[href*="/account/orders/"]', 'href');
        if (hrefs[index]) {
            // Extract order number from URL like /account/orders/00097407
            const match = hrefs[index].match(/\/account\/orders\/([^?]+)/);
            return match ? match[1] : '';
        }
        return '';
    }

    /**
     * Get all visible order numbers
     * @returns Promise<string[]> - Array of order numbers
     */
    async getAllOrderNumbers(): Promise<string[]> {
        const hrefs = await I.grabAttributeFromAll('a[href*="/account/orders/"]', 'href');
        return hrefs.map((href) => {
            const match = href.match(/\/account\/orders\/([^?]+)/);
            return match ? match[1] : '';
        });
    }

    /**
     * Click the order link for a specific order number
     * @param orderNumber - Order number to view (optional, defaults to first)
     */
    clickViewDetails(orderNumber?: string): void {
        if (orderNumber) {
            // Use $= (ends-with) so the selector works with and without a url prefix
            I.click(`a[href*="/account/orders/${orderNumber}"]`);
        } else {
            I.click(this.locators.orderCardFirst);
        }
    }

    /**
     * Click the first order card link
     */
    clickFirstOrderDetails(): void {
        I.click(this.locators.orderCardFirst);
    }

    /**
     * Check if loading skeleton is visible
     * @returns Promise<boolean> - True if skeleton is visible
     */
    async isLoadingSkeletonVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.orderListSkeleton);
        return count > 0;
    }

    /**
     * Check if empty state is displayed
     * @returns Promise<boolean> - True if empty state is visible
     */
    async isEmptyStateVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.emptyStateMessage);
        return count > 0;
    }

    /**
     * Validate that orders are displayed
     */
    validateOrdersDisplayed(): void {
        I.seeElement(this.locators.orderCard);
    }

    /**
     * Validate specific order fields are visible
     */
    validateOrderCardStructure(): void {
        I.seeElement(this.locators.orderCard);
        I.seeElement(this.locators.orderDate);
        I.seeElement(this.locators.orderTotal);
        I.seeElement(this.locators.orderItems);
        I.seeElement(this.locators.viewDetailsLink);
    }

    /**
     * Return the current browser URL.
     */
    async getCurrentUrl(): Promise<string> {
        return await I.grabCurrentUrl();
    }

    /**
     * Require at least one order to exist, then return the first order number.
     * Throws a descriptive error if the account has no order history, so the
     * failure message points at the test-data gap rather than a random assertion.
     *
     * @param testUserEmail - Email shown in the error message for quick diagnosis
     */
    async getFirstOrderNumberOrFail(testUserEmail: string): Promise<string> {
        const count = await this.getOrderCount();
        if (count === 0) {
            throw new Error(
                'Test user has no order history. Please ensure the test account ' +
                    `(${testUserEmail}) has existing orders in Commerce Cloud before running these tests.`
            );
        }
        return await this.getOrderNumber(0);
    }

    /**
     * Validate authentication requirement
     * Checks if unauthenticated users are redirected to login
     */
    async validateAuthenticationRequired(): Promise<void> {
        const currentUrl = await I.grabCurrentUrl();
        if (!currentUrl.includes('/account/orders')) {
            I.waitForURL(/\/(login|signin)/, 10);
        }
    }
}

// Export as singleton
export = new OrderListPage();
