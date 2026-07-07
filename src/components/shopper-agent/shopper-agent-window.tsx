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
import { useEffect, useState } from 'react';
import {
    getAndClearPendingOpen,
    launchChat,
    notifyEmbeddedMessagingFirstBotMessageSent,
    type ShopperAgentConfig,
} from './shopper-agent.utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

/** Prevents multiple simultaneous inits of Embedded Messaging when multiple instances mount. */
let initGuard = false;

/**
 * Environment variables
 * @see packages/template/CLAUDE.md - Document environment variables in JSDoc
 *
 * Environment variables used by this component:
 * (Currently none - all config comes from props)
 */

interface ShopperAgentWindowProps {
    config: ShopperAgentConfig;
    locale: string;
    currency?: string;
    siteId: string;
    userId?: string;
    usid?: string;
    domainUrl: string;
    onReady?: () => void;
}

/**
 * Internal component that manages the Salesforce Embedded Messaging window lifecycle.
 *
 * This component handles:
 * - Script loading and initialization
 * - Event listeners for messaging lifecycle
 * - Prechat field management
 * - Conversation context handling
 * - Z-index management for maximized windows
 *
 * @param props - Component props
 * @returns null - This component doesn't render visible UI
 */
export function ShopperAgentWindow({
    config,
    locale,
    currency,
    siteId,
    userId,
    usid,
    domainUrl,
    onReady,
}: ShopperAgentWindowProps) {
    const [scriptLoaded, setScriptLoaded] = useState(false);

    const {
        embeddedServiceName,
        embeddedServiceEndpoint,
        scriptSourceUrl,
        scrt2Url,
        salesforceOrgId,
        enableConversationContext = 'false',
        conversationContext = [],
    } = config;

    /**
     * Retrieves conversation context data based on configuration.
     * If conversation context is enabled, returns the array of context values.
     * If disabled or no data available, returns empty array.
     *
     * @returns Promise resolving to array of conversation context values
     */
    const getConversationContext = (): Promise<string[]> => {
        try {
            if (enableConversationContext !== 'true') {
                return Promise.resolve([]);
            }
            if (!Array.isArray(conversationContext)) {
                logger.warn('Conversation context is enabled but no valid array data provided');
                return Promise.resolve([]);
            }
            return Promise.resolve(conversationContext);
        } catch (error) {
            logger.error('Error retrieving conversation context', { error });
            return Promise.resolve([]);
        }
    };

    /**
     * Sends conversation context data to the embedded messaging iframe.
     * Includes proper error handling and null checks for iframe elements.
     *
     * @param type - Message type to send
     * @param payload - Data payload to send
     */
    const sendConversationContext = (type: string, payload: Record<string, unknown> = {}) => {
        try {
            const el = document.querySelector('div.embedded-messaging iframe');
            const embeddedMessagingFrame = el instanceof HTMLIFrameElement ? el : null;

            if (!embeddedMessagingFrame) {
                logger.warn('Embedded messaging iframe not found');
                return;
            }

            if (!embeddedMessagingFrame.src) {
                logger.warn('Embedded messaging iframe has no source URL');
                return;
            }

            const eventData = { type, payload };
            const targetOrigin = new URL(embeddedMessagingFrame.src).origin;
            embeddedMessagingFrame.contentWindow?.postMessage(eventData, targetOrigin);
        } catch (error) {
            logger.error('Error sending conversation context', { error });
        }
    };

    /**
     * Handles incoming MIAW events requesting customer data.
     * Processes conversation context requests and sends appropriate responses.
     * Validates event.origin against the embedded service endpoint to prevent
     * untrusted cross-origin iframes from triggering handlers (postMessage security).
     *
     * @param event - The message event from the iframe
     */
    const handleMiawEvent = async (event: MessageEvent) => {
        if (event.source && event.source !== window) {
            try {
                const trustedOrigin = new URL(embeddedServiceEndpoint).origin;
                if (event.origin !== trustedOrigin) {
                    logger.warn('Message from untrusted origin', { origin: event.origin });
                    return;
                }
            } catch (error) {
                logger.error('Failed to validate message origin', { error });
                return;
            }

            try {
                if (event.data.type === 'lwc.getConversationContext') {
                    // Check if conversation context is enabled before making the call
                    if (enableConversationContext && enableConversationContext === 'true') {
                        const conversationContextData = await getConversationContext();
                        sendConversationContext('conversational.actualConversationContext', {
                            conversationContext: conversationContextData,
                        });
                    }
                } else if (event.data.type === 'lwc.getDomainUrl') {
                    // Handle domain URL request
                    sendConversationContext('conversational.domainUrl', {
                        domainUrl,
                    });
                }
            } catch (error) {
                logger.error('Error handling message event', { error });
            }
        }
    };

    /**
     * Event listener for MIAW message events
     */
    useEffect(() => {
        const handler = (e: MessageEvent) => {
            void handleMiawEvent(e);
        };
        window.addEventListener('message', handler);
        return () => {
            window.removeEventListener('message', handler);
        };
        // handleMiawEvent is recreated each render; deps below are the values it closes over
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embeddedServiceEndpoint, enableConversationContext, conversationContext, domainUrl]);

    /**
     * Load the Embedded Messaging script (once per deployment name / URL).
     */
    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (window.embeddedservice_bootstrap) {
            setScriptLoaded(true);
            return;
        }

        const existingScript = Array.from(document.querySelectorAll('script')).find((s) =>
            s.src?.includes(embeddedServiceName)
        );
        if (existingScript) {
            setScriptLoaded(true);
            return;
        }

        const script = document.createElement('script');
        script.src = scriptSourceUrl;
        script.async = true;
        script.onload = () => setScriptLoaded(true);
        script.onerror = () => {
            logger.error('Failed to load Embedded Messaging script');
        };
        document.body.appendChild(script);
        // Script is left in place for the session; no cleanup on unmount.
    }, [scriptSourceUrl, embeddedServiceName]);

    /**
     * Initialize Embedded Messaging once script is loaded (singleton to avoid race when multiple instances mount).
     */
    useEffect(() => {
        if (!scriptLoaded || !window.embeddedservice_bootstrap || initGuard) {
            return;
        }

        try {
            initGuard = true;
            const sfLocale = locale.replace('-', '_');
            window.embeddedservice_bootstrap.settings.language = sfLocale;
            window.embeddedservice_bootstrap.settings.hideChatButtonOnLoad = true;
            void window.embeddedservice_bootstrap.init(salesforceOrgId, embeddedServiceName, embeddedServiceEndpoint, {
                scrt2URL: scrt2Url,
            });
        } catch (err) {
            initGuard = false;
            logger.error('Error initializing Embedded Messaging', { error: err });
        }
    }, [scriptLoaded, salesforceOrgId, embeddedServiceName, embeddedServiceEndpoint, scrt2Url, locale]);

    /**
     * Set up event listeners for Embedded Messaging lifecycle events
     */
    useEffect(() => {
        /**
         * Sets up hidden prechat fields when the embedded messaging service is ready.
         * These fields provide context to the chat agent about the current user session.
         */
        const handleEmbeddedMessagingReady = () => {
            if (!window.embeddedservice_bootstrap?.prechatAPI) {
                logger.warn('prechatAPI not available');
                return;
            }

            try {
                const prechatFields: Record<string, string> = {
                    SiteId: siteId,
                    Locale: locale,
                    DomainURL: domainUrl,
                };

                if (currency) {
                    prechatFields.Currency = currency;
                }

                if (userId) {
                    prechatFields.UserId = userId;
                }

                if (usid) {
                    prechatFields.UsId = usid;
                }
                prechatFields.isCartMgmtSupported = 'true';
                prechatFields.OrganizationId = salesforceOrgId;

                void window.embeddedservice_bootstrap.prechatAPI.setHiddenPrechatFields(prechatFields);

                if (onReady) {
                    onReady();
                }

                // If user clicked Open chat before script was ready, open now (delay so widget can create chat button)
                if (getAndClearPendingOpen()) {
                    launchChat({ fromPendingReady: true });
                }
            } catch (error) {
                logger.error('Error setting prechat fields', { error });
            }
        };

        /**
         * Manages z-index for maximized chat windows to ensure proper layering
         * above other page elements while maintaining accessibility.
         */
        const handleEmbeddedMessagingWindowMaximized = () => {
            try {
                const zIndex = 1001;
                const el = document.body.querySelector('div.embedded-messaging iframe');
                const embeddedMessagingFrame = el instanceof HTMLIFrameElement ? el : null;
                if (embeddedMessagingFrame) {
                    embeddedMessagingFrame.style.zIndex = String(zIndex);
                }
            } catch (error) {
                logger.error('Error setting z-index', { error });
            }
        };

        /**
         * Fires after the first bot message in the conversation (e.g. welcome). Used to send a queued
         * initial shopper message so it appears after that message; see openShopperAgentAndSendMessage.
         */
        const handleEmbeddedMessagingFirstBotMessageSent = () => {
            notifyEmbeddedMessagingFirstBotMessageSent();
        };

        // Set up event listeners for messaging lifecycle events
        window.addEventListener('onEmbeddedMessagingReady', handleEmbeddedMessagingReady);
        window.addEventListener('onEmbeddedMessagingWindowMaximized', handleEmbeddedMessagingWindowMaximized);
        window.addEventListener('onEmbeddedMessagingFirstBotMessageSent', handleEmbeddedMessagingFirstBotMessageSent);

        // Cleanup function to remove event listeners on unmount
        return () => {
            window.removeEventListener('onEmbeddedMessagingReady', handleEmbeddedMessagingReady);
            window.removeEventListener('onEmbeddedMessagingWindowMaximized', handleEmbeddedMessagingWindowMaximized);
            window.removeEventListener(
                'onEmbeddedMessagingFirstBotMessageSent',
                handleEmbeddedMessagingFirstBotMessageSent
            );
        };
    }, [siteId, locale, currency, userId, usid, domainUrl, onReady, salesforceOrgId]);

    // This component doesn't render visible UI, only manages the messaging service
    return null;
}
