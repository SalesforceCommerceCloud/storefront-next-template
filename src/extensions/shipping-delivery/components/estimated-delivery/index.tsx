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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
import {
    type ReactElement,
    useState,
    useCallback,
    useEffect,
    useLayoutEffect,
    lazy,
    Suspense,
    useMemo,
    useRef,
    useId,
} from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import type { InfoModalData } from '@/components/info-modal/types';
import { formatCurrency } from '@/lib/currency';
import { formatDeliveryWindow } from '@/lib/date-utils';
import { getCountryCodeFromLocale, getPostalCodeFormat } from '@/lib/shipping-estimate/postal-code-formats';
import { useShippingEstimate } from '@/lib/shipping-estimate/use-shipping-estimate';
import type { ShippingDestination, ShippingEstimate } from '@/lib/shipping-estimate/types';
import {
    useShippingDelivery,
    type ShippingDeliveryPresentation,
} from '@/extensions/shipping-delivery/context/shipping-delivery-context';
import ZipCodeEstimator from './zip-code-estimator';

const InfoModal = lazy(() => import('@/components/info-modal'));

export type EstimatedDeliveryDisplayStyle = 'summary' | 'detailed';

export interface EstimatedDeliveryProps {
    productId: string;
    initialDestination?: ShippingDestination | null;
    /** "summary" omits the primary shipping price; "detailed" includes it when SCAPI provided one. */
    displayStyle?: EstimatedDeliveryDisplayStyle;
    /** Whether to display the estimate for the currently selected fulfillment method. */
    visible?: boolean;
    /** Opts this default target into coordinating resolved presentation with the fulfillment picker. */
    enableFulfillmentPresentation?: boolean;
    /** Reuses presentation ownership held by a lazy-loading parent target. */
    fulfillmentPresentationSourceId?: object;
    /** Publishes presentation through the lazy-loading parent target. */
    onFulfillmentPresentationChange?: (presentation: ShippingDeliveryPresentation | null) => void;
    /** Moves focus to the postal-code input when an interaction discloses the estimator. */
    focusPostalCodeOnMount?: boolean;
    /** Confirms that an interaction-requested postal-code input received focus. */
    onPostalCodeFocusHandled?: () => void;
}

