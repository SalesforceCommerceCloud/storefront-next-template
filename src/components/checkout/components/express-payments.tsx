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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import StaticPayPalButton from './static-paypal-button';
import StaticVenmoButton from './static-venmo-button';
import ApplePayLogo from './apple-pay-logo';
import GooglePayLogo from './google-pay-logo';
import AmazonPayLogo from './amazon-pay-logo';
import { useTranslation } from 'react-i18next';

interface ExpressPaymentsProps {
    disabled?: boolean;
    /**
     * Layout orientation for the payment buttons
     * - 'horizontal': Responsive grid layout (2 cols mobile/tablet, 5 cols desktop)
     * - 'vertical': Stacked vertical layout (all buttons in single column)
     * @default 'horizontal'
     */
    layout?: 'horizontal' | 'vertical';
    /**
     * Position of the separator divider
     * - 'top': Displays separator above the payment buttons
     * - 'bottom': Displays separator below the payment buttons
     * @default 'bottom'
     */
    separatorPosition?: 'top' | 'bottom';
    /**
     * Custom text for the separator divider
     * @default 'Or'
     */
    separatorText?: string;
}

/**
 * @feature-stub Express checkout buttons
 * @status stub — no backend integration
 *
 * These feature stubs are included to help accelerate your storefront
 * development. They give you a working UI scaffold — layout, styling,
 * interaction states, and accessibility — so you can focus on wiring up
 * the business logic and backend integrations that are unique to your
 * brand, rather than building everything from scratch.
 *
 * See docs/README-FEATURE-STUBS.md for the full list and guidance on
 * productionizing or removing stubs.
 *
 * Current behavior:
 *   Renders Apple Pay, Google Pay, Amazon Pay, PayPal, and Venmo buttons.
 *   Clicking any button triggers an alert() dialog. No payment is processed
 *   and no order is created.
 *
 * To productionize:
 *   Replace this component with your payment provider's SDK integration
 *   (e.g., Stripe, Adyen, Braintree). Each provider requires:
 *   1. Loading the provider's client-side SDK
 *   2. Initializing a payment session with your merchant credentials
 *   3. Collecting the payment token on approval
 *   4. Submitting the token through your checkout flow
 *      (SCAPI `/checkout/shopper-orders` or provider-specific endpoint)
 *
 * To remove:
 *   Delete this file and its related components (see docs/README-FEATURE-STUBS.md
 *   for the full file list), then remove the <ExpressPayments /> usage from:
 *   - src/components/checkout/checkout-form-page.tsx
 *   - src/components/product-cart-actions/index.tsx
 *
 * Remove this block once the real integration is wired up.
 */
export default function ExpressPayments({
    disabled = false,
    layout = 'horizontal',
    separatorPosition = 'bottom',
    separatorText = 'or continue below',
}: ExpressPaymentsProps) {
    const { t } = useTranslation('checkout');
    const applePayLabel = t('expressPayments.applePayLabel');
    const googlePayLabel = t('expressPayments.googlePayLabel');
    const amazonPayLabel = t('expressPayments.amazonPayLabel');
    const handleApplePayClick = () => {
        if (!disabled) {
            // oxlint-disable-next-line no-alert
            alert(
                'Apple Pay express checkout would be processed here. This would skip all form steps and go directly to payment confirmation.'
            );
        }
    };

    const handleGooglePayClick = () => {
        if (!disabled) {
            // oxlint-disable-next-line no-alert
            alert(
                'Google Pay express checkout would be processed here. This would skip all form steps and go directly to payment confirmation.'
            );
        }
    };

    const handleAmazonPayClick = () => {
        if (!disabled) {
            // oxlint-disable-next-line no-alert
            alert(
                'Amazon Pay express checkout would be processed here. This would skip all form steps and go directly to payment confirmation.'
            );
        }
    };

    const handleVenmoClick = () => {
        if (!disabled) {
            // oxlint-disable-next-line no-alert
            alert(
                'Venmo express checkout would be processed here. This would skip all form steps and go directly to payment confirmation.'
            );
        }
    };

    const handlePayPalClick = () => {
        if (!disabled) {
            // oxlint-disable-next-line no-alert
            alert(
                'PayPal express checkout would be processed here. This would skip all form steps and go directly to payment confirmation.'
            );
        }
    };

    const gridClasses = layout === 'vertical' ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 lg:grid-cols-5 gap-2';

    const separator = (
        <div className="relative flex items-center gap-[15px]">
            <div className="flex-1 h-px bg-separator" />
            <span
                className="text-sm font-normal leading-5 text-muted-foreground whitespace-nowrap"
                data-express-payments-separator-label="">
                {separatorText}
            </span>
            <div className="flex-1 h-px bg-separator" />
        </div>
    );

    return (
        <div className="space-y-6" data-testid="express-payments">
            {separatorPosition === 'top' && separator}

            <Card className="flex flex-col items-center gap-3 p-6">
                <p className="text-sm font-normal text-card-foreground">{t('expressPayments.title')}</p>
                <div className={`${gridClasses} w-full`}>
                    {/* Google Pay Button */}
                    <Button
                        onClick={handleGooglePayClick}
                        disabled={disabled}
                        className="w-full h-9 bg-foreground hover:bg-foreground/90 text-background border-0 flex items-center justify-center transition-colors"
                        aria-label={googlePayLabel}>
                        <GooglePayLogo className="flex-shrink-0" decorative />
                    </Button>

                    {/* Apple Pay Button */}
                    <Button
                        onClick={handleApplePayClick}
                        disabled={disabled}
                        className="w-full h-9 bg-foreground hover:bg-foreground/90 text-background border-0 flex items-center justify-center transition-colors"
                        aria-label={applePayLabel}>
                        <ApplePayLogo className="flex-shrink-0" decorative />
                    </Button>

                    {/* PayPal & Venmo Static Buttons */}
                    <StaticPayPalButton onClick={handlePayPalClick} disabled={disabled} />
                    <StaticVenmoButton onClick={handleVenmoClick} disabled={disabled} />

                    {/* Amazon Pay Button — spans full width when it's the unpaired last item in a 2-col grid */}
                    <Button
                        onClick={handleAmazonPayClick}
                        disabled={disabled}
                        className={cn(
                            'w-full h-9 bg-muted hover:bg-muted-hover border-0 flex items-center justify-center transition-colors',
                            layout === 'horizontal' && 'max-lg:col-span-2'
                        )}
                        aria-label={amazonPayLabel}>
                        <AmazonPayLogo className="flex-shrink-0" decorative />
                    </Button>
                </div>
            </Card>

            {separatorPosition === 'bottom' && separator}
        </div>
    );
}
