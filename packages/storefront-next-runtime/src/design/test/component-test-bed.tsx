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
/* eslint-disable react-refresh/only-export-components */
import { render as tlRender, act, waitFor, type RenderResult, cleanup as tlCleanup } from '@testing-library/react';
import type { HostToClientConfiguration } from '../messaging-api/domain-types';
import type { HostApi } from '../messaging-api/api-types';
import { createHostApi } from '../messaging-api/host';
import { createReactComponentDesignDecorator } from '../react/core/ComponentDecorator';
import type {
    ComponentDecoratorProps,
    RegionDesignMetadata,
    RegionDecoratorProps,
} from '../react/core/component.types';
import { PageDesignerProvider } from '../react/core/PageDesignerProvider';
import { createTestBed } from './test-bed';
import { createReactRegionDesignDecorator } from '../react/core/RegionDecorator';
import { ComponentContext } from '../react/core/ComponentContext';
import { PageDesignerPageMetadataProvider } from '../react/core/PageDesignerPageMetadataProvider';
import { beforeEach, expect, afterEach } from 'vitest';
import type { RecursivePartial } from './types';

// Preload the dynamic context
import '../react/context/DesignContext';

// eslint-disable-next-line react/prop-types
const TestRegion: React.FC<React.PropsWithChildren> = ({ children }) => <div data-testid="test-region">{children}</div>;

type Result = RenderResult & { element: HTMLElement; host: HostApi; root: HTMLElement; region: HTMLElement };

// Mirrors the component tree the bed renders below (region "test-region" with
// components test-1/2/3), supplied to PageDesignerPageMetadataProvider so design
// metadata resolves. Embeddedness is declared solely by EmbeddedSubtreeProvider
// (from the owner's `embedded` flag), which the bed never wraps — so the bed's
// components are always page content and design interaction is never suppressed,
// regardless of what this fixture lists.
export const TEST_PAGE = {
    id: 'test-page',
    typeId: 'test-page-type',
    regions: [
        {
            id: 'test-region',
            components: [
                { id: 'test-1', typeId: 'commerce.test', contentLinkUuid: 'test-1-uuid' },
                { id: 'test-2', typeId: 'commerce.test', contentLinkUuid: 'test-2-uuid' },
                { id: 'test-3', typeId: 'commerce.test', contentLinkUuid: 'test-3-uuid' },
            ],
        },
    ],
};

