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
import { use, useLayoutEffect } from 'react';
import { loader, type CheckoutPageData } from '@/lib/checkout/loaders.server';
import { createPage, type RouteComponentProps } from '@/components/create-page';
import type { Route } from './+types/_checkout.checkout';
import { SeoMeta } from '@/components/seo-meta';
import { useTranslation } from 'react-i18next';
import CheckoutFormPage from '@/components/checkout/checkout-form-page';
import CheckoutProvider from '@/components/checkout/utils/checkout-context';
import { hasValidShippingMethodForEveryShipment } from '@/components/checkout/utils/checkout-utils';
import { CheckoutErrorBoundary } from '@/components/checkout-error-boundary';
import { CheckoutSkeleton } from '@/components/checkout/components/checkout-skeletons';
import { useBasketUpdater } from '@/providers/basket';
import { useRevalidateOnReturn } from '@/hooks/use-revalidate-on-return';
import { useToast } from '@/components/toast';
// @sfdc-extension-line SFDC_EXT_BOPIS
import PickupProvider from '@/extensions/bopis/context/pickup-context';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { filterDeliveryShippingMethods } from '@/extensions/bopis/lib/basket-utils';
import GoogleCloudApiProvider from '@/providers/google-cloud-api';
import { CHECKOUT_ACTION_INTENTS } from '@/components/checkout/utils/checkout-context-types';
import { action as submitContactInfo } from '@/lib/checkout/actions/submit-contact-info.server';
import { action as submitShippingAddress } from '@/lib/checkout/actions/submit-shipping-address.server';
import { action as submitShippingOptions } from '@/lib/checkout/actions/submit-shipping-options.server';
import { action as submitPayment } from '@/lib/checkout/actions/submit-payment.server';
import { getLogger } from '@/lib/logger.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';

export { loader };
export { shouldRevalidate } from '@/lib/revalidation/routes/checkout';

export async function action({ request, context }: Route.ActionArgs) {
    const logger = getLogger(context);
    const formData = await request.formData();
    const intent = formData.get('intent')?.toString();

    logger.debug('Checkout: action dispatching', { intent });

    switch (intent) {
        case CHECKOUT_ACTION_INTENTS.CONTACT_INFO:
            return submitContactInfo(formData, context);
        case CHECKOUT_ACTION_INTENTS.SHIPPING_ADDRESS:
            return submitShippingAddress(formData, context);
        case CHECKOUT_ACTION_INTENTS.SHIPPING_OPTIONS:
            return submitShippingOptions(formData, context);
        case CHECKOUT_ACTION_INTENTS.PAYMENT:
            return submitPayment(formData, context);
        default:
            logger.warn('Checkout: unknown action intent', { intent });
            return Response.json(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.INVALID_INPUT, message: 'Invalid action intent' }),
                },
                { status: 400 }
            );
    }
}

function CheckoutView({
    loaderData: {
        basket,
        customerProfile,
        shippingMethodsMap,
        productMap,
        promotions,
        emailVerificationEnabled,
        gcpApiKey,
        shippingDefaultSet,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        storesByStoreId,
    },
}: RouteComponentProps<CheckoutPageData>) {
    const { t } = useTranslation('checkout');
    // Imperatively update root BasketProvider with loader basket
    // This ensures cart badge and other components see the updated basket.
    // Shape-safe: no basket read or mutation sets `expand`, so every response carries the SCAPI default and can't
    // down-shape provider consumers.
    const updateBasket = useBasketUpdater();
    const { addToast } = useToast();
    useLayoutEffect(() => {
        if (basket?.basketId) {
            updateBasket(basket);
        }
    }, [basket, updateBasket]);

    // Revalidate when returning to this tab and another tab/device has mutated the basket.
    // Passes the lastModified the loader rendered with so the comparison is stable across renders.
    // The route's shouldRevalidate skips on step-intent and 3xx submissions; a programmatic
    // revalidation carries neither formData nor actionResult, so it falls through to
    // defaultShouldRevalidate (true for an imperative revalidate) and the loader re-runs.
    useRevalidateOnReturn({ basketId: basket?.basketId, lastModified: basket?.lastModified });

    // Block rendering if basket is not available
    if (!basket?.basketId) {
        return <CheckoutSkeleton />;
    }

    const customerProfileData = customerProfile ? use(customerProfile) : null;
    const shippingMethodsMapData = shippingMethodsMap ? use(shippingMethodsMap) : {};

    // Determine whether the basket's address has deliverable shipping options for every shipment.
    // Threading this into the initial step computation keeps the user on Shipping Address after a
    // refresh when the address yields no methods — without it, registered-customer step derivation
    // would overshoot to Shipping Options or Place Order. The loader is authoritative here: on
    // refresh it re-fetches the methods map for the current basket address; in-session
    // advancement is independently gated by `noShippingMethodsRef` in use-checkout-actions.
    let methodsForValidityCheck = shippingMethodsMapData;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    methodsForValidityCheck = filterDeliveryShippingMethods(shippingMethodsMapData);
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    const hasNoValidShippingMethods = !hasValidShippingMethodForEveryShipment(methodsForValidityCheck);

    const content = (
        <>
            <SeoMeta title={t('meta.title', { defaultValue: 'Checkout' })} noIndex />
            <CheckoutProvider
                customerProfile={customerProfileData ?? undefined}
                shippingDefaultSet={shippingDefaultSet ?? Promise.resolve(undefined)}
                hasNoValidShippingMethods={hasNoValidShippingMethods}>
                <CheckoutFormPage
                    shippingMethodsMap={shippingMethodsMapData}
                    productMapPromise={productMap}
                    promotionsPromise={promotions}
                    showToast={addToast}
                    emailVerificationEnabled={emailVerificationEnabled}
                />
            </CheckoutProvider>
        </>
    );

    let finalContent = content;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    /// Initialize PickupProvider with stores by store id
    finalContent = <PickupProvider initialPickupStores={storesByStoreId}>{content}</PickupProvider>;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    finalContent = <GoogleCloudApiProvider apiKey={gcpApiKey}>{finalContent}</GoogleCloudApiProvider>;

    return finalContent;
}

const CheckoutPageWithErrorBoundary = createPage({
    component: CheckoutView,
    fallback: <CheckoutSkeleton />,
});

function CheckoutPage(props: RouteComponentProps<CheckoutPageData>) {
    return (
        <CheckoutErrorBoundary>
            <CheckoutPageWithErrorBoundary {...props} />
        </CheckoutErrorBoundary>
    );
}

export default CheckoutPage;
