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
import { useCallback, useEffect, lazy, Suspense, use, useRef, useState, type FormEvent } from 'react';
import { useFetcher } from 'react-router';
import { useCheckoutContext } from '@/hooks/use-checkout';
import { useBasket, useBasketHydrated } from '@/providers/basket';
import { useCheckoutActions, type PaymentSubmissionRef } from '@/hooks/use-checkout-actions';
import { resourceRoutes, routes, routeHref } from '@/route-paths';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Typography } from '@/components/typography';
import { useCustomerProfile } from '@/hooks/checkout/use-customer-profile';
import { useAuth } from '@/providers/auth';
import type { ShopperBasketsV2, ShopperProducts, ShopperPromotions } from '@/scapi';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { useSite, buildUrl } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { createPaymentSchema, type PaymentData } from '@/lib/checkout/schemas';
import { useAnalytics } from '@/hooks/use-analytics';
import { UITarget } from '@/targets/ui-target';
import { PaymentSubmissionRefProvider } from './payment-submission-context';
import { clearCheckoutCorrelationId, getOrCreateCheckoutCorrelationId } from '@/lib/checkout/correlation';
import { Spinner } from '@/components/spinner';
import { getCheckoutDisplayError, isUnauthorizedError } from './utils/checkout-display-error';
import { SessionExpiredBanner } from './components/session-expired-banner';
import { CHECKOUT_STEPS, type CheckoutStep } from './utils/checkout-context-types';
import { handlePickupContinueAction, hasValidShippingMethodForEveryShipment } from './utils/checkout-utils';
import { isAddressEmpty } from '@/lib/address/address-utils';
import { OrderSummaryMobileAccordion } from '@/components/order-summary/mobile-heading';
import { isOrderTotalEstimated } from '@/components/order-summary/mobile-heading-utils';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { filterDeliveryShippingMethods } from '@/extensions/bopis/lib/basket-utils';

// Lazy load heavy components
const ContactInfo = lazy(() => import('./components/contact-info'));
// @sfdc-extension-line SFDC_EXT_BOPIS
const CheckoutPickupWithData = lazy(() => import('@/extensions/bopis/components/checkout/checkout-pickup-with-data'));
// @sfdc-extension-block-start SFDC_EXT_MULTISHIP
const ShippingMultiAddressWithData = lazy(
    () => import('@/extensions/multiship/components/checkout/shipping-multi-address-with-data')
);
const ShippingMultiOptions = lazy(() => import('@/extensions/multiship/components/checkout/shipping-multi-options'));
// @sfdc-extension-block-end SFDC_EXT_MULTISHIP
const ShippingAddress = lazy(() => import('./components/shipping-address'));
const ShippingOptions = lazy(() => import('./components/shipping-options'));
const Payment = lazy(() => import('./components/payment'));
const RegisterCustomerSelection = lazy(() => import('./components/register-customer-selection'));
const OrderSummary = lazy(() => import('@/components/order-summary'));
const MyCart = lazy(() => import('@/components/my-cart'));
/** @feature-stub Express checkout buttons - remove this import and its JSX below to strip the stub */
const ExpressPayments = lazy(() => import('./components/express-payments'));

// Import skeleton components for accurate loading states
import {
    CheckoutSkeleton,
    ContactInfoSkeleton,
    ExpressPaymentsSkeleton,
    MyCartSkeleton,
    OrderSummarySkeleton,
    PaymentSkeleton,
    PickupSkeleton,
    ShippingAddressSkeleton,
    ShippingOptionsSkeleton,
} from './components/checkout-skeletons';

/**
 * Determines whether the user's current payment form selection differs from the payment
 * instrument already on the basket. When they differ, payment must be re-submitted before
 * place order so the basket reflects the user's actual choice (e.g. switching from a saved
 * card to a new card, or choosing a different saved card).
 */
function doesPaymentSelectionDiffer(
    paymentData: PaymentData,
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined
): boolean {
    const basketInstrument = basket?.paymentInstruments?.[0];
    if (!basketInstrument) return false;

    // User chose "enter a new card" - the basket's existing instrument (from a prior saved-card
    // auto-apply or a previous payment submit) is stale and must be replaced.
    if (!paymentData.useSavedPaymentMethod) {
        return true;
    }

    // User chose a saved card. The basket instrument doesn't store the customerPaymentInstrumentId
    // (v2 basket API limitation), so we can't reliably detect whether the user picked a different
    // saved card than what's already on the basket. Always re-submit to guarantee the correct card
    // is applied - the server action is idempotent (removes old instrument, adds the selected one).
    if (paymentData.useSavedPaymentMethod && paymentData.selectedSavedPaymentMethod) {
        return true;
    }

    return false;
}

interface GuestAccountCreationProps {
    cart: ShopperBasketsV2.schemas['Basket'];
    customerProfile: ReturnType<typeof useCustomerProfile>;
    onSaved: (shouldCreate: boolean) => void;
    savePaymentToProfile?: boolean;
    showToast?: (message: string, type: 'success' | 'error', options?: { duration?: number }) => void;
    /** When true, hide create-account-at-place-order (e.g. shopper chose "Checkout as guest" on passwordless OTP modal). */
    hideCreateAccountOption?: boolean;
}

function GuestAccountCreation({
    cart: _cart,
    customerProfile,
    onSaved,
    savePaymentToProfile,
    showToast,
    hideCreateAccountOption = false,
}: GuestAccountCreationProps) {
    const auth = useAuth();
    const isRegisteredUser = Boolean(customerProfile?.customer?.customerId);

    // The ref preserves the state from when the component first rendered
    const enteredAsRegistered = useRef(auth?.userType === 'registered' || isRegisteredUser);

    if (enteredAsRegistered.current) {
        return null;
    }

    const justRegistered =
        typeof sessionStorage !== 'undefined' && sessionStorage.getItem('registeredViaCheckout') === 'true';

    // When email verification is disabled, registration is offered on the order confirmation page instead
    if (hideCreateAccountOption && !justRegistered) {
        return null;
    }

    const customerLookupResultStr =
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('customerLookupResult') : null;

    let customerLookupResult = null;
    try {
        customerLookupResult = customerLookupResultStr ? JSON.parse(customerLookupResultStr) : null;
    } catch {
        // Failed to parse customer lookup result
    }

    // Show for guest shoppers: lookup confirmed 'guest', lookup not yet performed, or just registered in this session.
    const shouldShow = justRegistered || !customerLookupResult || customerLookupResult?.recommendation === 'guest';

    if (!shouldShow) {
        return null;
    }

    return (
        <Suspense fallback={null}>
            <RegisterCustomerSelection
                onSaved={onSaved}
                savePaymentToProfile={savePaymentToProfile}
                showToast={showToast}
            />
        </Suspense>
    );
}

