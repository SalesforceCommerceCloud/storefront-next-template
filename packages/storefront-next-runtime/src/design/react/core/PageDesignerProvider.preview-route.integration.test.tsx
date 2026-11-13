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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { PageDesignerProvider } from './PageDesignerProvider';

describe('PageDesignerProvider preview route reporting integration', () => {
    let navigationDescriptor: PropertyDescriptor | undefined;

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        if (navigationDescriptor) {
            Object.defineProperty(window, 'navigation', navigationDescriptor);
        } else {
            Reflect.deleteProperty(window, 'navigation');
        }
        navigationDescriptor = undefined;
    });

    it('delivers an acknowledged ClientRouteChanged after a browser navigation through the real lazy PreviewProvider', async () => {
        window.history.replaceState({}, '', '/initial?mode=PREVIEW');
        navigationDescriptor = Object.getOwnPropertyDescriptor(window, 'navigation');
        const navigation = new EventTarget();
        Object.defineProperty(window, 'navigation', { configurable: true, value: navigation });
        const postMessage = vi.spyOn(window.parent, 'postMessage');

        render(
            <PageDesignerProvider clientId="storefront-next" targetOrigin="*" mode="PREVIEW">
                <div>Preview storefront</div>
            </PageDesignerProvider>
        );

        await waitFor(() =>
            expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'ClientInitialized' }), '*')
        );

        window.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    eventType: 'ClientAcknowledged',
                    components: {},
                    componentTypes: {},
                    labels: {},
                    regions: {},
                    meta: {
                        pdMessagingApi: true,
                        source: 'host',
                        hostId: 'page-designer-host',
                        clientId: 'storefront-next',
                    },
                },
            })
        );

        await screen.findByText('Preview storefront');
        window.history.replaceState({}, '', '/category/new');
        navigation.dispatchEvent(new Event('currententrychange'));

        await waitFor(() =>
            expect(postMessage).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    eventType: 'ClientRouteChanged',
                    url: `${window.location.origin}/category/new`,
                }),
                '*'
            )
        );
    });
});
