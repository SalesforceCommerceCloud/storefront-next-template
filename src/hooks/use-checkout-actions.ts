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
import { useFetcher } from 'react-router';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useCheckoutContext } from '@/hooks/use-checkout';
import { useBasket, useBasketUpdater } from '@/providers/basket';
import type { ContactInfoData, PaymentData } from '@/lib/checkout/schemas';
import type { ActionError } from '@/lib/error-codes';
import type { ShopperBasketsV2 } from '@/scapi';
import type { CheckoutActionData } from '@/components/checkout/types';
import {
    CHECKOUT_STEPS,
    CHECKOUT_ACTION_INTENTS,
    type CheckoutStep,
} from '@/components/checkout/utils/checkout-context-types';
import { resourceRoutes } from '@/route-paths';

/** Persists create-account intent across reloads (mirrors handleCreateAccountPreferenceChange). */
const SESSION_SHOULD_CREATE_ACCOUNT = 'shouldCreateAccount';

/**
 * Maps a checkout step to the `id` prop each section passes to `ToggleCard`.
 * Used to focus the just-saved section's title after `exitEditMode`, so
 * keyboard / screen-reader users don't lose focus (WCAG 2.4.3).
 */
const TOGGLE_CARD_ID_BY_STEP: Partial<Record<CheckoutStep, string>> = {
    [CHECKOUT_STEPS.CONTACT_INFO]: 'contact-info',
    [CHECKOUT_STEPS.SHIPPING_ADDRESS]: 'shipping-address',
    [CHECKOUT_STEPS.SHIPPING_OPTIONS]: 'shipping-options',
    [CHECKOUT_STEPS.PAYMENT]: 'payment',
};
/** Persists formatted contact phone when basket merge (e.g. OTP) drops it from the basket. */
const SESSION_CHECKOUT_CONTACT_PHONE = 'checkoutContactPhone';
/** Set by register-customer-selection while checkout registration OTP flow is active. */
const SESSION_REGISTERED_VIA_CHECKOUT = 'registeredViaCheckout';

const isBasketRevisionCurrent = (currentLastModified: string | undefined, responseLastModified: string) => {
    if (!currentLastModified) {
        return false;
    }

    const currentTimestamp = Date.parse(currentLastModified);
    const responseTimestamp = Date.parse(responseLastModified);
    if (Number.isNaN(currentTimestamp) || Number.isNaN(responseTimestamp)) {
        return currentLastModified === responseLastModified;
    }

    return currentTimestamp >= responseTimestamp;
};

/**
 * Action lifecycle states for tracking form submission progress.
 */
enum ActionState {
    /** No action has been submitted yet */
    NOT_STARTED = 'notStarted',
    /** Action was submitted, waiting for response */
    SUBMITTED = 'submitted',
    /** Response received, basket updated, waiting to exit edit mode */
    BASKET_UPDATED = 'basketUpdated',
    /** Edit mode exited, action complete */
    COMPLETED = 'completed',
}

/**
 * Tracks the current action submission lifecycle.
 * We must track the step here (not rely on editingStep from context) because
 * editingStep can change before action processing completes.
 */
type ActionLifecycle = {
    /** Which checkout step's action was submitted */
    step: CheckoutStep | null;
    /** Current state in the action lifecycle */
    state: ActionState;
    /**
     * When true, the basket is updated on success but exitEditMode is not called.
     * Used for shipping-method price recalculation submissions that should not advance
     * the checkout step (the shopper still needs to explicitly confirm their choice).
     */
    recalculating?: boolean;
};

/** Options passed when placing order (e.g. from payment form at time of Place Order click) */
export type PlaceOrderOptionsRef = MutableRefObject<{
    savePaymentToProfile?: boolean;
    useDifferentBilling?: boolean;
} | null>;

