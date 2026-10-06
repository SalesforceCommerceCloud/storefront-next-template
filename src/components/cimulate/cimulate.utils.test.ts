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
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import {
    buildMessagingWidgetOptions,
    flushPendingCimulateActions,
    openAgentWidgetAndSendMessage,
    resolveShopperAgentConfig,
    type CimulateConfig,
} from './cimulate.utils';

const populated: CimulateConfig = {
    enabled: 'true',
    commerceClientScriptSourceUrl: 'https://cdn.example.cimulate.ai/widget.umd.js',
    scrt2Url: 'https://scrt2.example.salesforce.com',
    salesforceOrgId: 'org-A',
    esDeveloperName: 'ES_A',
};

const legacy: CimulateConfig = {
    enabled: 'true',
    commerceClientScriptSourceUrl: 'https://cdn.legacy.cimulate.ai/widget.umd.js',
    scrt2Url: 'https://scrt2.legacy.salesforce.com',
    salesforceOrgId: 'org-B',
    esDeveloperName: 'ES_B',
};

const emptyDefault: CimulateConfig = {
    enabled: '',
    commerceClientScriptSourceUrl: '',
    scrt2Url: '',
    salesforceOrgId: '',
    esDeveloperName: '',
};

describe('openAgentWidgetAndSendMessage', () => {
    afterEach(() => {
        window.CimulateMessaging = {
            injectMessagingWidget: vi.fn(),
            eventHandlers: {
                components: { toggleWidgetOpen: vi.fn() },
                messaging: { sendMessage: vi.fn() },
            },
        };
        flushPendingCimulateActions();
        delete window.CimulateMessaging;
    });

    test('opens the widget and sends when the SDK is ready', () => {
        const sendMessage = vi.fn();
        const toggleWidgetOpen = vi.fn();
        window.CimulateMessaging = {
            injectMessagingWidget: vi.fn(),
            eventHandlers: {
                components: { toggleWidgetOpen },
                messaging: { sendMessage },
            },
        };

        openAgentWidgetAndSendMessage('Help me find a watch.');

        expect(toggleWidgetOpen).toHaveBeenCalledWith(true);
        expect(sendMessage).toHaveBeenCalledWith('Help me find a watch.');
    });

    test('queues the message until the SDK is flushed', () => {
        const sendMessage = vi.fn();
        openAgentWidgetAndSendMessage('queued');
        expect(sendMessage).not.toHaveBeenCalled();

        window.CimulateMessaging = {
            injectMessagingWidget: vi.fn(),
            eventHandlers: {
                components: { toggleWidgetOpen: vi.fn() },
                messaging: { sendMessage },
            },
        };
        flushPendingCimulateActions();
        expect(sendMessage).toHaveBeenCalledWith('queued');
    });
});

describe('resolveShopperAgentConfig', () => {
    it('returns commerce.shopperAgent when it is populated', () => {
        const result = resolveShopperAgentConfig({
            commerce: { shopperAgent: populated },
            cimulateAgent: legacy,
        });
        expect(result).toBe(populated);
    });

    it('falls back to legacy cimulateAgent when commerce.shopperAgent is missing', () => {
        const result = resolveShopperAgentConfig({ cimulateAgent: legacy });
        expect(result).toBe(legacy);
    });

    it('falls back to legacy cimulateAgent when commerce.shopperAgent is the empty default', () => {
        // Shipped default has empty strings for enabled/scriptSourceUrl — the resolver
        // must not treat that as "user set the new env var" and shadow the legacy value.
        const result = resolveShopperAgentConfig({
            commerce: { shopperAgent: emptyDefault },
            cimulateAgent: legacy,
        });
        expect(result).toBe(legacy);
    });

    it('prefers commerce.shopperAgent when enabled is truthy (boolean)', () => {
        const shopperAgent: CimulateConfig = { ...emptyDefault, enabled: true };
        const result = resolveShopperAgentConfig({
            commerce: { shopperAgent },
            cimulateAgent: legacy,
        });
        expect(result).toBe(shopperAgent);
    });

    it('prefers commerce.shopperAgent when only commerceClientScriptSourceUrl is set (enabled still empty)', () => {
        const shopperAgent: CimulateConfig = {
            ...emptyDefault,
            commerceClientScriptSourceUrl: 'https://cdn.example.cimulate.ai/widget.umd.js',
        };
        const result = resolveShopperAgentConfig({
            commerce: { shopperAgent },
            cimulateAgent: legacy,
        });
        expect(result).toBe(shopperAgent);
    });

    it('returns undefined when neither is set', () => {
        expect(resolveShopperAgentConfig({})).toBeUndefined();
        expect(resolveShopperAgentConfig(undefined)).toBeUndefined();
        expect(resolveShopperAgentConfig(null)).toBeUndefined();
    });

    it('returns commerce.shopperAgent when legacy is absent', () => {
        const result = resolveShopperAgentConfig({ commerce: { shopperAgent: populated } });
        expect(result).toBe(populated);
    });
});

