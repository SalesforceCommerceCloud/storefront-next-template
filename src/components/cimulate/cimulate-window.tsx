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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { endCimulateConversation, linkCimulateIdentity } from './cimulate-identity-link';
import { buildMessagingWidgetOptions, flushPendingCimulateActions, type CimulateConfig } from './cimulate.utils';
import {
    buildCimulateComboKey,
    buildCimulateIdentityKey,
    buildConversationStorageKeys,
    claimInitialCimulateEvaluation,
    classifyCimulateIdentityChange,
    clearCimulateLinkedCombo,
    enqueueCimulateLinkWork,
    getExcludedCimulateToken,
    getPendingCimulateTokenRotation,
    requireCimulateTokenRotation,
    consumeCimulateTokenRotation,
    getPreviousCimulateIdentity,
    hasCimulateComboLinked,
    isCurrentCimulateLinkGeneration,
    markCimulateComboLinked,
    nextCimulateLinkGeneration,
    readCimulateConversationId,
    readCimulateConversationToken,
    setLastAttemptedCimulateToken,
    setLastLinkedCimulateToken,
    setPreviousCimulateIdentity,
    waitForRotatedConversationToken,
    waitForCimulateLinkDelay,
    type CimulateIdentityChangeKind,
    type CimulateIdentitySnapshot,
} from './cimulate-conversation';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

let globalInjected = false;
let logoutQuarantined = false;
const quarantineListeners = new Set<() => void>();

const MAX_IDENTITY_LINK_ATTEMPTS = 2;
const DEFAULT_IDENTITY_LINK_RETRY_MS = 1000;

type CimulateLinkReason = 'widget-ready' | 'resumed-conversation' | 'identity-change';

interface CimulateWindowProps {
    config: CimulateConfig;
    /** Non-sensitive shopper-identity snapshot, used only to detect login/logout/account-switch/guest-rotation. */
    identity?: CimulateIdentitySnapshot;
}

/**
 * Renders the Commerce Client (Cimulate) messaging widget.
 * Loads the UMD bundle and injects the widget into a container element.
 */