interface CheckoutFormPageProps {
    /**
     * Streamed rather than awaited by the loader (see `CheckoutPageData.shippingMethodsMap`) so
     * first paint does not block on the ECOM basket calculation.
     */
    shippingMethodsMapPromise?: Promise<Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>>;
    productMapPromise: Promise<Record<string, ShopperProducts.schemas['Product']>>;
    promotionsPromise?: Promise<Record<string, ShopperPromotions.schemas['Promotion']>>;
    showToast?: (message: string, type: 'success' | 'error', options?: { duration?: number }) => void;
    emailVerificationEnabled?: boolean;
}

/**
 * Resolves the streamed shipping-methods promise inside a Suspense boundary and hoists the map
 * into parent state via `onResolved`.
 */
function ShippingMethodsBridge({
    promise,
    onResolved,
}: {
    promise: Promise<Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>>;
    onResolved: (map: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>) => void;
}) {
    const resolved = use(promise);
    useEffect(() => {
        onResolved(resolved);
    }, [resolved, onResolved]);
    return null;
}

/**
 * Wrapper component that resolves productMap and promotions Promises within Suspense boundary.
 */
function MyCartWithData({
    basket,
    productMapPromise,
    promotionsPromise,
}: {
    basket: ShopperBasketsV2.schemas['Basket'];
    productMapPromise: Promise<Record<string, ShopperProducts.schemas['Product']>>;
    promotionsPromise?: Promise<Record<string, ShopperPromotions.schemas['Promotion']>>;
}) {
    const productMap = use(productMapPromise);
    const promotions = promotionsPromise ? use(promotionsPromise) : undefined;

    return <MyCart basket={basket} productMap={productMap} promotions={promotions} />;
}

