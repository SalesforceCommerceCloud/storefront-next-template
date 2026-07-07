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
 * Order Details Page Object
 * Encapsulates interactions with the order details page at /account/orders/:orderNo
 *
 * Features:
 * - View detailed order information
 * - View order items with product details
 * - View shipping and billing addresses
 * - View payment information
 * - View order status and tracking
 * - Navigate back to order list
 * - Error states (order not found)
 */
class OrderDetailsPage {
    locators = {
        // Page elements
        pageContainer: locate('[data-section="order-details"]').as('Order Details Container'),

        // Order header - h1 with "Order Details" and order number (hash icon + number, no "Order #" label)
        pageTitle: locate('h1').withText('Order Details').as('Page Title'),
        orderNumber: locate('[data-testid="order-number"]').as('Order Number'),
        orderStatus: locate('[data-testid="order-status-badge"]').as('Order Status Badge'),
        /** Present on shipment rows when SCAPI returns `shippingStatus` for that shipment */
        shippingStatus: locate('[data-testid="shipping-status-badge"]').as('Shipping Status Badge'),

        // Order items section
        itemsOrderedHeading: locate('h2').withText('Items Ordered').as('Items Ordered Heading'),
        orderSummaryHeading: locate('h3').withText('Order Summary').as('Order Summary Heading'),

        // Shipment sections
        shipmentSection: locate('[data-shipment-id]').as('Shipment Section'),

        // Order items - individual product line items across all shipments
        orderItem: locate('[data-testid="order-item"]').as('Order Item'),

        // Shipping address card
        shippingAddressCard: locate('[data-card="shipping-address"]').as('Shipping Address Card'),
        shippingAddressLabel: locate('p.text-xs.font-semibold')
            .withText('Shipping Address')
            .as('Shipping Address Label'),

        // Tracking number card + OMS tracking details (populated only on a SOM-fulfilled order)
        trackingNumberCard: locate('[data-card="tracking-number"]').as('Tracking Number Card'),
        /** The tracking number rendered as a link to the carrier (present when the OMS shipment has a trackingUrl). */
        trackingNumberLink: locate('[data-testid="tracking-number-link"]').as('Tracking Number Link'),
        /** The tracking number rendered as plain text (present when there is no carrier trackingUrl). */
        trackingNumberText: locate('[data-testid="tracking-number-text"]').as('Tracking Number Text'),
        /** Carrier/provider line (OMS only). */
        trackingProvider: locate('[data-section="order-tracking"] [data-field="provider"]').as('Tracking Provider'),
        /** Expected delivery date line (OMS only). */
        trackingExpectedDelivery: locate('[data-field="expected-delivery"]').as('Tracking Expected Delivery'),
        /** Actual (delivered) date line (OMS only). */
        trackingDelivered: locate('[data-field="delivered"]').as('Tracking Delivered Date'),
        /** The "Track shipment" order-action (hidden when there is no trackable shipment). */
        trackShipmentAction: locate('[data-testid="track-shipment-action"]').as('Track Shipment Action'),

        backToOrdersLink: locate('a[href*="/account/orders"]:not([href*="/account/orders/"])').as(
            'Back to Orders Link'
        ),

        // Loading state
        orderSkeleton: locate('.animate-pulse').as('Loading Skeleton'),

        // Error states - order not found
        orderNotFoundCard: locate('[data-testid="order-not-found"]').as('Order Not Found Card'),
        notFoundTitle: locate('.text-center').withText('Order Not Found').as('Not Found Title'),
        backToOrderHistoryButton: locate('a[href*="/account/orders"]:not([href*="/account/orders/"])')
            .withText('Back to Order History')
            .as('Back to Order History Button'),
    };

    /**
     * Navigate to order details page
     * @param orderNo - Order number to view
     */
    navigate(orderNo: string): void {
        I.amOnPage(buildSitePath(`/account/orders/${orderNo}`));
    }

    /**
     * Validate that the order details page loaded successfully
     */
    validatePageLoaded(): void {
        I.seeElement(this.locators.pageTitle);
        I.seeElement(this.locators.orderNumber);
    }