describe('buildMessagingWidgetOptions', () => {
    it('applies default options when no cc_ keys are set', () => {
        const options = buildMessagingWidgetOptions(populated);

        expect(options.elementId).toBe('cimulate-messaging-container');
        expect(options.mode).toBe('messaging');
        expect(options.globalClassName).toBe('commerce-client-shopper-agent');
        expect(options.isDevelopment).toBe(false);
        // Connection fields go to messagingConfig; the defaulted knobs fill the rest.
        expect(options.messagingConfig).toMatchObject({
            scrt2Url: 'https://scrt2.example.salesforce.com',
            orgId: 'org-A',
            esDeveloperName: 'ES_A',
            capabilitiesVersion: '65',
            enableDownloadTranscript: true,
            enableEscalationToAgent: false,
        });
        // 'panel' renders as a full-height dialog.
        expect(options.componentConfig).toEqual({
            isOpen: false,
            type: 'dialog',
            options: {
                dialogPosition: 'bottom-right',
                dialogFullHeight: true,
                dialogWidth: '420px',
            },
        });
    });

    it('does not set routingAttributes or showProductCaptions on messagingConfig when unset', () => {
        const { messagingConfig } = buildMessagingWidgetOptions(populated);
        expect(messagingConfig).not.toHaveProperty('routingAttributes');
        expect(messagingConfig).not.toHaveProperty('showProductCaptions');
    });

    it('honors explicit overrides of the defaulted keys', () => {
        const options = buildMessagingWidgetOptions({
            ...populated,
            cc_capabilitiesVersion: '64',
            cc_enableDownloadTranscript: 'false',
            cc_enableEscalationToAgent: 'true',
            cc_isOpen: 'true',
            cc_widgetPosition: 'bottom-left',
            cc_dialogFullHeight: 'false',
            commerceClientPanelWidth: '520px',
        });

        expect(options.messagingConfig).toMatchObject({
            capabilitiesVersion: '64',
            enableDownloadTranscript: false,
            enableEscalationToAgent: true,
        });
        expect(options.componentConfig).toEqual({
            isOpen: true,
            type: 'dialog',
            options: {
                dialogPosition: 'bottom-left',
                dialogFullHeight: false,
                dialogWidth: '520px',
            },
        });
    });

    it('omits optional pass-throughs when unset', () => {
        const options = buildMessagingWidgetOptions(populated);
        expect(options).not.toHaveProperty('messageAlignment');
        expect(options).not.toHaveProperty('autoScroll');
        expect(options).not.toHaveProperty('openLinksInNewTab');
        expect(options).not.toHaveProperty('showProductDescription');
        expect(options).not.toHaveProperty('progressStepsLimit');
        expect(options).not.toHaveProperty('headerConfig');
        expect(options).not.toHaveProperty('suggestionButtonConfig');
        expect(options).not.toHaveProperty('promptsConfig');
        expect(options).not.toHaveProperty('overrides');
        expect(options).not.toHaveProperty('overridesUrl');
    });

    it('forwards optional pass-throughs when set', () => {
        const options = buildMessagingWidgetOptions({
            ...populated,
            cc_messageAlignment: 'left',
            cc_autoScroll: 'true',
            cc_openLinksInNewTab: 'false',
            cc_showProductDescription: 'true',
            cc_progressStepsLimit: '4',
            cc_headerConfig: { title: 'Shop' },
            cc_suggestionButtonConfig: { max: 3 },
            cc_promptsConfig: { greeting: 'Hi' },
        });

        expect(options.messageAlignment).toBe('left');
        expect(options.autoScroll).toBe(true);
        expect(options.openLinksInNewTab).toBe(false);
        expect(options.showProductDescription).toBe(true);
        expect(options.progressStepsLimit).toBe(4);
        expect(options.headerConfig).toEqual({ title: 'Shop' });
        expect(options.suggestionButtonConfig).toEqual({ max: 3 });
        expect(options.promptsConfig).toEqual({ greeting: 'Hi' });
    });

    it('routes cc_showProductCaptions into messagingConfig', () => {
        const options = buildMessagingWidgetOptions({ ...populated, cc_showProductCaptions: 'true' });
        expect(options.messagingConfig.showProductCaptions).toBe(true);
    });

    it('coerces boolean-typed cc_ values, not just strings', () => {
        const options = buildMessagingWidgetOptions({
            ...populated,
            cc_isOpen: true,
            cc_autoScroll: false,
            cc_enableEscalationToAgent: true,
        });
        expect(options.componentConfig.isOpen).toBe(true);
        expect(options.autoScroll).toBe(false);
        expect(options.messagingConfig.enableEscalationToAgent).toBe(true);
    });

    it('coerces a numeric cc_progressStepsLimit and drops a non-numeric one', () => {
        expect(buildMessagingWidgetOptions({ ...populated, cc_progressStepsLimit: 6 }).progressStepsLimit).toBe(6);
        expect(buildMessagingWidgetOptions({ ...populated, cc_progressStepsLimit: 'abc' })).not.toHaveProperty(
            'progressStepsLimit'
        );
    });

    it('prefers an inline cc_overrides map over cc_overridesUrl', () => {
        const options = buildMessagingWidgetOptions({
            ...populated,
            cc_overrides: { ProductCard: 'CustomCard' },
            cc_overridesUrl: 'https://cdn.example.com/overrides.js',
        });
        expect(options.overrides).toEqual({ ProductCard: 'CustomCard' });
        expect(options).not.toHaveProperty('overridesUrl');
    });

    it('uses cc_overridesUrl when it is HTTPS and no inline overrides are set', () => {
        const options = buildMessagingWidgetOptions({
            ...populated,
            cc_overridesUrl: 'https://cdn.example.com/overrides.js',
        });
        expect(options.overridesUrl).toBe('https://cdn.example.com/overrides.js');
        expect(options).not.toHaveProperty('overrides');
    });

    it('ignores a non-HTTPS cc_overridesUrl and an empty inline map', () => {
        const nonHttps = buildMessagingWidgetOptions({
            ...populated,
            cc_overridesUrl: 'http://cdn.example.com/overrides.js',
        });
        expect(nonHttps).not.toHaveProperty('overridesUrl');
        expect(nonHttps).not.toHaveProperty('overrides');

        const emptyMap = buildMessagingWidgetOptions({
            ...populated,
            cc_overrides: {},
            cc_overridesUrl: 'https://cdn.example.com/overrides.js',
        });
        // Empty inline map is not a real override — fall through to the HTTPS URL.
        expect(emptyMap.overridesUrl).toBe('https://cdn.example.com/overrides.js');
        expect(emptyMap).not.toHaveProperty('overrides');
    });

    it('keeps a non-panel display mode with its own type and position-only options', () => {
        const options = buildMessagingWidgetOptions({
            ...populated,
            commerceClientDisplayMode: 'modal',
            cc_widgetPosition: 'top-right',
            cc_isOpen: 'true',
        });
        expect(options.componentConfig).toEqual({
            isOpen: true,
            type: 'modal',
            options: { dialogPosition: 'top-right' },
        });
    });

    it('merges commerceClientTheme over the defaults', () => {
        const options = buildMessagingWidgetOptions({ ...populated, commerceClientTheme: { primaryColor: '#ff0000' } });
        expect(options.theme.primaryColor).toBe('#ff0000');
        // Untouched defaults survive the merge.
        expect(options.theme.backgroundColor).toBe('#ffffff');
    });

    it('forwards routingAttributes into messagingConfig when present', () => {
        const options = buildMessagingWidgetOptions({ ...populated, routingAttributes: { queue: 'sales' } });
        expect(options.messagingConfig.routingAttributes).toEqual({ queue: 'sales' });
    });

    it('passes through headerText, disclaimerMarkdown, logoUrl and searchConfig when set', () => {
        const options = buildMessagingWidgetOptions({
            ...populated,
            headerText: 'Ask us anything',
            disclaimerMarkdown: '_AI generated_',
            commerceClientLogoUrl: 'https://cdn.example.cimulate.ai/logo.svg',
            commerceClientSearchConfig: { placeholder: 'Search…' },
        });
        expect(options.headerText).toBe('Ask us anything');
        expect(options.disclaimerMarkdown).toBe('_AI generated_');
        expect(options.logoUrl).toBe('https://cdn.example.cimulate.ai/logo.svg');
        expect(options.searchConfig).toEqual({ placeholder: 'Search…' });
    });
});