export default function CheckoutFormPage({
    shippingMethodsMapPromise,
    productMapPromise,
    promotionsPromise,
    showToast,
    emailVerificationEnabled,
}: CheckoutFormPageProps) {
    const { t, i18n } = useTranslation('checkout');
    const { t: tErrors } = useTranslation('errors');
    const tAny = t as (key: string) => string;
    const { currency } = useSite();
    const config = useConfig();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();

    // Streamed shipping-methods map hoisted from `ShippingMethodsBridge` once the loader promise
    // resolves. `undefined` means "not resolved yet" — different from `{}` which means "resolved,
    // no methods".
    const [resolvedShippingMethodsMap, setResolvedShippingMethodsMap] = useState<
        Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> | undefined
    >(undefined);
    const handleShippingMethodsResolved = useCallback(
        (map: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>) => {
            setResolvedShippingMethodsMap(map);
        },
        []
    );

    const cart = useBasket();
    const basketHydrated = useBasketHydrated();
    const { step, STEPS, goToStep, pinToStep, editingStep, shipmentDistribution, exitEditMode } = useCheckoutContext();
    const customerProfile = useCustomerProfile();
    const isRegisteredUser = Boolean(customerProfile?.customer?.customerId);
    const registrationFetcher = useFetcher({ key: 'checkout-registration' });
    const isRegistrationInProgress = registrationFetcher.state !== 'idle';

    const paymentSubmissionRef = useRef<PaymentSubmissionRef['current']>({
        formDataGetter: null,
        billingAddressGetter: null,
        shouldPlaceOrderAfterPayment: false,
        options: null,
        setFormErrors: null,
        onPlaceOrder: null,
    });
    const otpFlowActiveRef = useRef(false);
    const noShippingMethodsRef = useRef(false);
    const [hideCreateAccountAfterSkippedPasswordlessOtp, setHideCreateAccountAfterSkippedPasswordlessOtp] =
        useState(false);

    // Checkout actions hook with all fetchers and submission handlers
    const {
        submitContactInfo,
        submitShippingAddress,
        submitShippingOptions,
        submitShippingOptionsForRecalculation,
        submitPayment,
        submitPlaceOrder,
        buildPlaceOrderFinalizeFormData,
        contactFetcher,
        shippingAddressFetcher,
        shippingOptionsFetcher,
        paymentFetcher,
        placeOrderFetcher,
        isSubmitting,
        handleCreateAccountPreferenceChange,
        shouldCreateAccount,
    } = useCheckoutActions({ paymentSubmissionRef, otpFlowActiveRef, noShippingMethodsRef });

    // Stale `registeredViaCheckout` / `shouldCreateAccount` session from a prior visit can leave
    // `shouldCreateAccount` true and hide the "Save payment" checkbox (see hidePaymentSaveCheckbox).
    // Established returning shoppers already have wallet data - clear those flags so the checkbox shows.
    // Uses a ref guard so the cleanup runs at most once per mount, avoiding mid-checkout resets when
    // customerProfile loads asynchronously or paymentInstruments array changes during basket updates.
    const sessionCleanupDoneRef = useRef(false);
    useEffect(() => {
        if (typeof sessionStorage === 'undefined' || sessionCleanupDoneRef.current) {
            return;
        }
        const hasSavedPaymentMethods = (customerProfile?.paymentInstruments?.length ?? 0) > 0;
        if (!isRegisteredUser || !hasSavedPaymentMethods) {
            return;
        }
        sessionStorage.removeItem('registeredViaCheckout');
        sessionStorage.removeItem('shouldCreateAccount');
        handleCreateAccountPreferenceChange(false);
        sessionCleanupDoneRef.current = true;
    }, [isRegisteredUser, customerProfile?.paymentInstruments?.length, handleCreateAccountPreferenceChange]);

    /**
     * Shopper closed passwordless OTP via "Checkout as guest" - do not verify OTP / sign in.
     * Unblock contact step and hide place-order create-account checkbox for this checkout session.
     */
    const handleRegisteredUserChoseGuest = useCallback(() => {
        setHideCreateAccountAfterSkippedPasswordlessOtp(true);
        otpFlowActiveRef.current = false;
        if (contactFetcher.state === 'idle' && contactFetcher.data?.success === true) {
            exitEditMode();
        }
    }, [contactFetcher.state, contactFetcher.data, exitEditMode]);

    /** After successful OTP verification at contact, restore create-account UI if still applicable */
    const handlePasswordlessOtpVerifiedAtContact = useCallback(() => {
        setHideCreateAccountAfterSkippedPasswordlessOtp(false);
    }, []);

    let showAddressAndOptions = true;

    // Determine shipping methods: prefer action response over loader data (avoids flash when advancing to shipping step).
    // Loader data is a streamed promise now (see `shippingMethodsMapPromise`); read the resolved value out of state.
    const actionShippingMethods = shippingAddressFetcher.data?.data?.shippingMethodsMap as
        | Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>
        | undefined;
    // `undefined` while the loader promise is still in flight (first paint), otherwise the resolved map
    // (possibly `{}` when no methods came back). Callers that must distinguish "loading" from "empty"
    // check `shippingMethodsResolved` below.
    let shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> | undefined =
        actionShippingMethods && Object.keys(actionShippingMethods).length > 0
            ? actionShippingMethods
            : resolvedShippingMethodsMap;
    const shippingMethodsResolved =
        (actionShippingMethods && Object.keys(actionShippingMethods).length > 0) ||
        resolvedShippingMethodsMap !== undefined;

    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    let isDeliveryProductItem = (_item: ShopperBasketsV2.schemas['ProductItem']) => true;
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    shippingMethodsMap = shippingMethodsMap ? filterDeliveryShippingMethods(shippingMethodsMap) : undefined;
    const hasPickupItems = shipmentDistribution.hasPickupItems;
    showAddressAndOptions = shipmentDistribution.hasDeliveryItems;
    isDeliveryProductItem = shipmentDistribution.isDeliveryProductItem;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    // Keep ref in sync so useCheckoutActions can block advance before rendering the next step.
    // Only reflect "no methods" after the promise has actually resolved — while pending, treat as
    // "not yet known" and leave the ref at its default `false` so the advance guard doesn't fire
    // pre-resolve. useCheckoutActions consults this ref inside the SHIPPING_ADDRESS submit-completes
    // effect, which by construction runs after the action response has landed and the map is known.
    noShippingMethodsRef.current =
        shippingMethodsResolved && !hasValidShippingMethodForEveryShipment(shippingMethodsMap);

    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    const enableMultiAddress = shipmentDistribution.enableMultiAddress;
    const hasMultipleDeliveryAddresses = shipmentDistribution.hasMultipleDeliveryAddresses;
    const deliveryShipments = shipmentDistribution.deliveryShipments;
    // this tracks if the user pressed the multi address mode toggle button
    const [selectedMultiAddressMode, setSelectedMultiAddressMode] = useState(hasMultipleDeliveryAddresses);
    const handleToggleShippingAddressMode = () => {
        setSelectedMultiAddressMode((prev) => !prev);
    };
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const { t: tBopis } = useTranslation('extBopis');
    const { label: pickupProceedButtonLabel, onClick: onPickupContinueClick } = handlePickupContinueAction(
        hasPickupItems,
        showAddressAndOptions,
        goToStep,
        STEPS,
        tBopis as (key: string) => string
    );
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    const analytics = useAnalytics();
    const hasTrackedCheckoutStartRef = useRef(false);
    const previousStepRef = useRef<CheckoutStep | null>(null);

    useEffect(() => {
        // Only track checkout start once on mount if baseket is not empty
        if (!hasTrackedCheckoutStartRef.current && cart?.productItems && cart.productItems.length > 0) {
            void analytics.trackCheckoutStart({
                basket: cart,
            });
            hasTrackedCheckoutStartRef.current = true;
        }
    }, [analytics, cart]);

    useEffect(() => {
        if (previousStepRef.current !== step && cart?.productItems && cart.productItems.length > 0) {
            const stepName = Object.keys(STEPS).find((key) => STEPS[key as keyof typeof STEPS] === step) || '';
            void analytics.trackCheckoutStep({
                stepName,
                stepNumber: step,
                basket: cart,
            });
            previousStepRef.current = step;
        }
    }, [analytics, step, STEPS, cart]);

    const isPlacingOrder = placeOrderFetcher.state === 'submitting';
    const [isPlaceOrderPending, setIsPlaceOrderPending] = useState(false);
    // Synchronous in-flight guard. `isPlaceOrderPending` is React state, so two clicks
    // within the same paint both see the old `false` value and both run the handler.
    // Basket-consumption semantics in SCAPI usually short-circuit the second createOrder,
    // but relying on that is fragile (race window, future extensions that don't follow
    // the basket-bound pattern). Cheaper to bail synchronously here.
    const placeOrderInFlightRef = useRef(false);
    const [shippingMethodValidationError, setShippingMethodValidationError] = useState<string | null>(null);

    // Form submission handlers - delegated to checkout actions hook
    const handleContactSubmit = submitContactInfo;
    const handleShippingAddressSubmit = submitShippingAddress;
    const handleShippingOptionsSubmit = (formData: FormData) => {
        setShippingMethodValidationError(null);
        submitShippingOptions(formData);
    };
    const handlePaymentSubmit = submitPayment;

    const handlePlaceOrderSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        // Synchronous double-submit guard: the React-state pending flag updates on the
        // next render, so two clicks in the same paint would both pass it. The ref bails
        // the second click before any work starts.
        if (placeOrderInFlightRef.current) {
            return;
        }

        // Block submission while a non-payment section is being edited. The Place Order button
        // is hidden via the render condition, but this guard handles edge cases (e.g. mobile
        // fixed bar overlap, stale UI state, or buttons without explicit type="button").
        if (editingStep !== null && editingStep !== STEPS.PAYMENT) {
            return;
        }

        // Validate that all non-empty shipments have a shipping method selected.
        // Without this, the request goes through payment sync -> server place-order round-trip
        // before the user sees the error, making the UI appear stuck.
        if (cart?.shipments && cart?.productItems) {
            const shipmentItemCounts = new Map<string, number>();
            for (const item of cart.productItems) {
                if (item.shipmentId) {
                    shipmentItemCounts.set(item.shipmentId, (shipmentItemCounts.get(item.shipmentId) || 0) + 1);
                }
            }
            const missingShippingMethod = cart.shipments.some(
                (shipment) =>
                    shipment.shipmentId &&
                    (shipmentItemCounts.get(shipment.shipmentId) || 0) > 0 &&
                    !shipment.shippingMethod
            );
            if (missingShippingMethod) {
                setShippingMethodValidationError(tErrors('checkout.shippingMethodRequired'));
                goToStep(STEPS.SHIPPING_OPTIONS);
                return;
            }
        }

        // Payment-extension delegation. The storefront owns the surrounding
        // sequence (prepare -> extension's onPlaceOrder -> finalize) so the
        // extension only does payment work. See `PaymentSubmissionRef.onPlaceOrder`.
        const onPlaceOrder = paymentSubmissionRef.current.onPlaceOrder;
        if (onPlaceOrder) {
            placeOrderInFlightRef.current = true;
            setIsPlaceOrderPending(true);
            // Checkout correlation id - shared across the cart-to-confirmation journey so log
            // lines from any checkout-flow request can be stitched together. Sent on the
            // standard `x-correlation-id` header that the storefront's correlationMiddleware
            // already consumes, so the logger picks it up automatically with no per-route
            // plumbing. Extensions can echo the same header on their own routes.
            const correlationId = getOrCreateCheckoutCorrelationId();
            const correlationHeaders = { 'x-correlation-id': correlationId };
            void (async () => {
                let orderNo: string | null = null;
                try {
                    // 0. Persist billing address from the extension's getter, if any.
                    //    Sheet flows do not call submit-payment, so basket.billingAddress
                    //    would otherwise still hold the shipping-step default.
                    const billing = paymentSubmissionRef.current.billingAddressGetter?.();
                    if (billing) {
                        const billingResp = await fetch(resourceRoutes.updateBasketBillingAddress, {
                            method: 'POST',
                            headers: { ...correlationHeaders, 'Content-Type': 'application/json' },
                            body: JSON.stringify(billing),
                        });
                        if (!billingResp.ok) {
                            // Fail-closed: if we cannot persist billing, do not delegate
                            // to the extension with stale billing on the basket.
                            // eslint-disable-next-line no-console
                            console.error('[Checkout] failed to persist billing before onPlaceOrder', {
                                correlationId,
                                status: billingResp.status,
                            });
                            placeOrderInFlightRef.current = false;
                            setIsPlaceOrderPending(false);
                            showToast?.(tErrors('checkout.placeOrderFailed'), 'error');
                            return;
                        }
                    }

                    // 1. Prepare: validate basket, resolve multiship shipments, recalculate.
                    const prepareResponse = await fetch(resourceRoutes.placeOrderPrepare, {
                        method: 'POST',
                        headers: correlationHeaders,
                    });
                    if (!prepareResponse.ok) {
                        const prepareBody = await prepareResponse.json().catch(() => ({}));
                        // eslint-disable-next-line no-console
                        console.error('[Checkout] place-order-prepare rejected the basket', {
                            correlationId,
                            status: prepareResponse.status,
                            body: prepareBody,
                        });
                        placeOrderInFlightRef.current = false;
                        setIsPlaceOrderPending(false);
                        showToast?.(tErrors('checkout.placeOrderFailed'), 'error');
                        return;
                    }

                    // 2. Extension owns createOrder + PSP confirm. Resolves to orderNo or null.
                    // The extension also owns its own latency bound; see PaymentSubmissionRef.onPlaceOrder.
                    const onPlaceOrderResult = await onPlaceOrder();
                    if (!onPlaceOrderResult) {
                        // Extension surfaced its own error UI before resolving null.
                        placeOrderInFlightRef.current = false;
                        setIsPlaceOrderPending(false);
                        return;
                    }
                    if (typeof onPlaceOrderResult !== 'string' || !onPlaceOrderResult.trim()) {
                        // Extension contract is `Promise<string | null>`, matching SCAPI's
                        // OrderNo type.
                        // eslint-disable-next-line no-console
                        console.error(
                            '[Checkout] onPlaceOrder returned a non-string value; extension contract expects Promise<string | null>',
                            { correlationId, returned: onPlaceOrderResult }
                        );
                        placeOrderInFlightRef.current = false;
                        setIsPlaceOrderPending(false);
                        showToast?.(tErrors('checkout.placeOrderFailed'), 'error');
                        return;
                    }
                    orderNo = onPlaceOrderResult;

                    // 3. Finalize: profile saves + basket teardown + confirmation URL.
                    const finalizeFormData = buildPlaceOrderFinalizeFormData();
                    finalizeFormData.set('orderNo', orderNo);
                    const finalizeResponse = await fetch(resourceRoutes.placeOrderFinalize, {
                        method: 'POST',
                        headers: correlationHeaders,
                        body: finalizeFormData,
                    });
                    const rawBody = await finalizeResponse.text();
                    let body: { success?: boolean; redirectUrl?: string } = {};
                    let parseError: unknown;
                    try {
                        body = rawBody ? JSON.parse(rawBody) : {};
                    } catch (error) {
                        parseError = error;
                    }
                    if (body.redirectUrl) {
                        // The server returned a redirect URL. Two sub-cases:
                        //   - Success: navigate to confirmation as normal.
                        //   - !success: the server tore the basket down (e.g. getOrder
                        //     failed after retry, but the order itself was already created
                        //     by onPlaceOrder). Still navigate, since the order is real -
                        //     out-of-band reconciliation handles any missed profile saves.
                        // Intentionally leave placeOrderInFlightRef set: navigation is in
                        // progress; clearing it would re-enable the button mid-redirect.
                        if (!finalizeResponse.ok || !body.success) {
                            // eslint-disable-next-line no-console
                            console.error(
                                '[Checkout] place-order-finalize failed with order created; navigating to confirmation for reconciliation',
                                { correlationId, orderNo, status: finalizeResponse.status, rawBody, parseError }
                            );
                        }
                        clearCheckoutCorrelationId();
                        window.location.href = body.redirectUrl;
                    } else {
                        // eslint-disable-next-line no-console
                        console.error(
                            '[Checkout] place-order-finalize returned non-success; order may need manual reconciliation',
                            { correlationId, orderNo, status: finalizeResponse.status, rawBody, parseError }
                        );
                        placeOrderInFlightRef.current = false;
                        setIsPlaceOrderPending(false);
                        showToast?.(tErrors('checkout.placeOrderFailed'), 'error');
                    }
                } catch (error) {
                    // eslint-disable-next-line no-console
                    console.error('[Checkout] place-order delegation failed', { correlationId, orderNo, error });
                    if (orderNo) {
                        // Network drop / browser timeout on the finalize fetch, but
                        // onPlaceOrder already created the order. Build a site-prefixed
                        // confirmation URL on the client and hard-navigate; the
                        // confirmation loader's idempotent destroyBasket clears the
                        // cookie. Out-of-band reconciliation handles missed profile saves.
                        const confirmationUrl = buildUrl({
                            to: routeHref(routes.orderConfirmation, { orderNo }),
                            urlConfig: config.url,
                            params: { siteId: siteRef, localeId: localeRef },
                        });
                        clearCheckoutCorrelationId();
                        window.location.href = confirmationUrl;
                        return;
                    }
                    placeOrderInFlightRef.current = false;
                    setIsPlaceOrderPending(false);
                    showToast?.(tErrors('checkout.placeOrderFailed'), 'error');
                }
            })();
            return;
        }

        const paymentData = paymentSubmissionRef.current.formDataGetter?.();
        const basketAlreadyHasPayment = Boolean(cart?.paymentInstruments?.[0]);

        // Payment must be submitted before place order when the basket has no instrument, or
        // when the user's current selection differs from what's on the basket (e.g. returning
        // shopper switched from saved card to "enter new card").
        const needsPaymentSync =
            paymentData && (!basketAlreadyHasPayment || doesPaymentSelectionDiffer(paymentData, cart));

        if (needsPaymentSync) {
            // Validate client-side before submitting so the user sees inline errors.
            // Runs for new card entry (card fields) and for different billing address (billing fields).
            if (!paymentData.useSavedPaymentMethod || paymentData.useDifferentBilling) {
                const schema = createPaymentSchema(t);
                const result = schema.safeParse(paymentData);
                if (!result.success) {
                    const { setFormErrors } = paymentSubmissionRef.current;
                    if (setFormErrors) {
                        const fieldErrors: Record<string, { type: string; message: string }> = {};
                        for (const issue of result.error.issues) {
                            const field = issue.path[0]?.toString();
                            if (field && !fieldErrors[field]) {
                                fieldErrors[field] = { type: 'validation', message: issue.message };
                            }
                        }
                        setFormErrors(fieldErrors);
                    }
                    goToStep(STEPS.PAYMENT);
                    return;
                }
            }

            placeOrderInFlightRef.current = true;
            setIsPlaceOrderPending(true);
            paymentSubmissionRef.current.shouldPlaceOrderAfterPayment = true;
            paymentSubmissionRef.current.options = {
                savePaymentToProfile: paymentData.savePaymentToProfile ?? false,
                useDifferentBilling: paymentData.useDifferentBilling,
            };
            submitPayment(paymentData);
        } else {
            placeOrderInFlightRef.current = true;
            setIsPlaceOrderPending(true);
            paymentSubmissionRef.current.shouldPlaceOrderAfterPayment = false;
            paymentSubmissionRef.current.options = paymentData
                ? {
                      savePaymentToProfile: paymentData.savePaymentToProfile ?? false,
                      useDifferentBilling: paymentData.useDifferentBilling,
                  }
                : null;
            submitPlaceOrder();
        }
    };

    // Step state logic - centralized in container for single page layout
    // For single page layout: show all steps, current step is editable, completed steps show summary
    const contactInfoState = {
        isCompleted: step > STEPS.CONTACT_INFO,
        isEditing: step === STEPS.CONTACT_INFO || editingStep === STEPS.CONTACT_INFO,
        onEdit: () => goToStep(STEPS.CONTACT_INFO),
    };

    const shippingAddressState = {
        isCompleted: step > STEPS.SHIPPING_ADDRESS,
        isEditing: step === STEPS.SHIPPING_ADDRESS || editingStep === STEPS.SHIPPING_ADDRESS,
        onEdit: () => {
            goToStep(STEPS.SHIPPING_ADDRESS);
        },
    };

    const shippingOptionsState = {
        isCompleted: step > STEPS.SHIPPING_OPTIONS,
        isEditing: step === STEPS.SHIPPING_OPTIONS || editingStep === STEPS.SHIPPING_OPTIONS,
        onEdit: () => goToStep(STEPS.SHIPPING_OPTIONS),
    };

    // Block payment when shipping is required, an address exists, but no valid delivery methods
    // are available. A stale shipping method on the basket can make computedStep overshoot to
    // PAYMENT on reload; this prevents the payment section from opening in that case.
    //
    // Also block while the streamed shipping-methods map is still pending (`!shippingMethodsResolved`)
    // whenever an address is present. With prefill streamed, a returning customer with a complete
    // saved profile computes to PLACE_ORDER on the post-prefill paint before the methods map lands;
    // if that saved address turns out to be undeliverable, the reload-pin below would bounce them
    // back to Shipping Address — a visible PLACE_ORDER → Shipping Address flash. Gating the section
    // on resolution holds Place Order/Payment until methods confirm, so the shopper only ever sees
    // the correct step.
    const hasShippingAddress = cart?.shipments?.some((s) => s.shippingAddress && !isAddressEmpty(s.shippingAddress));
    const shippingBlocked =
        showAddressAndOptions && !!hasShippingAddress && (!shippingMethodsResolved || noShippingMethodsRef.current);

    const paymentState = {
        isCompleted: step > STEPS.PAYMENT && !shippingBlocked,
        isEditing: (step === STEPS.PAYMENT || editingStep === STEPS.PAYMENT) && !shippingBlocked,
        onEdit: () => goToStep(STEPS.PAYMENT),
        // Guest: show only "Payment" title until contact, shipping address and options are done
        disabled: (!isRegisteredUser && step < STEPS.PAYMENT) || shippingBlocked,
    };

    // Surface blocking API errors as error toasts for immediate visibility.
    useEffect(() => {
        if (
            placeOrderFetcher.state === 'idle' &&
            placeOrderFetcher.data &&
            !placeOrderFetcher.data.success &&
            placeOrderFetcher.data.error
        ) {
            placeOrderInFlightRef.current = false;
            setIsPlaceOrderPending(false);
            const error = getCheckoutDisplayError(placeOrderFetcher.data, undefined, tAny);
            if (error) showToast?.(error, 'error');
        }
    }, [placeOrderFetcher.state, placeOrderFetcher.data, showToast, tAny]);

    useEffect(() => {
        if (contactFetcher.state !== 'idle' || !contactFetcher.data || contactFetcher.data.success) return;
        const error = getCheckoutDisplayError(contactFetcher.data, 'contactInfo', tAny);
        if (error) showToast?.(error, 'error');
    }, [contactFetcher.state, contactFetcher.data, showToast, tAny]);

    useEffect(() => {
        if (
            shippingAddressFetcher.state !== 'idle' ||
            !shippingAddressFetcher.data ||
            shippingAddressFetcher.data.success
        )
            return;
        const error = getCheckoutDisplayError(shippingAddressFetcher.data, 'shippingAddress', tAny);
        if (error) showToast?.(error, 'error');
    }, [shippingAddressFetcher.state, shippingAddressFetcher.data, showToast, tAny]);

    useEffect(() => {
        if (
            shippingOptionsFetcher.state !== 'idle' ||
            !shippingOptionsFetcher.data ||
            shippingOptionsFetcher.data.success
        )
            return;
        const error = getCheckoutDisplayError(shippingOptionsFetcher.data, 'shippingOptions', tAny);
        if (error) showToast?.(error, 'error');
    }, [shippingOptionsFetcher.state, shippingOptionsFetcher.data, showToast, tAny]);

    useEffect(() => {
        if (paymentFetcher.state !== 'idle' || !paymentFetcher.data || paymentFetcher.data.success) return;
        const error = getCheckoutDisplayError(paymentFetcher.data, 'payment', tAny);
        if (error) showToast?.(error, 'error');
    }, [paymentFetcher.state, paymentFetcher.data, showToast, tAny]);

    // Place the order once the payment fetcher we kicked off resolves; reset on failure so we
    // never place an order without valid payment.
    //
    // A fetcher reads `idle` both before its submission starts and after it completes, so the
    // raw `state === 'idle'` check cannot tell "payment not submitted yet" from "payment done".
    // We must only react to the transition INTO idle (the fetcher was in flight and just
    // finished). Acting on the pre-submission idle tick — which now occurs because React Router
    // defers fetcher state updates, letting an unrelated render run while the fetcher is still
    // idle — would misread "not started" as "payment failed" and silently cancel place order.
    const previousPaymentFetcherStateRef = useRef(paymentFetcher.state);
    useEffect(() => {
        const previousState = previousPaymentFetcherStateRef.current;
        previousPaymentFetcherStateRef.current = paymentFetcher.state;

        if (!paymentSubmissionRef.current.shouldPlaceOrderAfterPayment) return;
        const paymentJustResolved = paymentFetcher.state === 'idle' && previousState !== 'idle';
        if (!paymentJustResolved) return;

        if (paymentFetcher.data?.success) {
            paymentSubmissionRef.current.shouldPlaceOrderAfterPayment = false;
            submitPlaceOrder();
        } else {
            paymentSubmissionRef.current.shouldPlaceOrderAfterPayment = false;
            placeOrderInFlightRef.current = false;
            setIsPlaceOrderPending(false);
        }
    }, [paymentFetcher.state, paymentFetcher.data, submitPlaceOrder]);

    // Reload-only: pin to Shipping Address when basket already has an address but no valid delivery methods.
    // Skipped when there's an active submission so the post-submit effect is the single toast source.
    // Waits for `shippingMethodsResolved` so we don't fire while the streamed promise is still pending.
    const reloadPinDoneRef = useRef(false);
    useEffect(() => {
        if (reloadPinDoneRef.current || !cart || !basketHydrated) return;
        if (!shippingMethodsResolved) return;
        if (shippingAddressFetcher.state !== 'idle' || shippingAddressFetcher.data) return;
        const hasAddress = cart.shipments?.some((s) => s.shippingAddress && !isAddressEmpty(s.shippingAddress));
        if (!hasAddress) return;
        if (!hasValidShippingMethodForEveryShipment(shippingMethodsMap)) {
            reloadPinDoneRef.current = true;
            pinToStep?.(STEPS.SHIPPING_ADDRESS);
            showToast?.(tErrors('checkout.noShippingMethodsForAddress'), 'error');
        }
    }, [
        cart,
        basketHydrated,
        shippingMethodsMap,
        shippingMethodsResolved,
        shippingAddressFetcher.state,
        shippingAddressFetcher.data,
        pinToStep,
        STEPS,
        showToast,
        tErrors,
    ]);

    // After each shipping-address submit with no delivery methods: toast + pin to Shipping Address.
    // The noShippingMethodsRef guard in useCheckoutActions prevents the flash when the action
    // response includes shipping methods. This pinToStep call is still needed as a fallback when
    // the shipping methods map updates via loader revalidation after the guard has already fired.
    // Also waits for `shippingMethodsResolved` so a pending stream doesn't trigger a false toast.
    const noMethodsToastShownRef = useRef<unknown>(null);
    useEffect(() => {
        if (shippingAddressFetcher.state !== 'idle' || !shippingAddressFetcher.data?.success) return;
        if (noMethodsToastShownRef.current === shippingAddressFetcher.data) return;
        if (!shippingMethodsResolved) return;
        if (!hasValidShippingMethodForEveryShipment(shippingMethodsMap)) {
            noMethodsToastShownRef.current = shippingAddressFetcher.data;
            showToast?.(tErrors('checkout.noShippingMethodsForAddress'), 'error');
            pinToStep?.(STEPS.SHIPPING_ADDRESS);
        }
    }, [
        shippingAddressFetcher.state,
        shippingAddressFetcher.data,
        shippingMethodsMap,
        shippingMethodsResolved,
        showToast,
        tErrors,
        pinToStep,
        STEPS,
    ]);

    if (!cart || !basketHydrated) {
        return <CheckoutSkeleton />;
    }

    if (!cart.basketId || !cart.productItems || cart.productItems.length === 0) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <Card className="w-full max-w-md">
                    <CardContent className="pt-6">
                        <Typography variant="muted" className="text-center">
                            {t('common.emptyCart')}
                        </Typography>
                    </CardContent>
                </Card>
            </div>
        );
    }

    let shippingAddressComponent = (
        <ShippingAddress
            onSubmit={handleShippingAddressSubmit}
            isLoading={isSubmitting('shipping-address')}
            actionData={shippingAddressFetcher.data}
            // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
            enableMultiAddress={enableMultiAddress}
            handleToggleShippingAddressMode={handleToggleShippingAddressMode}
            // @sfdc-extension-block-end SFDC_EXT_MULTISHIP
            {...shippingAddressState}
        />
    );
    const defaultShipmentId = cart?.shipments?.[0]?.shipmentId ?? 'me';
    const shippingAddressSubmittedThisSession = shippingAddressFetcher.data?.success === true;
    let shippingOptionsComponent = shippingMethodsResolved ? (
        <ShippingOptions
            onSubmit={handleShippingOptionsSubmit}
            onAutoSubmit={submitShippingOptionsForRecalculation}
            isLoading={isSubmitting('shipping-options')}
            actionData={shippingOptionsFetcher.data}
            shippingMethods={shippingMethodsMap?.[defaultShipmentId]}
            validationError={shippingMethodValidationError}
            justEnteredAddress={shippingAddressSubmittedThisSession}
            {...shippingOptionsState}
        />
    ) : (
        <ShippingOptionsSkeleton />
    );

    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    // this is true if has multiple delivery addresses or user selected multi address mode and isediting addresses
    const isMultiAddressMode = shippingAddressState.isEditing ? selectedMultiAddressMode : hasMultipleDeliveryAddresses;
    if (isMultiAddressMode) {
        shippingAddressComponent = (
            <ShippingMultiAddressWithData
                isLoading={isSubmitting('shipping-address')}
                actionData={shippingAddressFetcher.data}
                productMapPromise={productMapPromise}
                isDeliveryProductItem={isDeliveryProductItem}
                deliveryShipments={deliveryShipments}
                handleToggleShippingAddressMode={handleToggleShippingAddressMode}
                onSubmit={handleShippingAddressSubmit}
                hasMultipleDeliveryAddresses={hasMultipleDeliveryAddresses}
                {...shippingAddressState}
            />
        );
        shippingOptionsComponent = shippingMethodsResolved ? (
            <ShippingMultiOptions
                onSubmit={handleShippingOptionsSubmit}
                isLoading={isSubmitting('shipping-options')}
                actionData={shippingOptionsFetcher.data}
                shipments={deliveryShipments}
                shippingMethodsMap={shippingMethodsMap ?? {}}
                {...shippingOptionsState}
            />
        ) : (
            <ShippingOptionsSkeleton />
        );
    }
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP

    const showPlaceOrderSection =
        step >= STEPS.PAYMENT && (editingStep === null || editingStep === STEPS.PAYMENT) && !shippingBlocked;
    const isEstimate = cart ? isOrderTotalEstimated(cart) : true;

    const showSessionExpiredBanner =
        isUnauthorizedError(contactFetcher.data) ||
        isUnauthorizedError(shippingAddressFetcher.data) ||
        isUnauthorizedError(shippingOptionsFetcher.data) ||
        isUnauthorizedError(paymentFetcher.data) ||
        isUnauthorizedError(placeOrderFetcher.data);

    const isSaving =
        isSubmitting('contact') ||
        isSubmitting('shipping-address') ||
        isSubmitting('shipping-options') ||
        isSubmitting('payment');

    // Single live region handles both section-save and place-order states.
    // isPlaceOrderPending takes priority: it can overlap with isSubmitting('payment')
    // when payment must be submitted before place order, and "Placing order" is the
    // more specific status the shopper should hear in that case.
    let statusMessage = '';
    if (isPlaceOrderPending) {
        statusMessage = t('placingOrderStatus');
    } else if (isSaving) {
        statusMessage = t('savingStatus');
    }

    return (
        <div data-section="checkout" className="bg-background">
            {shippingMethodsMapPromise && (
                <Suspense fallback={null}>
                    <ShippingMethodsBridge
                        promise={shippingMethodsMapPromise}
                        onResolved={handleShippingMethodsResolved}
                    />
                </Suspense>
            )}
            <span role="status" aria-live="polite" className="sr-only">
                {statusMessage}
            </span>
            <UITarget targetId="sfcc.checkout.page.before" />
            <div className="section-container pt-8 pb-6">
                <Typography variant="h2" as="h1" className="mb-8">
                    {t('pageTitle')}
                </Typography>
                {showSessionExpiredBanner && (
                    <div className="mb-6">
                        <SessionExpiredBanner returnUrl={routes.checkout} />
                    </div>
                )}
                {/* Mobile Order Summary + My Cart */}
                <div className="md:hidden mb-6 border border-border">
                    <Suspense fallback={<OrderSummarySkeleton />}>
                        {/* Pass lazy <OrderSummary /> as children to preserve checkout route code-splitting. */}
                        <OrderSummaryMobileAccordion
                            basket={cart}
                            defaultExpanded={false}
                            showPrice
                            isEstimate={isEstimate}>
                            <OrderSummary
                                basket={cart}
                                showCartItems={false}
                                showHeading={false}
                                showPromoCodeForm={true}
                                productsByItemId={{}}
                                isEstimate={isEstimate}
                                showTotal={false}
                                showCheckoutAction={false}
                                className="border-none !py-0 [--cart-summary-px:1rem]"
                            />
                        </OrderSummaryMobileAccordion>
                    </Suspense>

                    <Suspense fallback={<MyCartSkeleton itemCount={cart?.productItems?.length || 2} />}>
                        <MyCartWithData
                            basket={cart}
                            productMapPromise={productMapPromise}
                            promotionsPromise={promotionsPromise}
                        />
                    </Suspense>
                </div>

                {/* Grid children are ordered in the DOM to match the desktop visual reading
                    order (main → sidebar → place order), so keyboard Tab flows the same way
                    the eye scans. Visual position on each breakpoint is applied via order-*. */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="space-y-6 md:order-2 lg:order-1 lg:col-span-2 [&_[data-slot=card-header].border-b]:pb-4">
                        <UITarget targetId="sfcc.checkout.mainContent.before" />
                        {/* Express Payments - Apple Pay, Google Pay, Amazon Pay, PayPal & Venmo (mobile only) */}
                        <UITarget targetId="sfcc.checkout.expressPayments.header.before" />
                        <Suspense fallback={<ExpressPaymentsSkeleton />}>
                            <UITarget targetId="sfcc.checkout.expressPayments.before" />
                            <UITarget targetId="sfcc.checkout.expressPayments">
                                <ExpressPayments separatorText={t('expressPayments.separator')} />
                            </UITarget>
                            <UITarget targetId="sfcc.checkout.expressPayments.after" />
                        </Suspense>

                        <UITarget targetId="sfcc.checkout.contactInfo.header.before" />
                        <Suspense fallback={<ContactInfoSkeleton />}>
                            <UITarget targetId="sfcc.checkout.contactInfo.before" />
                            <UITarget targetId="sfcc.checkout.contactInfo">
                                {!cart ? (
                                    <ContactInfoSkeleton />
                                ) : (
                                    <ContactInfo
                                        onSubmit={handleContactSubmit}
                                        isLoading={isSubmitting('contact')}
                                        actionData={contactFetcher.data}
                                        otpFlowActiveRef={otpFlowActiveRef}
                                        onRegisteredUserChoseGuest={handleRegisteredUserChoseGuest}
                                        onPasswordlessOtpVerified={handlePasswordlessOtpVerifiedAtContact}
                                        suppressRegisteredEmailLoginHints={hideCreateAccountAfterSkippedPasswordlessOtp}
                                        emailVerificationEnabled={emailVerificationEnabled}
                                        {...contactInfoState}
                                    />
                                )}
                            </UITarget>
                            <UITarget targetId="sfcc.checkout.contactInfo.after" />
                        </Suspense>

                        {/* @sfdc-extension-block-start SFDC_EXT_BOPIS */}
                        {/* Store Pickup Information */}
                        {hasPickupItems && (
                            <Suspense fallback={<PickupSkeleton />}>
                                <CheckoutPickupWithData
                                    cart={cart}
                                    productMapPromise={productMapPromise}
                                    isEditing={editingStep === CHECKOUT_STEPS.PICKUP}
                                    onEdit={() => goToStep(CHECKOUT_STEPS.PICKUP)}
                                    onContinue={onPickupContinueClick}
                                    continueButtonLabel={pickupProceedButtonLabel}
                                />
                            </Suspense>
                        )}

                        {/* @sfdc-extension-block-end SFDC_EXT_BOPIS */}

                        {/* Shipping Address & Options */}
                        {showAddressAndOptions && (
                            <>
                                <UITarget targetId="sfcc.checkout.shippingAddress.header.before" />
                                <Suspense fallback={<ShippingAddressSkeleton />}>
                                    <UITarget targetId="sfcc.checkout.shippingAddress.before" />
                                    <UITarget targetId="sfcc.checkout.shippingAddress">
                                        {shippingAddressComponent}
                                    </UITarget>
                                    <UITarget targetId="sfcc.checkout.shippingAddress.after" />
                                </Suspense>

                                <UITarget targetId="sfcc.checkout.shippingOptions.header.before" />
                                <Suspense fallback={<ShippingOptionsSkeleton />}>
                                    <UITarget targetId="sfcc.checkout.shippingOptions.before" />
                                    <UITarget targetId="sfcc.checkout.shippingOptions">
                                        {shippingOptionsComponent}
                                    </UITarget>
                                    <UITarget targetId="sfcc.checkout.shippingOptions.after" />
                                </Suspense>
                            </>
                        )}

                        <PaymentSubmissionRefProvider refValue={paymentSubmissionRef}>
                            <UITarget targetId="sfcc.checkout.payment.header.before" />
                            <Suspense fallback={<PaymentSkeleton />}>
                                <UITarget targetId="sfcc.checkout.payment.before" />
                                <UITarget targetId="sfcc.checkout.payment">
                                    <Payment
                                        onSubmit={handlePaymentSubmit}
                                        isLoading={isSubmitting('payment')}
                                        actionData={paymentFetcher.data}
                                        showUseDifferentBilling={showAddressAndOptions}
                                        paymentSubmissionRef={paymentSubmissionRef}
                                        hidePaymentSaveCheckbox={shouldCreateAccount}
                                        {...paymentState}
                                    />
                                </UITarget>
                                <UITarget targetId="sfcc.checkout.payment.after" />
                            </Suspense>
                        </PaymentSubmissionRefProvider>

                        {/* Create Account Option - Show for guest users when Place Order is visible (step >= PAYMENT).
                           Kept in main content so it tabs before Promo Code and Place Order. */}
                        {showPlaceOrderSection && step >= STEPS.PAYMENT && (
                            <div className="w-full">
                                <UITarget targetId="sfcc.checkout.createAccount.before" />
                                <UITarget targetId="sfcc.checkout.createAccount">
                                    <GuestAccountCreation
                                        cart={cart}
                                        customerProfile={customerProfile}
                                        onSaved={handleCreateAccountPreferenceChange}
                                        savePaymentToProfile={
                                            paymentSubmissionRef.current.options?.savePaymentToProfile
                                        }
                                        showToast={showToast}
                                        hideCreateAccountOption={
                                            hideCreateAccountAfterSkippedPasswordlessOtp ||
                                            emailVerificationEnabled === false
                                        }
                                    />
                                </UITarget>
                                <UITarget targetId="sfcc.checkout.createAccount.after" />
                            </div>
                        )}
                        <UITarget targetId="sfcc.checkout.mainContent.after" />
                    </div>

                    <div
                        className="hidden md:block md:order-1 lg:order-2 lg:col-span-1"
                        data-testid="checkout-order-summary-sidebar">
                        <UITarget targetId="sfcc.checkout.sidebar.before" />
                        <div className="space-y-6">
                            {/* Order Summary + Cart Items */}
                            <Card className="[--cart-divider-extend:1.5rem] gap-4 py-4 pb-0">
                                <CardHeader className="border-b-[1px] border-border pb-2">
                                    <CardTitle
                                        as="h2"
                                        className="text-2xl font-bold tracking-tight text-card-foreground">
                                        {t('orderSummary.title')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <UITarget targetId="sfcc.checkout.orderSummary.before" />
                                    <UITarget targetId="sfcc.checkout.orderSummary">
                                        <Suspense fallback={<OrderSummarySkeleton />}>
                                            <OrderSummary
                                                basket={cart}
                                                showCartItems={false}
                                                showHeading={false}
                                                showPromoCodeForm={true}
                                                productsByItemId={{}}
                                                isEstimate={isEstimate}
                                                className="border-none !py-0 [&_[data-slot=card-content]]:px-0 [--cart-summary-px:1.5rem]"
                                            />
                                        </Suspense>
                                    </UITarget>
                                    <UITarget targetId="sfcc.checkout.orderSummary.after" />

                                    <hr className="border-border -mx-6" />

                                    <UITarget targetId="sfcc.checkout.myCart.before" />
                                    <UITarget targetId="sfcc.checkout.myCart">
                                        <Suspense
                                            fallback={<MyCartSkeleton itemCount={cart?.productItems?.length || 2} />}>
                                            <MyCartWithData
                                                basket={cart}
                                                productMapPromise={productMapPromise}
                                                promotionsPromise={promotionsPromise}
                                            />
                                        </Suspense>
                                    </UITarget>
                                    <UITarget targetId="sfcc.checkout.myCart.after" />
                                </CardContent>
                            </Card>
                        </div>
                        <UITarget targetId="sfcc.checkout.sidebar.after" />
                    </div>

                    {showPlaceOrderSection && (
                        <div className="flex flex-col items-end gap-4 w-full md:order-3 lg:order-3 lg:col-start-1 lg:col-span-2 lg:-mt-4">
                            <UITarget targetId="sfcc.checkout.placeOrder.before" />
                            <UITarget targetId="sfcc.checkout.placeOrder">
                                <form
                                    data-checkout-mobile-bar
                                    onSubmit={handlePlaceOrderSubmit}
                                    className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background px-6 py-4 lg:static lg:inset-auto lg:z-auto lg:w-full lg:border-0 lg:bg-transparent lg:p-0">
                                    <Button
                                        type="submit"
                                        disabled={
                                            isPlacingOrder ||
                                            isPlaceOrderPending ||
                                            isSubmitting('payment') ||
                                            paymentFetcher.state === 'submitting'
                                        }
                                        className="w-full shadow-2xs"
                                        size="lg">
                                        <Lock className="size-4" />
                                        {isPlacingOrder || isPlaceOrderPending || isSubmitting('payment')
                                            ? t('placeOrder.processing')
                                            : t('placeOrder.button', {
                                                  total: formatCurrency(
                                                      cart?.orderTotal ?? cart?.productTotal ?? 0,
                                                      i18n.language,
                                                      currency
                                                  ),
                                              })}
                                    </Button>
                                </form>
                            </UITarget>
                            <UITarget targetId="sfcc.checkout.placeOrder.after" />
                        </div>
                    )}
                </div>
            </div>
            <UITarget targetId="sfcc.checkout.page.after" />
            {isRegistrationInProgress && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60">
                    <Spinner size="lg" />
                </div>
            )}
        </div>
    );
}