export function CimulateWindow({ config, identity }: CimulateWindowProps) {
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const [quarantined, setQuarantined] = useState(logoutQuarantined);
    const hasInjectedRef = useRef(false);
    const { t } = useTranslation('shopperAgent');

    useEffect(() => {
        const onQuarantine = (): void => setQuarantined(true);
        quarantineListeners.add(onQuarantine);
        if (logoutQuarantined) onQuarantine();
        return () => {
            quarantineListeners.delete(onQuarantine);
        };
    }, []);

    const { commerceClientScriptSourceUrl, salesforceOrgId, esDeveloperName } = config;

    // Config → widget-option mapping lives in buildMessagingWidgetOptions (unit-testable, no DOM).
    const widgetOptions = useMemo(() => buildMessagingWidgetOptions(config), [config]);

    const storageKeys = useMemo(
        () => buildConversationStorageKeys(salesforceOrgId, esDeveloperName),
        [salesforceOrgId, esDeveloperName]
    );

    // Load the Cimulate messaging UMD bundle
    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (window.CimulateMessaging) {
            setScriptLoaded(true);
            return;
        }

        const existingScript = document.querySelector<HTMLScriptElement>(
            `script[src="${commerceClientScriptSourceUrl}"]`
        );
        if (existingScript) {
            if (window.CimulateMessaging) {
                setScriptLoaded(true);
            } else {
                existingScript.addEventListener('load', () => setScriptLoaded(true));
            }
            return;
        }

        const script = document.createElement('script');
        script.src = commerceClientScriptSourceUrl;
        script.async = true;
        script.onload = () => setScriptLoaded(true);
        script.onerror = () => {
            logger.error('Failed to load Cimulate messaging script');
        };
        document.body.appendChild(script);
    }, [commerceClientScriptSourceUrl]);

    // Link on every widget-ready (new conversation), on mount when a stored conversation is resumed (the
    // widget sends no ready event then), and on identity-lifecycle changes. All link work is queued.
    // Lifecycle state is module-level, so a remount neither re-arms nor loses it.
    useEffect(() => {
        if (!scriptLoaded || logoutQuarantined) return;

        const commerceClient = window.CimulateMessaging;
        const readyEvent = commerceClient?.CIMULATE_WIDGET_READY_EVENT;

        const showSessionErrorToast = (): void => {
            toast.error(t('sessionError'));
        };

        const performIdentityLink = async ({
            reason,
            generation,
            changeKind,
        }: {
            reason: CimulateLinkReason;
            generation: number;
            changeKind?: CimulateIdentityChangeKind;
        }): Promise<void> => {
            if (!isCurrentCimulateLinkGeneration(generation) || logoutQuarantined) return;

            const rotation = getPendingCimulateTokenRotation();
            const excludedToken = rotation?.excludedToken;
            if (rotation) {
                // Clear-chat can fire ready before storage rotates; never link the previous conversation.
                const rotatedToken = await waitForRotatedConversationToken(
                    storageKeys.conversationTokenKey,
                    excludedToken,
                    { generation }
                );
                if (!isCurrentCimulateLinkGeneration(generation)) return;
                if (rotatedToken === undefined) {
                    logger.warn('Cimulate identity link skipped: no new conversation token', { reason });
                    return;
                }
                setLastAttemptedCimulateToken(rotatedToken);
                consumeCimulateTokenRotation(rotation, generation);
            }

            // Read after any token wait so a conversation still being created has time to appear.
            const comboKey = identity
                ? buildCimulateComboKey(
                      salesforceOrgId,
                      esDeveloperName,
                      identity.siteId,
                      readCimulateConversationId(storageKeys.conversationIdKey),
                      buildCimulateIdentityKey(identity)
                  )
                : undefined;
            // A new conversation (excluded token) always links; dedup only guards same-conversation repeats.
            if (comboKey && !excludedToken && hasCimulateComboLinked(comboKey)) return;

            const correlationId = crypto.randomUUID();
            const startedAt = Date.now();

            const attempt = async (attemptNumber: number): Promise<void> => {
                const result = await linkCimulateIdentity();
                if (!isCurrentCimulateLinkGeneration(generation)) return;

                if (result.success) {
                    if (comboKey) markCimulateComboLinked(comboKey);
                    setLastLinkedCimulateToken(readCimulateConversationToken(storageKeys.conversationTokenKey));
                    logger.info('Cimulate identity linked', {
                        reason,
                        changeKind,
                        userType: identity?.userType,
                        hasCustomerId: Boolean(identity?.customerId),
                        attempt: attemptNumber,
                        durationMs: Date.now() - startedAt,
                        correlationId,
                    });
                    return;
                }

                if (result.error.retryable && attemptNumber < MAX_IDENTITY_LINK_ATTEMPTS) {
                    const retryDelay =
                        result.error.retryAfterSeconds === undefined
                            ? DEFAULT_IDENTITY_LINK_RETRY_MS
                            : result.error.retryAfterSeconds * 1000;
                    await waitForCimulateLinkDelay(retryDelay, generation);
                    if (!isCurrentCimulateLinkGeneration(generation)) return;
                    await attempt(attemptNumber + 1);
                    return;
                }

                logger.error('Cimulate identity linking failed', {
                    code: result.error.code,
                    reason,
                    retryCount: attemptNumber - 1,
                    durationMs: Date.now() - startedAt,
                    correlationId,
                });
                showSessionErrorToast();
            };

            await attempt(1);
        };

        // Record the token current at scheduling time so the next new-conversation link excludes it.
        const noteScheduledToken = (): void => {
            const scheduledToken = readCimulateConversationToken(storageKeys.conversationTokenKey);
            if (scheduledToken !== undefined) setLastAttemptedCimulateToken(scheduledToken);
        };

        const handleWidgetReady = (): void => {
            if (logoutQuarantined) return;
            const generation = nextCimulateLinkGeneration();
            const excludedToken = getExcludedCimulateToken() ?? getPendingCimulateTokenRotation()?.excludedToken;
            requireCimulateTokenRotation(excludedToken, true);
            noteScheduledToken();
            void enqueueCimulateLinkWork(() =>
                performIdentityLink({
                    reason: 'widget-ready',
                    generation,
                })
            );
        };

        if (readyEvent) window.addEventListener(readyEvent, handleWidgetReady);

        const hasConversation = readCimulateConversationId(storageKeys.conversationIdKey) !== undefined;

        // A resumed conversation emits no ready event, so link it once per page load. A cold start with
        // no stored conversation waits for the ready event instead.
        if (claimInitialCimulateEvaluation() && hasConversation) {
            const generation = nextCimulateLinkGeneration();
            noteScheduledToken();
            void enqueueCimulateLinkWork(() => performIdentityLink({ reason: 'resumed-conversation', generation }));
        }

        // Identity-lifecycle changes (login, registration, account switch, guest rotation, logout).
        // The first known identity is a baseline, not a change.
        if (identity) {
            const changeKind = classifyCimulateIdentityChange(getPreviousCimulateIdentity(), identity);
            setPreviousCimulateIdentity(identity);

            // With no conversation yet there is nothing to re-link; the ready event will link it.
            if (changeKind !== 'none' && hasConversation) {
                const generation = nextCimulateLinkGeneration();
                const relink = (): Promise<void> => {
                    noteScheduledToken();
                    return enqueueCimulateLinkWork(() =>
                        performIdentityLink({
                            reason: 'identity-change',
                            generation,
                            changeKind,
                        })
                    );
                };

                if (changeKind === 'logout') {
                    const excludedToken =
                        readCimulateConversationToken(storageKeys.conversationTokenKey) ?? getExcludedCimulateToken();
                    setLastAttemptedCimulateToken(excludedToken);
                    requireCimulateTokenRotation(excludedToken, true);
                    clearCimulateLinkedCombo();
                    // SDK reset is asynchronous; a rapid login must not link the prior shopper's token.
                    void (async () => {
                        const ended = await endCimulateConversation();
                        if (ended.success) return;
                        // Fail closed until full reload, including portals created after this component unmounts.
                        logoutQuarantined = true;
                        nextCimulateLinkGeneration();
                        clearCimulateLinkedCombo();
                        if (!document.querySelector('[data-cimulate-quarantine]')) {
                            const style = document.createElement('style');
                            style.setAttribute('data-cimulate-quarantine', '');
                            style.textContent = '.commerce-client-shopper-agent { display: none !important; }';
                            document.head.appendChild(style);
                        }
                        for (const notify of quarantineListeners) notify();
                        for (const store of [() => window.localStorage, () => window.sessionStorage]) {
                            for (const key of [storageKeys.conversationTokenKey, storageKeys.conversationIdKey]) {
                                try {
                                    store().removeItem(key);
                                } catch {
                                    /* Storage may be disabled; quarantine remains. */
                                }
                            }
                        }
                        logger.warn('Cimulate logout quarantined', {
                            code: 'CONVERSATION_END_FAILED',
                            reason: 'logout',
                        });
                        showSessionErrorToast();
                    })();
                } else {
                    void relink();
                }
            }
        }

        return () => {
            if (readyEvent) window.removeEventListener(readyEvent, handleWidgetReady);
        };
    }, [scriptLoaded, identity, storageKeys, salesforceOrgId, esDeveloperName, t]);

    // Inject the widget once the bundle is loaded.
    useEffect(() => {
        if (!scriptLoaded || hasInjectedRef.current || globalInjected || logoutQuarantined) return;

        const commerceClient = window.CimulateMessaging;
        try {
            if (!commerceClient || typeof commerceClient.injectMessagingWidget !== 'function') {
                logger.error('CimulateMessaging bundle loaded but injectMessagingWidget not available');
            } else {
                commerceClient.injectMessagingWidget(widgetOptions as unknown as Record<string, unknown>);
                hasInjectedRef.current = true;
                globalInjected = true;
                flushPendingCimulateActions();
            }
        } catch (error) {
            logger.error('Error injecting Cimulate messaging widget', { error });
        }
    }, [scriptLoaded, widgetOptions]);

    return (
        <div
            id={widgetOptions.elementId}
            data-testid="cimulate-agent-widget"
            hidden={quarantined}
            inert={quarantined}
        />
    );
}
