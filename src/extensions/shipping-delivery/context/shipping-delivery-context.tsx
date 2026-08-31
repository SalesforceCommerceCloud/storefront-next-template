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
/* eslint-disable react-refresh/only-export-components -- provider and hook are co-located by design */
import {
    createContext,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type PropsWithChildren,
    type ReactElement,
} from 'react';

export interface ShippingDeliveryPresentationHost {
    registrationId: object;
    productId: string;
    instanceId: string;
    selectedOptionId?: string;
    titleElement: HTMLElement | null;
    detailsElement: HTMLElement | null;
    deliveryControlId: string;
    pickupControlId: string;
}

export type ShippingDeliveryPresentation =
    | {
          kind: 'loading';
          sourceId: object;
          productId: string;
          text: string;
      }
    | {
          kind: 'resolved';
          sourceId: object;
          productId: string;
          title: string;
          text: string;
      }
    | {
          kind: 'fallback';
          sourceId: object;
          productId: string;
          title: string;
          text: string;
      }
    | {
          kind: 'editing';
          sourceId: object;
          productId: string;
      };

export interface ShippingDeliveryPresentationSource {
    sourceId: object;
    productId: string;
    estimateProductId: string;
}

export interface ShippingDeliveryContextValue {
    productId: string;
    requestedDeliveryEstimateProductId?: string | null;
    presentationHost?: ShippingDeliveryPresentationHost | null;
    presentationHostsReady?: boolean;
    presentationSourceId?: object | null;
    presentation?: ShippingDeliveryPresentation | null;
    hasPublishedResolvedPresentation?: boolean;
    /** Declares a host during rendering so server-rendered targets can avoid standalone markup. */
    declarePresentationHost?: (productId: string) => void;
    hasDeclaredPresentationHost?: (productId: string) => boolean;
    registerPresentationHost?: (host: ShippingDeliveryPresentationHost) => () => void;
    updatePresentationHostTitleElement?: (registrationId: object, element: HTMLElement | null) => void;
    updatePresentationHostElement?: (registrationId: object, element: HTMLElement | null) => void;
    registerPresentationSource?: (source: ShippingDeliveryPresentationSource) => () => void;
    publishPresentation?: (presentation: ShippingDeliveryPresentation | null, sourceId: object) => void;
    requestDeliveryEstimate?: (productId: string) => void;
    clearDeliveryEstimateRequest?: (productId: string) => void;
}

const ShippingDeliveryContext = createContext<ShippingDeliveryContextValue | null>(null);

export function useShippingDelivery(): ShippingDeliveryContextValue | null {
    return useContext(ShippingDeliveryContext);
}

export type ShippingDeliveryProviderProps = PropsWithChildren<{
    productId: string;
}>;