/** Single ref coordinating payment submission and place-order flow to avoid race conditions */
export type PaymentSubmissionRef = MutableRefObject<{
    formDataGetter: (() => PaymentData) | null;

    /**
     * Returns the billing address the shopper has currently selected in the
     * payment step, or `null` when no explicit billing is available.
     *
     * Extensions that replace `sfcc.checkout.payment` (payment sheets, hosted
     * fields) register this so the checkout can persist an authoritative
     * billing address to the basket before delegating to `onPlaceOrder`. The
     * default form-based Payment component also registers it, returning the
     * currently-typed billing when "billing differs" is checked and `null`
     * otherwise.
     *
     * Return `null` to signal "no explicit billing"; the checkout will not
     * touch `basket.billingAddress` in that case (the shipping-step default
     * remains in place).
     */
    billingAddressGetter: (() => ShopperBasketsV2.schemas['OrderAddress'] | null) | null;

    shouldPlaceOrderAfterPayment: boolean;
    options: { savePaymentToProfile?: boolean; useDifferentBilling?: boolean } | null;
    setFormErrors: ((errors: Record<string, { type: string; message: string }>) => void) | null;
    /**
     * When set, the Place Order click handler delegates the payment-to-order
     * step to this callback. The storefront wraps the call: it POSTs to
     * `/action/place-order-prepare` first (basket validation, multiship
     * resolution, totals refresh), invokes this callback to drive `createOrder`
     * and any PSP confirm, then POSTs to `/action/place-order-finalize`
     * (profile saves, basket teardown, navigation). The extension only owns
     * the payment work between the two storefront actions.
     *
     * Resolve with the orderNo on success, or `null` on failure after
     * surfacing the extension's own error UI.
     *
     * Latency: the framework imposes no client-side timeout because it
     * cannot reliably conclude a reasonable ceiling that applies to all
     * extensions in all situations - 3DS challenges can legitimately run
     * 30-90s, wallet flows resolve in seconds, and PSP redirects can run
     * minutes when the shopper switches to a banking app for OTP. The
     * extension should decide its own ceiling and act on it (e.g.
     * `AbortController` on the create-order fetch, PSP-SDK timeout hooks
     * for 3DS) and resolve `null` after surfacing its own error UI when
     * its budget elapses. A hung promise that never resolves leaves the
     * Place Order spinner spinning indefinitely.
     *
     * Extension components reach this ref via `usePaymentSubmissionRef()`
     * from `@/components/checkout/payment-submission-context`. Assign in a
     * `useEffect`, clear in cleanup so the registration is unwound when the
     * extension unmounts.
     *
     * `beforePlaceOrder` / `afterPlaceOrder` hooks do NOT fire on this path.
     * The hooks live inside `action.place-order`, which this flow bypasses.
     */
    onPlaceOrder: (() => Promise<string | null>) | null;
}>;

/**
 * Custom hook for managing checkout form actions using React Router fetchers.
 *
 * This hook provides functionality to submit checkout form data for each step
 * using React Router's useFetcher for handling form submissions without navigation.
 * Each fetcher is keyed to maintain separate state for each checkout step.
 *
 * @param options.paymentSubmissionRef - Coordination ref for the payment + place-order flow. See `PaymentSubmissionRef` for fields.
 * @param options.placeOrderOptionsRef - Optional ref for place-order options (legacy; use paymentSubmissionRef for new code)
 * @returns Object containing checkout action functions and fetcher states
 * @returns submitContactInfo - Function to submit contact information
 * @returns submitShippingAddress - Function to submit shipping address
 * @returns submitShippingOptions - Function to submit shipping options
 * @returns submitPayment - Function to submit payment information
 * @returns contactFetcher - React Router fetcher for contact info requests
 * @returns shippingAddressFetcher - React Router fetcher for shipping address requests
 * @returns shippingOptionsFetcher - React Router fetcher for shipping options requests
 * @returns paymentFetcher - React Router fetcher for payment requests
 * @returns isSubmitting - Function to check if a specific step is submitting
 */
/** When true, contact step should not advance (e.g. OTP modal is open or authorize in flight). */
export type OtpFlowActiveRef = MutableRefObject<boolean>;

/** When true, shipping address step should not advance (no valid shipping methods for address). */
export type NoShippingMethodsRef = MutableRefObject<boolean>;