export function createComponentTestBed<TState extends Record<string, unknown>>(state: () => TState) {
    let afterHostCreatedFns: ((host: HostApi) => void)[];

    beforeEach(() => {
        afterHostCreatedFns = [];
    });

    afterEach(() => {
        tlCleanup();
    });

    const testBed = createTestBed({
        renderer: async (
            component: React.FC<React.PropsWithChildren>,
            {
                props = {},
                regionMetadata = { id: 'test-region', contentLinkUuids: ['test-1-uuid', 'test-2-uuid', 'test-3-uuid'] },
                waitForHost = true,
                configFactory,
            }: {
                props?: RecursivePartial<ComponentDecoratorProps<object>>;
                regionMetadata?: Partial<RegionDecoratorProps<unknown>['designMetadata']>;
                waitForHost?: boolean;
                configFactory?: () => Promise<HostToClientConfiguration>;
            } = {}
        ) => {
            const DecoratedComponent = createReactComponentDesignDecorator(component);
            const DecoratedRegion = createReactRegionDesignDecorator(TestRegion);
            const host = testBed.setupHost();
            // Pass null here to have an unset mode.
            const mode = testBed.state.mode === undefined ? 'EDIT' : testBed.state.mode;

            if (mode) {
                const originalLocation = window.location;

                Reflect.deleteProperty(window, 'location');
                window.location = {
                    ...originalLocation,
                    search: `?mode=${mode}`,
                } as string & Location;

                testBed.cleanup(() => {
                    window.location = originalLocation as string & Location;
                });
            }

            const designMetadata = {
                id: 'test-1',
                contentLinkUuid: 'test-1-uuid',
                isVisible: true,
                isFragment: false,
                ...props.designMetadata,
            } as unknown as ComponentDecoratorProps<object>['designMetadata'];

            Object.assign(props, { designMetadata });

            const defaultConfigFactory = () =>
                Promise.resolve({
                    locale: 'en-US',
                    components: {
                        'test-1': {
                            id: 'test-1',
                            name: 'Test 1',
                            type: 'commerce.test',
                        },
                    },
                    componentTypes: {
                        'commerce.test': {
                            id: 'commerce.test',
                            name: 'Commerce Test',
                            label: 'Commerce Test',
                            image: 'https://via.placeholder.com/150',
                        },
                    },
                    labels: {},
                    regions: {},
                });

            const connectionPromise = new Promise<void>((resolve, reject) => {
                host.connect({
                    configFactory: () => Promise.resolve(configFactory?.() ?? defaultConfigFactory()),
                    onClientConnected: () => resolve(),
                    onError: (error) => reject(error),
                });
            });

            afterHostCreatedFns.forEach((fn) => fn(host));

            const result = tlRender(
                <PageDesignerProvider clientId="test1" targetOrigin="*">
                    <PageDesignerPageMetadataProvider page={TEST_PAGE}>
                        <ComponentContext.Provider value={{ componentId: 'test-parent' }}>
                            <DecoratedRegion designMetadata={regionMetadata as RegionDesignMetadata}>
                                <DecoratedComponent {...(props as unknown as ComponentDecoratorProps<object>)}>
                                    Test Content
                                </DecoratedComponent>
                                {/* Other components that we could drag over */}
                                <DecoratedComponent
                                    designMetadata={{
                                        id: 'test-2',
                                        contentLinkUuid: 'test-2-uuid',
                                        isFragment: false,
                                        isVisible: true,
                                        isLocalized: true,
                                    }}
                                />
                                <DecoratedComponent
                                    designMetadata={{
                                        id: 'test-3',
                                        contentLinkUuid: 'test-3-uuid',
                                        isFragment: false,
                                        isVisible: true,
                                        isLocalized: true,
                                    }}
                                />
                            </DecoratedRegion>
                        </ComponentContext.Provider>
                    </PageDesignerPageMetadataProvider>
                </PageDesignerProvider>
            );

            // Wait for Suspense to resolve by waiting for test content to appear
            // This indicates the lazy DesignProvider has loaded and rendered
            await result.findAllByText('Test Content', {}, { timeout: 5_000 });

            if (mode && waitForHost) {
                await act(() => connectionPromise);
            }

            const finalResult = Object.assign(result, {
                host,
                root: result.container,
                region: result.container.querySelector('.pd-design__region'),
                element: result.container.querySelector('.pd-design__decorator:not(.pd-design__region)'),
            }) as Result;

            return finalResult;
        },
        state: () => ({
            ...state(),
            mode: 'EDIT' as 'EDIT' | 'PREVIEW' | null,
        }),
        methods: {
            afterHostCreated: (fn: (host: HostApi) => void) => {
                afterHostCreatedFns.push(fn);
            },
            findBySelector: (element: HTMLElement, selector: string) =>
                waitFor(() => {
                    const node = element.querySelector(selector);

                    expect(node).toBeDefined();

                    return node as HTMLElement;
                }),
            setupHost: () => {
                const emitter: Parameters<typeof createHostApi>[0]['emitter'] = {
                    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                    postMessage: (message: any) => window.postMessage(message, '*'),
                    addEventListener: (handler) => {
                        const listener = (event: MessageEvent) => handler(event.data);

                        window.parent.addEventListener('message', listener);

                        return () => window.parent.removeEventListener('message', listener);
                    },
                };

                const host = createHostApi({ emitter, id: 'test-host' });

                testBed.cleanup(
                    () =>
                        new Promise((resolve) => {
                            host.disconnect();
                            setTimeout(resolve, 0);
                        })
                );

                return host;
            },
        },
    });

    return testBed;
}
