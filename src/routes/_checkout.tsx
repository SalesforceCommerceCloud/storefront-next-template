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
import { Outlet } from 'react-router';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { SkipLink } from '@/components/skip-link';

/**
 * Checkout Layout Route
 *
 * This pathless layout route provides a minimal header (logo + cart) and
 * footer (copyright + legal links) for checkout pages, reducing distractions
 * and keeping the shopper focused on completing their order.
 *
 * Routes that need this layout should be prefixed with `_checkout.` in their filename.
 */
export default function CheckoutLayout() {
    return (
        <div className="group/checkout flex flex-col grow">
            <SkipLink />
            <Header variant="checkout" />
            <main id="main-content" tabIndex={-1} className="lg:grow">
                <Outlet />
            </main>
            <Footer variant="checkout" />
            <CheckoutMobileBarSpacer />
        </div>
    );
}

/**
 * Spacer matching the fixed mobile checkout bar height (Place Order or
 * step Continue button) so the footer is fully visible above the bar.
 */
function CheckoutMobileBarSpacer() {
    return (
        <div className="hidden h-20 group-has-[[data-checkout-mobile-bar]]/checkout:max-lg:block" aria-hidden="true" />
    );
}