export default function EstimatedDelivery({
    productId,
    initialDestination,
    displayStyle = 'detailed',
    visible = true,
    enableFulfillmentPresentation = false,
    fulfillmentPresentationSourceId,
    onFulfillmentPresentationChange,
    focusPostalCodeOnMount = false,
    onPostalCodeFocusHandled,
}: EstimatedDeliveryProps): ReactElement | null {
    const { t } = useTranslation('extShippingDelivery');
    const { language } = useSite();
    const shippingDelivery = useShippingDelivery();
    const publishPresentation = shippingDelivery?.publishPresentation;
    const registerPresentationSource = shippingDelivery?.registerPresentationSource;
    const localPresentationSourceId = useRef({});
    const presentationSourceId = fulfillmentPresentationSourceId ?? localPresentationSourceId.current;
    const destinationCountry = initialDestination?.countryCode ?? getCountryCodeFromLocale(language);
    const format = useMemo(() => getPostalCodeFormat(destinationCountry), [destinationCountry]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditingDestination, setIsEditingDestination] = useState(false);
    const [pendingRequestSequence, setPendingRequestSequence] = useState<number | null>(null);
    const [postalCode, setPostalCode] = useState(() => format.normalize(initialDestination?.postalCode ?? ''));
    const [validationError, setValidationError] = useState(false);
    const modalTriggerRef = useRef<HTMLButtonElement>(null);
    const modalTitleRef = useRef<HTMLHeadingElement>(null);
    const estimateResultRef = useRef<HTMLParagraphElement>(null);
    const idPrefix = `estimated-delivery-${useId().replaceAll(':', '')}`;
    const headingId = `${idPrefix}-heading`;
    const hasCalculatedRef = useRef(false);
    const previousProductIdRef = useRef(productId);
    const {
        isLoading,
        estimate,
        hasError,
        fallbackDeliveryDescription,
        matchedZipcode,
        autoFetchInFlight,
        requestSequence = 0,
        settledSequence = 0,
        load,
    } = useShippingEstimate<ShippingEstimate>({
        productId,
        initialDestination,
        enabled: true,
        matchAgainst: postalCode,
    });
    const hasMerchantFallback = hasError && Boolean(fallbackDeliveryDescription);
    const presentationProductId = shippingDelivery?.productId ?? productId;
    // THE fork signal for this whole component. Non-null only when a fulfillment picker has registered a
    // host for this product in the shared context — and that picker exists only when BOPIS contributes a
    // Pickup option alongside Delivery (making it a Delivery+Pickup pair). Its presence flips the card out
    // of standalone mode: instead of rendering a full DeliveryCard, we portal the "Deliver to X" title and
    // cost/options controls into the picker's Delivery row and emit only sr-only announcements. When it is
    // null (no BOPIS installed, or coordination disabled) the card renders standalone. This is how the
    // component adapts to BOPIS without importing it or carrying any @sfdc-extension-block SFDC_EXT_BOPIS
    // marker — it observes BOPIS's effect through the context rather than branching on it in source.
    const presentationHost = enableFulfillmentPresentation ? shippingDelivery?.presentationHost : null;
    const pendingRequestSequenceRef = useRef<number | null>(null);
    // Register this component as a presentation source on the shared context so the fulfillment picker knows a
    // delivery estimate exists for this variant; the returned cleanup unregisters it. Skipped when a lazy
    // parent target already owns the source (fulfillmentPresentationSourceId) or coordination is disabled.
    useLayoutEffect(() => {
        if (!enableFulfillmentPresentation || fulfillmentPresentationSourceId || !registerPresentationSource) return;
        return registerPresentationSource({
            sourceId: presentationSourceId,
            productId: presentationProductId,
            estimateProductId: productId,
        });
    }, [
        enableFulfillmentPresentation,
        fulfillmentPresentationSourceId,
        productId,
        presentationProductId,
        presentationSourceId,
        registerPresentationSource,
    ]);
    const isRegisteredPresentationSource =
        enableFulfillmentPresentation && shippingDelivery?.presentationSourceId === presentationSourceId;
    const isCoordinatedWithPicker = Boolean(presentationHost && isRegisteredPresentationSource);
    const isAwaitingEstimate = pendingRequestSequence !== null && settledSequence < pendingRequestSequence;
    const shouldShowEstimator =
        isEditingDestination ||
        (hasError && !hasMerchantFallback) ||
        (!initialDestination && !estimate && !autoFetchInFlight && !hasMerchantFallback);
    const shouldShowLoading = !isEditingDestination && (isLoading || autoFetchInFlight || isAwaitingEstimate);
    const shouldPublishCookieLoading = Boolean(
        enableFulfillmentPresentation &&
            shippingDelivery?.hasDeclaredPresentationHost?.(presentationProductId) &&
            initialDestination?.postalCode &&
            !isEditingDestination &&
            (isLoading || autoFetchInFlight)
    );

    // On variant (productId) change, reset all per-variant bookkeeping so the new variant starts fresh and
    // never inherits the previous one's pending request, calculated flag, or editor/validation state.
    // Runs as a layout effect (not passive) so the reset lands before paint: the publish layout-effect below
    // reads render-time state, so a passive reset would let a commit publish the *previous* variant's stale
    // `editing` presentation for the new product — flashing the postal-code prompt for one frame before the
    // new estimate resolves. Clearing here forces a synchronous pre-paint re-render, collapsing that frame.
    useLayoutEffect(() => {
        if (previousProductIdRef.current === productId) return;
        previousProductIdRef.current = productId;
        pendingRequestSequenceRef.current = null;
        setPendingRequestSequence(null);
        hasCalculatedRef.current = false;
        // Editor state is per-variant: a variant that forces the estimator open (e.g. an empty merchant
        // fallback) must not leave the next variant stuck in edit mode, publishing `editing` instead of
        // its resolved estimate. Variants that genuinely need editing re-open it via the recovery effect.
        setIsEditingDestination(false);
        setValidationError(false);
    }, [productId]);

    // When the editor opens, move focus into the postal-code input.
    useEffect(() => {
        if (isEditingDestination) {
            document.getElementById(`${idPrefix}-input`)?.focus();
        }
    }, [idPrefix, isEditingDestination]);

    // When a parent interaction requested the estimator (focusPostalCodeOnMount) and it is showing, focus the
    // input and acknowledge via onPostalCodeFocusHandled so the parent clears its one-shot request.
    useEffect(() => {
        if (focusPostalCodeOnMount && shouldShowEstimator) {
            document.getElementById(`${idPrefix}-input`)?.focus();
            onPostalCodeFocusHandled?.();
        }
    }, [focusPostalCodeOnMount, idPrefix, onPostalCodeFocusHandled, shouldShowEstimator]);

    // A parent interaction that wants the estimator opens it here (before paint), so the focus effects above
    // find it already showing.
    useLayoutEffect(() => {
        if (focusPostalCodeOnMount) setIsEditingDestination(true);
    }, [focusPostalCodeOnMount]);

    // Close the shipping-options modal whenever this estimate is hidden (e.g. another fulfillment method).
    useEffect(() => {
        if (!visible) setIsModalOpen(false);
    }, [visible]);

    // Close the modal when the shopper switches to pickup — the delivery options no longer apply.
    useEffect(() => {
        if (presentationHost?.selectedOptionId === 'pickup') setIsModalOpen(false);
    }, [presentationHost?.selectedOptionId]);

    const handleInputChange = useCallback((value: string) => {
        setPostalCode(value);
        setValidationError(false);
    }, []);

    const handleCalculate = useCallback(() => {
        if (!format.regex.test(postalCode)) {
            setValidationError(true);
            return;
        }

        setValidationError(false);
        if (hasMerchantFallback) {
            setIsEditingDestination(false);
        }
        hasCalculatedRef.current = true;
        const nextRequestSequence = requestSequence + 1;
        pendingRequestSequenceRef.current = nextRequestSequence;
        setPendingRequestSequence(nextRequestSequence);
        load(postalCode, destinationCountry);
    }, [destinationCountry, format, hasMerchantFallback, load, postalCode, requestSequence]);

    const handleChangeDestination = useCallback(() => {
        setIsEditingDestination(true);
    }, []);

    const handleCloseAutoFocus = useCallback(
        (event: Event) => {
            if (!visible || presentationHost?.selectedOptionId === 'pickup') {
                event.preventDefault();
                document
                    .getElementById(presentationHost?.pickupControlId ?? `fulfillment-option-${productId}-pickup`)
                    ?.focus();
                return;
            }
            const persistentTrigger = modalTriggerRef.current;
            if (persistentTrigger?.isConnected && !persistentTrigger.closest('[hidden]')) {
                event.preventDefault();
                persistentTrigger.focus();
            }
        },
        [presentationHost?.pickupControlId, presentationHost?.selectedOptionId, productId, visible]
    );

    const handleOpenAutoFocus = useCallback((event: Event) => {
        event.preventDefault();
        modalTitleRef.current?.focus();
    }, []);

    const primaryOption = estimate?.shippingOptions[0];
    const hasMultipleOptions = (estimate?.shippingOptions.length ?? 0) > 1;
    const deliveryWindow = formatDeliveryWindow(primaryOption?.deliveryWindow, language);
    const modalData: InfoModalData | undefined = estimate
        ? {
              type: 'estimated-delivery',
              title: isCoordinatedWithPicker ? t('shippingOptionsOnlyHeading') : t('cardTitle'),
              contentTitle: isCoordinatedWithPicker ? undefined : t('shippingOptionsOnlyHeading'),
              shippingOptions: estimate.shippingOptions,
          }
        : undefined;
    // A complete estimate: SCAPI returned a matching postal code, a primary option, and a delivery window.
    const hasEstimateResult = Boolean(estimate && matchedZipcode && primaryOption && deliveryWindow);
    // That complete estimate is also the currently settled, non-editing state we can present as "resolved".
    const isResolvedPresentation =
        !isEditingDestination &&
        !isAwaitingEstimate &&
        !isLoading &&
        !autoFetchInFlight &&
        !hasError &&
        hasEstimateResult;
    const resolvedSummary =
        isResolvedPresentation && deliveryWindow ? t('estimatedArrivalMessage', { deliveryWindow }) : null;
    const resolvedDestination = isResolvedPresentation ? matchedZipcode : null;
    const resolvedTitleText = resolvedDestination
        ? t('deliverTo', { postalCode: resolvedDestination }).replace(/<[^>]+>/g, '')
        : null;
    const fallbackTitleText = t('deliverTo', { postalCode }).replace(/<[^>]+>/g, '');
    const shouldMountDeliveryOptionsModal = Boolean(hasMultipleOptions && modalData && (visible || isModalOpen));

    // True once the calculation the shopper explicitly requested (via Calculate) has come back from SCAPI.
    // Reads refs rather than state so the three settle-driven effects below share one definition of "done";
    // memoized on settledSequence (its only reactive input) so those effects re-run exactly when it changes.
    const requestedCalculationSettled = useCallback(
        () =>
            pendingRequestSequenceRef.current !== null &&
            settledSequence >= pendingRequestSequenceRef.current &&
            hasCalculatedRef.current,
        [settledSequence]
    );

    // Once the requested calculation settles with a result, swap the open editor back to the resolved/fallback
    // view. Runs as a layout effect so the editor is replaced before paint — ahead of the focus-transfer
    // effect below — otherwise focus would move to a Delivery control that is still hidden behind the editor.
    useLayoutEffect(() => {
        if (
            !requestedCalculationSettled() ||
            presentationHost?.selectedOptionId === 'pickup' ||
            !isEditingDestination ||
            !(hasEstimateResult || hasMerchantFallback)
        ) {
            return;
        }
        setIsEditingDestination(false);
    }, [
        hasEstimateResult,
        hasMerchantFallback,
        isEditingDestination,
        presentationHost?.selectedOptionId,
        requestedCalculationSettled,
    ]);

    // After a requested calculation settles, move focus to the Delivery control (when coordinating with the
    // picker) or to the estimate result paragraph, so keyboard users land on the freshly revealed estimate.
    useEffect(() => {
        if (
            !requestedCalculationSettled() ||
            presentationHost?.selectedOptionId === 'pickup' ||
            !(isResolvedPresentation || hasMerchantFallback)
        ) {
            return;
        }

        const focusTarget = presentationHost
            ? document.getElementById(presentationHost.deliveryControlId)
            : estimateResultRef.current;
        focusTarget?.focus();
    }, [hasMerchantFallback, isResolvedPresentation, presentationHost, requestedCalculationSettled]);

    // Auto-manage the editor on the non-calculated (auto-fetch / cookie) path: close it once an estimate
    // arrives, or open it when a lookup fails with no merchant fallback to show. Skips the explicit Calculate
    // path (guarded by the pending-sequence + hasCalculated refs), which the settle effects above own.
    useEffect(() => {
        if (isAwaitingEstimate) return;
        if (pendingRequestSequenceRef.current !== null && hasCalculatedRef.current) return;
        if (estimate && matchedZipcode) {
            setIsEditingDestination(false);
            return;
        }
        if (hasError && !fallbackDeliveryDescription) setIsEditingDestination(true);
    }, [estimate, fallbackDeliveryDescription, hasError, isAwaitingEstimate, matchedZipcode]);

    // Clear the pending-sequence bookkeeping once a requested calculation settles, so the next variant/lookup
    // starts clean. When pickup is selected, reset immediately (no Delivery result will be shown); otherwise
    // defer while the editor still shows a result until the layout effect above has replaced it.
    useEffect(() => {
        if (!requestedCalculationSettled()) return;

        if (presentationHost?.selectedOptionId === 'pickup') {
            pendingRequestSequenceRef.current = null;
            setPendingRequestSequence(null);
            hasCalculatedRef.current = false;
            return;
        }
        if (isEditingDestination && (hasEstimateResult || hasMerchantFallback)) return;
        pendingRequestSequenceRef.current = null;
        setPendingRequestSequence(null);
        hasCalculatedRef.current = false;
    }, [hasEstimateResult, hasMerchantFallback, isEditingDestination, presentationHost, requestedCalculationSettled]);

    // Publish this variant's current presentation (loading / resolved / fallback / editing / none) to the
    // shared context so the fulfillment picker can render it, or hand it to a lazy parent target via
    // onFulfillmentPresentationChange. The cleanup clears the published presentation when this source unmounts.
    useLayoutEffect(() => {
        if (!enableFulfillmentPresentation || !publishPresentation) return;
        const sourceId = presentationSourceId;

        // Pick the most specific presentation that currently applies, in priority order.
        const resolvePresentation = (): ShippingDeliveryPresentation | null => {
            if (shouldPublishCookieLoading) {
                return { kind: 'loading', sourceId, productId: presentationProductId, text: t('calculating') };
            }
            if (resolvedSummary && resolvedTitleText) {
                return {
                    kind: 'resolved',
                    sourceId,
                    productId: presentationProductId,
                    title: resolvedTitleText,
                    text: resolvedSummary,
                };
            }
            if (hasMerchantFallback && fallbackDeliveryDescription) {
                return {
                    kind: 'fallback',
                    sourceId,
                    productId: presentationProductId,
                    title: fallbackTitleText,
                    text: fallbackDeliveryDescription,
                };
            }
            if (shouldShowEstimator) {
                return { kind: 'editing', sourceId, productId: presentationProductId };
            }
            return null;
        };

        const nextPresentation = resolvePresentation();
        if (onFulfillmentPresentationChange) {
            onFulfillmentPresentationChange(nextPresentation);
            return;
        }
        publishPresentation(nextPresentation, sourceId);
        return () => publishPresentation(null, sourceId);
    }, [
        enableFulfillmentPresentation,
        onFulfillmentPresentationChange,
        presentationProductId,
        presentationSourceId,
        publishPresentation,
        resolvedSummary,
        resolvedTitleText,
        fallbackTitleText,
        fallbackDeliveryDescription,
        hasMerchantFallback,
        shouldPublishCookieLoading,
        shouldShowEstimator,
        t,
    ]);

    const shouldPortalDestinationTitle = Boolean(isCoordinatedWithPicker && (resolvedSummary || hasMerchantFallback));
    const shouldPortalControls = Boolean(
        isCoordinatedWithPicker && resolvedSummary && presentationHost?.detailsElement
    );

    const detailsElement = shouldPortalControls ? presentationHost?.detailsElement : null;
    const titleElement = shouldPortalDestinationTitle ? presentationHost?.titleElement : null;
    const destinationTitlePortal = titleElement
        ? createPortal(
              <ChangeDestinationTitle
                  destination={resolvedDestination ?? postalCode}
                  onChangeDestination={handleChangeDestination}
                  interactive
              />,
              titleElement
          )
        : null;
    const resolvedControls = detailsElement
        ? createPortal(
              <>
                  <ShippingCostLine option={primaryOption} displayStyle={displayStyle} />
                  <ViewAllOptionsButton
                      show={hasMultipleOptions}
                      triggerRef={modalTriggerRef}
                      onOpen={() => setIsModalOpen(true)}
                  />
              </>,
              detailsElement
          )
        : null;
    const coordinatedModal = (
        <DeliveryOptionsModal
            show={isRegisteredPresentationSource && shouldMountDeliveryOptionsModal}
            open={visible && isModalOpen}
            isPending={isModalOpen}
            onOpenChange={setIsModalOpen}
            onOpenAutoFocus={handleOpenAutoFocus}
            onCloseAutoFocus={handleCloseAutoFocus}
            titleRef={modalTitleRef}
            data={modalData}
        />
    );

    const estimator = (
        <ZipCodeEstimator
            idPrefix={idPrefix}
            inputValue={postalCode}
            isLoading={isLoading}
            hasLookupFailure={hasError}
            fallbackDeliveryDescription={fallbackDeliveryDescription}
            hasValidationError={validationError}
            format={format}
            onInputChange={handleInputChange}
            onCalculate={handleCalculate}
        />
    );
    if (shouldPublishCookieLoading) return null;

    // Which card to show — mutually exclusive, in priority order (e.g. loading wins over the estimator when
    // both conditions hold). Early returns keep the priority order flat and mirror resolvePresentation above.
    const cardState = ((): 'loading' | 'estimator' | 'fallback' | 'resolved' | 'none' => {
        if (shouldShowLoading) return 'loading';
        if (shouldShowEstimator) return 'estimator';
        if (hasMerchantFallback) return 'fallback';
        // Intentionally not hasEstimateResult: the resolved card renders even without a deliveryWindow.
        if (estimate && matchedZipcode && primaryOption) return 'resolved';
        return 'none';
    })();

    return (
        <section
            className={shouldPortalDestinationTitle ? undefined : 'mt-4'}
            aria-labelledby={isCoordinatedWithPicker ? undefined : headingId}>
            {cardState === 'loading' && (
                <DeliveryCard>
                    <CardHeading id={headingId} />
                    <p role="status" aria-live="polite" className="mt-0.5 text-xs text-muted-foreground">
                        {t('calculating')}
                    </p>
                </DeliveryCard>
            )}

            {cardState === 'estimator' && (
                <DeliveryCard>
                    <CardHeading id={headingId} />
                    {estimator}
                </DeliveryCard>
            )}

            {/* Coordinated presentation portals the visible text into the picker's title/details slots,
                so the card renders only an sr-only announcement; otherwise it renders the full card. */}
            {cardState === 'fallback' &&
                (shouldPortalDestinationTitle ? (
                    <p role="status" aria-live="polite" className="sr-only">
                        {fallbackDeliveryDescription}
                    </p>
                ) : (
                    <DeliveryCard>
                        <CardHeading id={headingId} />
                        <div className="mt-0.5 text-xs text-muted-foreground">
                            <ChangeDestinationTitle
                                destination={postalCode}
                                onChangeDestination={handleChangeDestination}
                            />
                        </div>
                        <p
                            ref={estimateResultRef}
                            role="status"
                            tabIndex={-1}
                            className="mt-0.5 text-xs text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                            {fallbackDeliveryDescription}
                        </p>
                    </DeliveryCard>
                ))}

            {cardState === 'resolved' &&
                (shouldPortalDestinationTitle ? (
                    <>
                        {deliveryWindow && (
                            <p role="status" aria-live="polite" className="sr-only">
                                {resolvedSummary}
                            </p>
                        )}
                    </>
                ) : (
                    <>
                        <DeliveryCard>
                            <CardHeading id={headingId} />
                            <div className="mt-0.5 text-xs text-muted-foreground">
                                <ChangeDestinationTitle
                                    destination={matchedZipcode ?? postalCode}
                                    onChangeDestination={handleChangeDestination}
                                />
                            </div>
                            {deliveryWindow && (
                                <p
                                    ref={estimateResultRef}
                                    role="status"
                                    aria-live="polite"
                                    tabIndex={-1}
                                    className="mt-0.5 text-xs text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                    {t('arrivalMessage', { deliveryWindow })}
                                </p>
                            )}
                            <ShippingCostLine option={primaryOption} displayStyle={displayStyle} />
                            <ViewAllOptionsButton
                                show={hasMultipleOptions}
                                triggerRef={modalTriggerRef}
                                onOpen={() => setIsModalOpen(true)}
                            />
                        </DeliveryCard>
                        <DeliveryOptionsModal
                            show={shouldMountDeliveryOptionsModal}
                            open={visible && isModalOpen}
                            isPending={isModalOpen}
                            onOpenChange={setIsModalOpen}
                            onOpenAutoFocus={handleOpenAutoFocus}
                            onCloseAutoFocus={handleCloseAutoFocus}
                            titleRef={modalTitleRef}
                            data={modalData}
                        />
                    </>
                ))}
            {resolvedControls}
            {destinationTitlePortal}
            {coordinatedModal}
        </section>
    );
}