export function ShippingDeliveryProvider({ productId, children }: ShippingDeliveryProviderProps): ReactElement {
    const [hosts, setHosts] = useState<ShippingDeliveryPresentationHost[]>([]);
    const [presentationHostsReady, setPresentationHostsReady] = useState(false);
    const [sources, setSources] = useState<ShippingDeliveryPresentationSource[]>([]);
    const [presentation, setPresentation] = useState<ShippingDeliveryPresentation | null>(null);
    const [publishedResolvedPresentation, setPublishedResolvedPresentation] = useState<{
        sourceId: object;
        estimateProductId: string;
    } | null>(null);
    const [requestedDeliveryEstimateProductId, setRequestedDeliveryEstimateProductId] = useState<string | null>(null);
    const declaredPresentationHostProductIds = useRef(new Set<string>());
    const hostOrder = useRef(new WeakMap<object, number>());
    const nextHostOrder = useRef(0);

    useLayoutEffect(() => {
        setPresentationHostsReady(true);
    }, []);

    const registerPresentationHost = useCallback((host: ShippingDeliveryPresentationHost) => {
        if (!hostOrder.current.has(host.registrationId)) {
            hostOrder.current.set(host.registrationId, nextHostOrder.current++);
        }
        setHosts((current) => {
            const existingIndex = current.findIndex(({ registrationId }) => registrationId === host.registrationId);
            if (existingIndex === -1) return [...current, host];
            const next = [...current];
            next[existingIndex] = host;
            return next;
        });

        return () => {
            setHosts((current) => current.filter(({ registrationId }) => registrationId !== host.registrationId));
        };
    }, []);

    const declarePresentationHost = useCallback((declaredProductId: string) => {
        // Layout effects do not run on the server, so targets need this synchronous declaration
        // to avoid emitting a standalone card before the host can register in the browser.
        declaredPresentationHostProductIds.current.add(declaredProductId);
    }, []);
    const hasDeclaredPresentationHost = useCallback(
        (declaredProductId: string) => declaredPresentationHostProductIds.current.has(declaredProductId),
        []
    );

    const patchHost = useCallback((registrationId: object, patch: Partial<ShippingDeliveryPresentationHost>) => {
        setHosts((current) =>
            current.map((host) => (host.registrationId === registrationId ? { ...host, ...patch } : host))
        );
    }, []);
    const updatePresentationHostElement = useCallback(
        (registrationId: object, element: HTMLElement | null) => patchHost(registrationId, { detailsElement: element }),
        [patchHost]
    );
    const updatePresentationHostTitleElement = useCallback(
        (registrationId: object, element: HTMLElement | null) => patchHost(registrationId, { titleElement: element }),
        [patchHost]
    );

    const registerPresentationSource = useCallback((source: ShippingDeliveryPresentationSource) => {
        setSources((current) => {
            const existingIndex = current.findIndex(({ sourceId }) => sourceId === source.sourceId);
            if (existingIndex === -1) return [...current, source];
            const next = [...current];
            next[existingIndex] = source;
            return next;
        });
        return () => {
            setSources((current) => current.filter(({ sourceId }) => sourceId !== source.sourceId));
            setPresentation((current) => (current?.sourceId === source.sourceId ? null : current));
        };
    }, []);

    const presentationHost =
        hosts
            .filter((host) => host.productId === productId)
            .sort(
                (left, right) =>
                    (hostOrder.current.get(left.registrationId) ?? 0) -
                    (hostOrder.current.get(right.registrationId) ?? 0)
            )[0] ?? null;
    const presentationSource = sources.find((source) => source.productId === productId) ?? null;
    const presentationSourceId = presentationSource?.sourceId ?? null;
    const publishPresentation = useCallback(
        (nextPresentation: ShippingDeliveryPresentation | null, sourceId: object) => {
            if (nextPresentation?.kind === 'resolved' && nextPresentation.sourceId === presentationSourceId) {
                setPublishedResolvedPresentation(
                    presentationSource
                        ? {
                              sourceId: presentationSource.sourceId,
                              estimateProductId: presentationSource.estimateProductId,
                          }
                        : null
                );
            }
            setPresentation((current) => {
                if (nextPresentation) {
                    return nextPresentation.sourceId === presentationSourceId ? nextPresentation : current;
                }
                return current?.sourceId === sourceId ? null : current;
            });
        },
        [presentationSource, presentationSourceId]
    );
    const requestDeliveryEstimate = useCallback((requestedProductId: string) => {
        setRequestedDeliveryEstimateProductId(requestedProductId);
    }, []);
    const clearDeliveryEstimateRequest = useCallback((requestedProductId: string) => {
        setRequestedDeliveryEstimateProductId((current) => (current === requestedProductId ? null : current));
    }, []);
    const value = useMemo(
        () => ({
            productId,
            requestedDeliveryEstimateProductId,
            presentationHost,
            presentationHostsReady,
            presentationSourceId,
            presentation: presentation?.productId === productId ? presentation : null,
            hasPublishedResolvedPresentation:
                Boolean(publishedResolvedPresentation) &&
                Boolean(presentationSource) &&
                publishedResolvedPresentation?.sourceId === presentationSource?.sourceId &&
                publishedResolvedPresentation?.estimateProductId === presentationSource?.estimateProductId,
            declarePresentationHost,
            hasDeclaredPresentationHost,
            registerPresentationHost,
            updatePresentationHostTitleElement,
            updatePresentationHostElement,
            registerPresentationSource,
            publishPresentation,
            requestDeliveryEstimate,
            clearDeliveryEstimateRequest,
        }),
        [
            presentationHost,
            presentationHostsReady,
            presentationSourceId,
            productId,
            publishPresentation,
            requestDeliveryEstimate,
            clearDeliveryEstimateRequest,
            declarePresentationHost,
            hasDeclaredPresentationHost,
            registerPresentationHost,
            registerPresentationSource,
            requestedDeliveryEstimateProductId,
            presentation,
            publishedResolvedPresentation,
            presentationSource,
            updatePresentationHostTitleElement,
            updatePresentationHostElement,
        ]
    );

    return <ShippingDeliveryContext.Provider value={value}>{children}</ShippingDeliveryContext.Provider>;
}