    /**
     * Get the displayed order number (text is the number only, e.g. "00097407")
     * @returns Promise<string> - Order number
     */
    async getOrderNumber(): Promise<string> {
        return (await I.grabTextFrom(this.locators.orderNumber)).trim();
    }

    /**
     * Get the order status
     * @returns Promise<string> - Order status
     */
    async getOrderStatus(): Promise<string> {
        return await I.grabTextFrom(this.locators.orderStatus);
    }

    /**
     * Get the number of order items (actual product line items)
     * @returns Promise<number> - Number of product items in the order
     */
    async getOrderItemCount(): Promise<number> {
        const count = await I.grabNumberOfVisibleElements(this.locators.orderItem);
        return count;
    }

    /**
     * Validate order summary section is visible
     */
    validateOrderSummaryVisible(): void {
        I.seeElement(this.locators.orderSummaryHeading);
    }

    /**
     * Validate shipping address section is visible
     */
    validateShippingAddressVisible(): void {
        I.seeElement(this.locators.shippingAddressCard);
    }

    /**
     * Check if loading skeleton is visible
     * @returns Promise<boolean> - True if skeleton is visible
     */
    async isLoadingSkeletonVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.orderSkeleton);
        return count > 0;
    }

    /**
     * Check if order not found error is displayed
     * @returns Promise<boolean> - True if error is visible
     */
    async isOrderNotFoundVisible(): Promise<boolean> {
        const titleCount = await I.grabNumberOfVisibleElements(this.locators.notFoundTitle);
        const buttonCount = await I.grabNumberOfVisibleElements(this.locators.backToOrderHistoryButton);
        return titleCount > 0 || buttonCount > 0;
    }

    /**
     * Validate order not found error state
     */
    validateOrderNotFound(): void {
        I.see('Order Not Found');
        I.seeElement(this.locators.backToOrderHistoryButton);
    }

    /**
     * Click the back to orders link
     */
    clickBackToOrders(): void {
        I.click(this.locators.backToOrdersLink);
    }

    /**
     * Return the current browser URL.
     */
    async getCurrentUrl(): Promise<string> {
        return await I.grabCurrentUrl();
    }

    /**
     * Whether a tracking-number card is shown (OMS or ECOM). A not-yet-shipped order
     * with no tracking data shows no card.
     * @returns Promise<boolean>
     */
    async isTrackingCardVisible(): Promise<boolean> {
        return (await I.grabNumberOfVisibleElements(this.locators.trackingNumberCard)) > 0;
    }

    /**
     * Whether the tracking number is rendered as a carrier link (vs plain text).
     * @returns Promise<boolean>
     */
    async isTrackingNumberLinkVisible(): Promise<boolean> {
        return (await I.grabNumberOfVisibleElements(this.locators.trackingNumberLink)) > 0;
    }

    /**
     * Grab the carrier tracking-link href (the tracking number links to the carrier site).
     * @returns Promise<string>
     */
    async getTrackingLinkHref(): Promise<string> {
        return await I.grabAttributeFrom(this.locators.trackingNumberLink, 'href');
    }

    /**
     * Whether the "Track shipment" order-action is shown.
     * @returns Promise<boolean>
     */
    async isTrackShipmentActionVisible(): Promise<boolean> {
        return (await I.grabNumberOfVisibleElements(this.locators.trackShipmentAction)) > 0;
    }

    /**
     * Whether the expected-delivery line is shown (OMS only).
     * @returns Promise<boolean>
     */
    async isExpectedDeliveryVisible(): Promise<boolean> {
        return (await I.grabNumberOfVisibleElements(this.locators.trackingExpectedDelivery)) > 0;
    }

    /**
     * Validate authentication requirement
     * Checks if unauthenticated users are redirected to login
     */
    async validateAuthenticationRequired(): Promise<void> {
        const currentUrl = await I.grabCurrentUrl();
        if (!currentUrl.includes('/account/orders/')) {
            I.waitForURL(/\/(login|signin)/, 10);
        }
    }
}

// Export as singleton
export = new OrderDetailsPage();