export function useCheckoutActions(options?: {
    paymentSubmissionRef?: PaymentSubmissionRef;
    placeOrderOptionsRef?: PlaceOrderOptionsRef;
    /** When .current is true, do not advance from contact step after submit (OTP modal flow). */
    otpFlowActiveRef?: OtpFlowActiveRef;
    /** When .current is true, do not advance from shipping address step (no valid methods available). */
    noShippingMethodsRef?: NoShippingMethodsRef;
}) {
    const { exitEditMode, editingStep, goToStep, step: currentStep } = useCheckoutContext();
    const updateBasket = useBasketUpdater();
    const basket = useBasket();

    const contactFetcher = useFetcher<CheckoutActionData>({ key: 'contact-form' });
    const shippingAddressFetcher = useFetcher<CheckoutActionData>({ key: 'shipping-address-form' });
    const shippingOptionsFetcher = useFetcher<CheckoutActionData>({ key: 'shipping-options-form' });
    const paymentFetcher = useFetcher<CheckoutActionData>({ key: 'payment-form' });
    const placeOrderFetcher = useFetcher<{ success?: boolean; error?: string | ActionError; step?: string }>({
        key: 'place-order',
    });

    // Track action submission lifecycle.
    // We track step here because editingStep from context can change before processing completes.
    const actionRef = useRef<ActionLifecycle>({ step: null, state: ActionState.NOT_STARTED });

    // Restore create-account only when registration OTP flow is active — avoids stale shouldCreateAccount for returning shoppers
    const [shouldCreateAccount, setShouldCreateAccount] = useState(() => {
        if (typeof sessionStorage === 'undefined') {
            return false;
        }
        if (sessionStorage.getItem(SESSION_REGISTERED_VIA_CHECKOUT) !== 'true') {
            return false;
        }
        return sessionStorage.getItem(SESSION_SHOULD_CREATE_ACCOUNT) === 'true';
    });
    const [savedPaymentMethods, setSavedPaymentMethods] = useState(new Set<string>());

    // Stores the contact phone across basket mutations
    const contactPhoneRef = useRef<string | null>(null);

    // Restore phone from session when basket no longer has it after OTP / merge
    useEffect(() => {
        if (typeof sessionStorage === 'undefined') {
            return;
        }
        const stored = sessionStorage.getItem(SESSION_CHECKOUT_CONTACT_PHONE);
        if (stored && !contactPhoneRef.current) {
            contactPhoneRef.current = stored;
        }
    }, []);

    // If billing/shipping gains a phone later (e.g. payment step) and we have no ref/session yet, capture it for place order
    useEffect(() => {
        if (contactPhoneRef.current) {
            return;
        }
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_CHECKOUT_CONTACT_PHONE)) {
            return;
        }
        const fromBasket = basket?.billingAddress?.phone || basket?.shipments?.[0]?.shippingAddress?.phone;
        if (fromBasket) {
            contactPhoneRef.current = fromBasket;
        }
    }, [basket]);

    // Reset lifecycle when entering a different edit step.
    // Skip reset when editingStep matches the step already tracked in actionRef: this happens
    // during recalculation submissions where goToStep and actionRef are set in the same call —
    // the deferred editingStep state update would otherwise wipe the in-flight actionRef state.
    useEffect(() => {
        if (editingStep !== null && actionRef.current.step !== editingStep) {
            actionRef.current = { step: null, state: ActionState.NOT_STARTED };
        }
    }, [editingStep]);

    // Map checkout steps to their corresponding fetchers
    const fetcherMap: Partial<Record<CheckoutStep, typeof contactFetcher>> = {
        [CHECKOUT_STEPS.CONTACT_INFO]: contactFetcher,
        [CHECKOUT_STEPS.SHIPPING_ADDRESS]: shippingAddressFetcher,
        [CHECKOUT_STEPS.SHIPPING_OPTIONS]: shippingOptionsFetcher,
        [CHECKOUT_STEPS.PAYMENT]: paymentFetcher,
    };

    // Update basket context when action completes successfully
    // Updates client-side basket state from action responses. Root loader revalidation
    // only updates basketSnapshot, not the full basket. This ensures checkout step
    // progression (which depends on basket state) works correctly after form submissions.
    useEffect(() => {
        const { step, state } = actionRef.current;

        // Only process if we're in SUBMITTED state
        if (step === null || state !== ActionState.SUBMITTED) {
            return;
        }

        const fetcher = fetcherMap[step];
        if (!fetcher?.data?.success || !fetcher.data.basket) {
            return;
        }

        // Transition: SUBMITTED -> BASKET_UPDATED (spread preserves recalculating and any future fields)
        actionRef.current = { ...actionRef.current, state: ActionState.BASKET_UPDATED };
        // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
        // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
        // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
        updateBasket(fetcher.data.basket);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contactFetcher.data, shippingAddressFetcher.data, shippingOptionsFetcher.data, paymentFetcher.data]);

    // Exit edit mode after basket has been updated
    // Depends on basket so it runs AFTER the basket state update has been applied
    useEffect(() => {
        const { step, state } = actionRef.current;

        const isActiveShippingStepWithoutEditing =
            editingStep === null &&
            (step === CHECKOUT_STEPS.SHIPPING_ADDRESS || step === CHECKOUT_STEPS.SHIPPING_OPTIONS) &&
            currentStep === step;
        if (editingStep === null && !isActiveShippingStepWithoutEditing) {
            return;
        }

        // Only process if we're in BASKET_UPDATED state on an active checkout step
        if (step === null || state !== ActionState.BASKET_UPDATED) {
            return;
        }

        const fetcher = fetcherMap[step];
        if (!fetcher?.data?.success) {
            return;
        }

        const responseLastModified = fetcher.data.basket?.lastModified;
        const basketRevisionCurrent =
            !responseLastModified || isBasketRevisionCurrent(basket?.lastModified, responseLastModified);
        if (
            (step === CHECKOUT_STEPS.SHIPPING_ADDRESS || step === CHECKOUT_STEPS.SHIPPING_OPTIONS) &&
            responseLastModified &&
            !basketRevisionCurrent
        ) {
            return;
        }

        // Do not advance from contact step when OTP modal is open or authorize is in flight
        if (step === CHECKOUT_STEPS.CONTACT_INFO && options?.otpFlowActiveRef?.current) {
            return;
        }

        // Do not advance from shipping address step when no valid shipping methods are available
        if (step === CHECKOUT_STEPS.SHIPPING_ADDRESS && options?.noShippingMethodsRef?.current) {
            return;
        }

        // Recalculating submissions update basket state (so discounted prices render) but keep
        // the shopper on the shipping options step so they can review and confirm their choice.
        if (actionRef.current.recalculating) {
            actionRef.current = { step, state: ActionState.COMPLETED };
            return;
        }

        // Transition: BASKET_UPDATED -> COMPLETED
        actionRef.current = { step, state: ActionState.COMPLETED };
        exitEditMode();

        // Move keyboard focus to the just-saved section's title. Without this,
        // keyboard/screen-reader users lose focus when a completed section
        // collapses back to summary view (WCAG 2.4.3). We rely on the
        // ToggleCard's data-testid convention. Deferred to the next frame so
        // React has committed the exit-edit transition before we read the DOM.
        // Cancel on cleanup so an unmount between here and the next frame does
        // not leave the callback running against a detached DOM.
        if (typeof requestAnimationFrame !== 'undefined') {
            const rafId = requestAnimationFrame(() => {
                const testId = TOGGLE_CARD_ID_BY_STEP[step];
                if (!testId) return;
                const heading = document.querySelector<HTMLElement>(
                    `[data-testid="sf-toggle-card-${testId}"] [data-slot="card-title"]`
                );
                heading?.focus();
            });
            return () => cancelAnimationFrame(rafId);
        }

        // Fetcher .data deps keep this in sync when the server's dedup sends a
        // cached response (same basket, same fetcher.data — basket dep alone
        // would not re-run the effect in that case). exitEditMode, fetcherMap,
        // and options refs are intentionally omitted: they are stable refs or
        // callbacks whose identity changes don't require re-running this effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        editingStep,
        basket,
        contactFetcher.data,
        shippingAddressFetcher.data,
        shippingOptionsFetcher.data,
        paymentFetcher.data,
        currentStep,
    ]);

    /**
     * Submits contact information to the contact info action.
     *
     * @param data - Contact form data containing email and phone
     */
    const submitContactInfo = (data: ContactInfoData) => {
        // Prevent concurrent submissions
        if (contactFetcher.state === 'submitting') {
            return;
        }

        // Transition: IDLE -> SUBMITTED
        actionRef.current = { step: CHECKOUT_STEPS.CONTACT_INFO, state: ActionState.SUBMITTED };

        // Persist the full phone (with country code) for place-order and OTP/basket merges
        if (data.phone) {
            const fullPhone = `${data.countryCode || '+1'} ${data.phone}`;
            contactPhoneRef.current = fullPhone;
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(SESSION_CHECKOUT_CONTACT_PHONE, fullPhone);
            }
        }

        // Convert typed data to FormData for fetcher submission
        const formData = new FormData();
        formData.append('intent', CHECKOUT_ACTION_INTENTS.CONTACT_INFO);
        formData.append('email', data.email);
        if (data.phone) formData.append('phone', data.phone);
        if (data.countryCode) formData.append('countryCode', data.countryCode);

        void contactFetcher.submit(formData, {
            method: 'post',
        });
    };

    /**
     * Submits shipping address information to the shipping address action.
     *
     * @param formData - FormData containing shipping address fields
     */
    const submitShippingAddress = (formData: FormData) => {
        // Prevent concurrent submissions
        if (shippingAddressFetcher.state === 'submitting') {
            return;
        }

        // Transition: IDLE -> SUBMITTED
        actionRef.current = { step: CHECKOUT_STEPS.SHIPPING_ADDRESS, state: ActionState.SUBMITTED };

        // Add intent field
        formData.append('intent', CHECKOUT_ACTION_INTENTS.SHIPPING_ADDRESS);

        void shippingAddressFetcher.submit(formData, {
            method: 'post',
        });
    };

    /**
     * Submits shipping options to the shipping options action.
     *
     * @param formData - FormData containing selected shipping method
     */
    const submitShippingOptions = (formData: FormData) => {
        // Prevent concurrent submissions
        if (shippingOptionsFetcher.state === 'submitting') {
            return;
        }

        // Transition: IDLE -> SUBMITTED
        actionRef.current = { step: CHECKOUT_STEPS.SHIPPING_OPTIONS, state: ActionState.SUBMITTED };

        // Add intent field
        formData.append('intent', CHECKOUT_ACTION_INTENTS.SHIPPING_OPTIONS);

        void shippingOptionsFetcher.submit(formData, {
            method: 'post',
        });
    };

    /**
     * Submits a shipping method for basket price recalculation without advancing the checkout step.
     * Used when the shopper just entered a new address - prices update so they see the correct
     * promotional amounts, but the step stays at shipping options so they can confirm their choice.
     *
     * @param formData - FormData containing the selected shippingMethodId
     */
    const submitShippingOptionsForRecalculation = (formData: FormData) => {
        if (shippingOptionsFetcher.state === 'submitting') {
            return;
        }

        // Pin editingStep to SHIPPING_OPTIONS so the checkout context's computedStep update
        // (which fires when the basket gains a shipping method) cannot advance the step automatically.
        goToStep(CHECKOUT_STEPS.SHIPPING_OPTIONS);

        actionRef.current = {
            step: CHECKOUT_STEPS.SHIPPING_OPTIONS,
            state: ActionState.SUBMITTED,
            recalculating: true,
        };

        formData.append('intent', CHECKOUT_ACTION_INTENTS.SHIPPING_OPTIONS);

        void shippingOptionsFetcher.submit(formData, {
            method: 'post',
        });
    };

    /**
     * Submits payment information to the payment action.
     *
     * @param data - Payment form data containing card details and billing info
     */
    const submitPayment = (data: PaymentData) => {
        // Prevent concurrent submissions
        if (paymentFetcher.state === 'submitting') {
            return;
        }

        // Transition: IDLE -> SUBMITTED
        actionRef.current = { step: CHECKOUT_STEPS.PAYMENT, state: ActionState.SUBMITTED };

        // Convert typed data to FormData for fetcher submission
        const formData = new FormData();
        formData.append('intent', CHECKOUT_ACTION_INTENTS.PAYMENT);
        formData.append('cardNumber', data.cardNumber || '');
        formData.append('cardholderName', data.cardholderName || '');
        formData.append('expiryDate', data.expiryDate || '');
        formData.append('cvv', data.cvv || '');
        formData.append('useDifferentBilling', data.useDifferentBilling.toString());

        // Include saved payment method fields
        formData.append('useSavedPaymentMethod', data.useSavedPaymentMethod?.toString() || 'false');
        if (data.selectedSavedPaymentMethod) {
            formData.append('selectedSavedPaymentMethod', data.selectedSavedPaymentMethod);
        }

        if (data.useDifferentBilling) {
            formData.append('billingFirstName', data.billingFirstName || '');
            formData.append('billingLastName', data.billingLastName || '');
            formData.append('billingAddress1', data.billingAddress1 || '');
            formData.append('billingAddress2', data.billingAddress2 || '');
            formData.append('billingCity', data.billingCity || '');
            formData.append('billingStateCode', data.billingStateCode || '');
            formData.append('billingPostalCode', data.billingPostalCode || '');
            formData.append('billingPhone', data.billingPhone || '');
            formData.append('billingCountryCode', data.billingCountryCode || 'US');
        }

        // Submit payment form data
        void paymentFetcher.submit(formData, {
            method: 'post',
        });
    };

    /**
     * Helper function to check if a specific checkout step is currently submitting.
     *
     * @param step - The checkout step to check ('contact' | 'shipping-address' | 'shipping-options' | 'payment')
     * @returns true if the step is currently submitting, false otherwise
     */
    const isSubmitting = (step: 'contact' | 'shipping-address' | 'shipping-options' | 'payment'): boolean => {
        switch (step) {
            case 'contact':
                return contactFetcher.state === 'submitting';
            case 'shipping-address':
                return shippingAddressFetcher.state === 'submitting';
            case 'shipping-options':
                return shippingOptionsFetcher.state === 'submitting';
            case 'payment':
                return paymentFetcher.state === 'submitting';
            default:
                return false;
        }
    };

    /**
     * Callback for when payment methods are saved
     *
     * @param paymentId - The ID of the payment method that was saved
     */
    const handlePaymentMethodSaved = (paymentId: string) => {
        setSavedPaymentMethods((prev) => new Set([...prev, paymentId]));
    };

    /**
     * Callback for when create account preference changes.
     * Memoized so consumers (e.g. useEffect deps in checkout-form-page) don't fire on every render.
     */
    const handleCreateAccountPreferenceChange = useCallback((shouldCreate: boolean) => {
        setShouldCreateAccount(shouldCreate);

        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(SESSION_SHOULD_CREATE_ACCOUNT, shouldCreate.toString());
        }
    }, []);

    /**
     * Build the form data the storefront sends to the place-order action and
     * to the extension-driven `place-order-finalize` route. Both consume the
     * same shopper-state inputs (registration intent, save-payment, billing
     * choice, contact phone), so we centralize the construction here.
     */
    const buildPlaceOrderFinalizeFormData = useCallback((): FormData => {
        const formData = new FormData();
        formData.append('shouldCreateAccount', shouldCreateAccount ? 'true' : 'false');
        const registrationFlowActive =
            typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_REGISTERED_VIA_CHECKOUT) === 'true';
        formData.append('checkoutRegistrationIntent', registrationFlowActive ? 'true' : 'false');
        const placeOrderOpts =
            options?.paymentSubmissionRef?.current?.options ?? options?.placeOrderOptionsRef?.current;
        if (placeOrderOpts?.savePaymentToProfile) {
            formData.append('savePaymentToProfile', 'true');
        }
        if (typeof placeOrderOpts?.useDifferentBilling === 'boolean') {
            formData.append('useDifferentBilling', String(placeOrderOpts.useDifferentBilling));
        }
        // Phone may have been captured at submit time (session + ref survive basket merge / reload).
        const storedPhone =
            typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_CHECKOUT_CONTACT_PHONE) : null;
        const contactPhone =
            contactPhoneRef.current ||
            storedPhone ||
            basket?.billingAddress?.phone ||
            basket?.shipments?.[0]?.shippingAddress?.phone;
        if (contactPhone) {
            formData.append('contactPhone', contactPhone);
        }
        return formData;
    }, [shouldCreateAccount, options?.paymentSubmissionRef, options?.placeOrderOptionsRef, basket]);

    /**
     * Submits the place-order action via fetcher so errors can be shown in-page.
     */
    const submitPlaceOrder = () => {
        if (placeOrderFetcher.state === 'submitting') {
            return;
        }
        const formData = buildPlaceOrderFinalizeFormData();
        void placeOrderFetcher.submit(formData, {
            method: 'post',
            action: resourceRoutes.placeOrder,
        });
    };

    return {
        // Action functions
        submitContactInfo,
        submitShippingAddress,
        submitShippingOptions,
        submitShippingOptionsForRecalculation,
        submitPayment,
        submitPlaceOrder,
        buildPlaceOrderFinalizeFormData,

        // Fetcher objects
        contactFetcher,
        shippingAddressFetcher,
        shippingOptionsFetcher,
        paymentFetcher,
        placeOrderFetcher,

        // Helper functions
        isSubmitting,

        // Create account state and functions
        shouldCreateAccount,
        savedPaymentMethods,
        handlePaymentMethodSaved,
        handleCreateAccountPreferenceChange,
    };
}