function DeliveryCard({ children }: { children: React.ReactNode }): ReactElement {
    return (
        <div className="rounded-ui border border-muted-foreground/20 bg-card p-3">
            <div className="flex items-start gap-3">
                <CalendarDays aria-hidden className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">{children}</div>
            </div>
        </div>
    );
}

function CardHeading({ id }: { id: string }): ReactElement {
    const { t } = useTranslation('extShippingDelivery');
    return (
        <h2 id={id} className="text-sm font-medium text-foreground">
            {t('cardTitle')}
        </h2>
    );
}

/** "Deliver to <postal code>" with the postal code rendered as a Change-destination button. */
function ChangeDestinationTitle({
    destination,
    onChangeDestination,
    interactive = false,
}: {
    destination: string;
    onChangeDestination: () => void;
    /** Re-enables pointer events when portaled into a title element that disables them on an ancestor. */
    interactive?: boolean;
}): ReactElement {
    const { t } = useTranslation('extShippingDelivery');
    return (
        <Trans
            i18nKey="deliverTo"
            ns="extShippingDelivery"
            values={{ postalCode: destination }}
            components={{
                postalCode: (
                    <button
                        type="button"
                        aria-label={t('changeDestinationAriaLabel', { postalCode: destination })}
                        onClick={onChangeDestination}
                        className={`${interactive ? 'pointer-events-auto ' : ''}cursor-pointer rounded-sm underline hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
                    />
                ),
            }}
        />
    );
}

function ShippingCostLine({
    option,
    displayStyle,
}: {
    option: ShippingEstimate['shippingOptions'][number] | undefined;
    displayStyle: EstimatedDeliveryDisplayStyle;
}): ReactElement | null {
    const { t } = useTranslation('extShippingDelivery');
    const { language, currency } = useSite();
    if (displayStyle !== 'detailed' || option?.price === undefined) return null;
    return (
        <p className="text-xs text-muted-foreground">
            {t('shippingCost')}{' '}
            <span className="font-semibold">
                {option.price === 0 ? t('free') : formatCurrency(option.price, language, option.currency ?? currency)}
            </span>
        </p>
    );
}

function ViewAllOptionsButton({
    show,
    triggerRef,
    onOpen,
}: {
    show: boolean;
    triggerRef: React.Ref<HTMLButtonElement>;
    onOpen: () => void;
}): ReactElement | null {
    const { t } = useTranslation('extShippingDelivery');
    if (!show) return null;
    return (
        <button
            ref={triggerRef}
            type="button"
            onClick={onOpen}
            className="mt-2 cursor-pointer text-xs font-normal text-primary underline hover:text-primary/80">
            {t('viewAllShippingOptions')}
        </button>
    );
}

function DeliveryOptionsModal({
    show,
    open,
    isPending,
    onOpenChange,
    onOpenAutoFocus,
    onCloseAutoFocus,
    titleRef,
    data,
}: {
    show: boolean;
    open: boolean;
    /** Announces "opening" while the lazy modal chunk loads on an open interaction. */
    isPending: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenAutoFocus: (event: Event) => void;
    onCloseAutoFocus: (event: Event) => void;
    titleRef: React.Ref<HTMLHeadingElement>;
    data: InfoModalData | undefined;
}): ReactElement | null {
    const { t } = useTranslation('extShippingDelivery');
    if (!show) return null;
    return (
        <Suspense
            fallback={
                isPending ? (
                    <span role="status" aria-live="polite" className="sr-only">
                        {t('openingDeliveryOptions')}
                    </span>
                ) : null
            }>
            <InfoModal
                open={open}
                onOpenChange={onOpenChange}
                onOpenAutoFocus={onOpenAutoFocus}
                onCloseAutoFocus={onCloseAutoFocus}
                titleRef={titleRef}
                data={data}
            />
        </Suspense>
    );
}
