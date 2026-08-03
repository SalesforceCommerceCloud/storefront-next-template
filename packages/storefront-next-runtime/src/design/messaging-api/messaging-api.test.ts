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
/* oxlint-disable @typescript-eslint/await-thenable */
/* oxlint-disable @typescript-eslint/unbound-method */
import type {
    ClientApi,
    ClientEventNameMapping,
    ConfigFactory,
    HostApi,
    HostEventNameMapping,
    MessageEmitter,
    EventPayload,
} from './api-types';
import type { HostToClientConfiguration, ClientAcknowledgedEvent } from './domain-types';
import { createClientApi } from './client';
import { createHostApi } from './host';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type AnyFunction = (...args: unknown[]) => unknown;

function makeHostConnectionPromise(
    host: HostApi,
    {
        configFactory = () => Promise.resolve({ components: {}, componentTypes: {}, labels: {}, regions: {} }),
    }: { configFactory?: ConfigFactory } = {}
): Promise<void> {
    return new Promise<void>((resolve) =>
        host.connect({
            configFactory,
            onClientConnected: () => resolve(),
        })
    );
}

describe('Messaging API', () => {
    let hostWindow: Element;
    let clientWindow: Element;
    let clientEmitter: MessageEmitter<ClientEventNameMapping, HostEventNameMapping>;
    let hostEmitter: MessageEmitter<HostEventNameMapping, ClientEventNameMapping>;
    let host: HostApi;
    let client: ClientApi;
    let clientConfigs: HostToClientConfiguration[];

    function makeClientConnectionPromise({
        shouldReconnect = false,
        params = {},
    }: {
        shouldReconnect?: boolean;
        params?: Partial<Parameters<typeof client.connect>[0]>;
    } = {}): Promise<void> {
        return new Promise<void>((resolve) =>
            client.connect({
                ...params,
                onHostDisconnected: (reconnect) => {
                    if (shouldReconnect) {
                        reconnect();
                    }
                },
                onHostConnected: (config) => {
                    clientConfigs.push(config);
                    resolve();
                },
            })
        );
    }

    beforeEach(() => {
        hostWindow = document.createElement('div');
        clientWindow = document.createElement('div');
        clientConfigs = [];
        clientEmitter = {
            postMessage: (event) => clientWindow.dispatchEvent(new CustomEvent('message', { detail: event })),
            addEventListener: (handler) => {
                const boundHandler = (event: CustomEvent) => handler(event.detail);
                clientWindow.addEventListener('message', boundHandler as unknown as EventListener);

                return () => clientWindow.removeEventListener('message', boundHandler as unknown as EventListener);
            },
        };
        hostEmitter = {
            postMessage: (event) => clientWindow.dispatchEvent(new CustomEvent('message', { detail: event })),
            addEventListener: (handler) => {
                const boundHandler = (event: CustomEvent) => handler(event.detail);
                hostWindow.addEventListener('message', boundHandler as unknown as EventListener);
                return () => hostWindow.removeEventListener('message', boundHandler as unknown as EventListener);
            },
        };

        // Simulate a browser window receiving messages from the client
        clientWindow.addEventListener('message', ((event: CustomEvent<{ meta: { source: string } }>) => {
            if (event.detail.meta.source === 'client') {
                hostWindow.dispatchEvent(new CustomEvent('message', { detail: event.detail }));
            }
        }) as unknown as EventListener);

        host = createHostApi({ emitter: hostEmitter, id: 'test-host' });
        client = createClientApi({ emitter: clientEmitter, id: 'test-client' });

        vi.useFakeTimers();
    });

    afterEach(() => {
        host.disconnect();
        client.disconnect();
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    describe('initialization', () => {
        describe('when the client is initialized before the host', () => {
            it('should create a connection between the host and the client', async () => {
                const clientConnectionPromise = makeClientConnectionPromise();

                vi.advanceTimersByTime(1500);

                const hostConnectionPromise = makeHostConnectionPromise(host);

                vi.advanceTimersByTime(1500);

                await expect(Promise.all([clientConnectionPromise, hostConnectionPromise])).resolves;
                expect(client.getRemoteId()).toBe('test-host');
                expect(host.getRemoteId()).toBe('test-client');
            });

            it.each`
                usid           | expectedValue
                ${'test-usid'} | ${'test-usid'}
                ${undefined}   | ${undefined}
            `('should pass the usid ($expectedValue) to the client', async ({ usid, expectedValue }) => {
                const connect = new Promise<void>((resolve, reject) => {
                    host.on('ClientInitialized', (event) => {
                        try {
                            expect(event.usid).toBe(expectedValue);
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
                });

                void makeClientConnectionPromise(usid ? { params: { usid } } : {});
                vi.advanceTimersByTime(1500);
                void makeHostConnectionPromise(host);
                vi.advanceTimersByTime(1500);

                await connect;
            });

            it.each`
                isShopperContextEnabled | expectedValue
                ${true}                 | ${true}
                ${false}                | ${false}
                ${undefined}            | ${undefined}
            `(
                'should pass isShopperContextEnabled ($expectedValue) to the host',
                async ({ isShopperContextEnabled, expectedValue }) => {
                    const connect = new Promise<void>((resolve, reject) => {
                        host.on('ClientInitialized', (event) => {
                            try {
                                expect(event.isShopperContextEnabled).toBe(expectedValue);
                                resolve();
                            } catch (error) {
                                reject(error);
                            }
                        });
                    });

                    void makeClientConnectionPromise(
                        isShopperContextEnabled === undefined ? {} : { params: { isShopperContextEnabled } }
                    );
                    vi.advanceTimersByTime(1500);
                    void makeHostConnectionPromise(host);
                    vi.advanceTimersByTime(1500);

                    await connect;
                }
            );
        });

        describe('when an event is emitted on the client before the host', () => {
            it('should not emit the event', () => {
                vi.spyOn(clientWindow, 'dispatchEvent');
                client.connect();
                client.selectComponent({
                    componentId: 'test-component' as string,
                    contentLinkUuid: 'test-component-uuid',
                });
                expect(clientWindow.dispatchEvent).not.toHaveBeenCalledWith(
                    'message',
                    expect.objectContaining({
                        detail: expect.objectContaining({
                            eventType: 'ComponentSelected',
                        }) as unknown,
                    })
                );
            });
        });

        describe('when the host is initialized before the client', () => {
            it('should create a connection between the host and the client', async () => {
                vi.useRealTimers();

                await Promise.all([makeClientConnectionPromise(), makeHostConnectionPromise(host)]);
                expect(client.getRemoteId()).toBe('test-host');
                expect(host.getRemoteId()).toBe('test-client');
            });

            it.each`
                usid           | expectedValue
                ${'test-usid'} | ${'test-usid'}
                ${undefined}   | ${undefined}
            `('should pass the usid ($expectedValue) to the client', async ({ usid, expectedValue }) => {
                const connect = new Promise<void>((resolve, reject) => {
                    host.on('ClientInitialized', (event) => {
                        try {
                            expect(event.usid).toBe(expectedValue);
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
                });

                void makeHostConnectionPromise(host);
                vi.advanceTimersByTime(1500);
                void makeClientConnectionPromise(usid ? { params: { usid } } : {});
                vi.advanceTimersByTime(1500);

                await connect;
            });

            it.each`
                isShopperContextEnabled | expectedValue
                ${true}                 | ${true}
                ${false}                | ${false}
                ${undefined}            | ${undefined}
            `(
                'should pass isShopperContextEnabled ($expectedValue) to the host',
                async ({ isShopperContextEnabled, expectedValue }) => {
                    const connect = new Promise<void>((resolve, reject) => {
                        host.on('ClientInitialized', (event) => {
                            try {
                                expect(event.isShopperContextEnabled).toBe(expectedValue);
                                resolve();
                            } catch (error) {
                                reject(error);
                            }
                        });
                    });

                    void makeHostConnectionPromise(host);
                    vi.advanceTimersByTime(1500);
                    void makeClientConnectionPromise(
                        isShopperContextEnabled === undefined ? {} : { params: { isShopperContextEnabled } }
                    );
                    vi.advanceTimersByTime(1500);

                    await connect;
                }
            );
        });

        describe('when the client times out waiting for the host to connect', () => {
            let now: number;

            beforeEach(() => {
                now = 1000;
                vi.spyOn(Date, 'now').mockImplementation(() => now);
            });

            it('should throw an error', () => {
                expect(() => {
                    client.connect({ timeout: 5_000 });
                    now = 10_000;
                    vi.advanceTimersByTime(10_000);
                }).toThrow(/Timed out/g);
            });
        });

        describe('when connecting multiple times', () => {
            describe('when connecting the client', () => {
                it('should only maintain a single connection', async () => {
                    vi.useRealTimers();

                    await Promise.all([makeClientConnectionPromise(), makeHostConnectionPromise(host)]);
                    // Connected
                    await makeClientConnectionPromise();
                    await makeClientConnectionPromise();

                    const spy = vi.fn();

                    client.on('ComponentSelected', spy);
                    host.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                    expect(spy).toHaveBeenCalledTimes(1);
                });
            });

            describe('when connecting the host', () => {
                it('should only maintain a single connection', async () => {
                    vi.useRealTimers();

                    await Promise.all([
                        makeClientConnectionPromise({ shouldReconnect: true }),
                        makeHostConnectionPromise(host),
                    ]);
                    // Connected
                    await makeHostConnectionPromise(host);
                    await makeHostConnectionPromise(host);

                    const spy = vi.fn();

                    host.on('ComponentSelected', spy);
                    client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                    expect(spy).toHaveBeenCalledTimes(1);
                });
            });
        });
    });

    describe('when sending events during the connection process', () => {
        beforeEach(() => {
            vi.useRealTimers();
        });

        it('should queue the events until the connection is established', async () => {
            let resolveConfig: (
                value: EventPayload<ClientAcknowledgedEvent> | PromiseLike<EventPayload<ClientAcknowledgedEvent>>
            ) => void;
            const spy = vi.fn();
            const promise = new Promise<EventPayload<ClientAcknowledgedEvent>>((resolve) => {
                resolveConfig = resolve;
            });

            const hostPromise = makeHostConnectionPromise(host, { configFactory: () => promise });
            const clientPromise = makeClientConnectionPromise();

            client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
            client.selectComponent({ componentId: 'test-component-2', contentLinkUuid: 'test-component-2-uuid' });

            host.on('ComponentSelected', spy);

            // @ts-expect-error - We are assigning this above in the promise constructor
            resolveConfig({ components: {}, componentTypes: {}, labels: {}, regions: {} });

            await Promise.all([hostPromise, clientPromise]);

            expect(spy).toHaveBeenCalledTimes(2);
            expect(spy).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'ComponentSelected',
                    componentId: 'test-component',
                })
            );
            expect(spy).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'ComponentSelected',
                    componentId: 'test-component-2',
                })
            );
        });
    });

    describe('when connected', () => {
        beforeEach(async () => {
            await Promise.all([
                makeHostConnectionPromise(host),
                makeClientConnectionPromise({ shouldReconnect: true }),
            ]);
        });

        describe('when the client disconnects', () => {
            beforeEach(() => {
                vi.useRealTimers();
            });

            it('should be able to reconnect back to the host', async () => {
                client.disconnect();

                expect(client.getRemoteId()).toBeUndefined();
                expect(host.getRemoteId()).toBeUndefined();

                await makeClientConnectionPromise();

                expect(client.getRemoteId()).toBe('test-host');
                expect(host.getRemoteId()).toBe('test-client');
            });
        });

        describe('when the host disconnects', () => {
            beforeEach(() => {
                vi.useRealTimers();
            });

            it('should be able to reconnect back to the client', async () => {
                host.disconnect();

                expect(client.getRemoteId()).toBeUndefined();
                expect(host.getRemoteId()).toBeUndefined();

                await makeHostConnectionPromise(host);

                expect(client.getRemoteId()).toBe('test-host');
                expect(host.getRemoteId()).toBe('test-client');
            });
        });

        describe('when events are received from a different source', () => {
            it('should not call the handler', () => {
                const spy = vi.fn();

                host.on('ComponentSelected', spy);
                hostWindow.dispatchEvent(
                    new CustomEvent('message', {
                        detail: { eventType: 'ComponentSelected' },
                    })
                );

                expect(spy).not.toHaveBeenCalled();
            });
        });

        describe('when an event is emitted on the client', () => {
            it('should emit the event on the host', () => {
                return new Promise<void>((resolve) => {
                    host.on('ComponentSelected', (event) => {
                        expect(event).toEqual({
                            eventType: 'ComponentSelected',
                            componentId: 'test-component',
                            contentLinkUuid: 'test-component-uuid',
                            meta: {
                                source: 'client',
                                clientId: 'test-client',
                                hostId: 'test-host',
                                pdMessagingApi: true,
                            },
                        });
                        resolve();
                    });
                    client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                });
            });
        });

        describe('when an event is emitted on the host', () => {
            it('should emit the event on the client', () => {
                return new Promise<void>((resolve) => {
                    client.on('ComponentSelected', (event) => {
                        expect(event).toEqual({
                            eventType: 'ComponentSelected',
                            componentId: 'test-component',
                            contentLinkUuid: 'test-component-uuid',
                            meta: {
                                source: 'host',
                                clientId: 'test-client',
                                hostId: 'test-host',
                                pdMessagingApi: true,
                            },
                        });
                        resolve();
                    });
                    host.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                });
            });
        });
        describe('when unsubscribing from an event', () => {
            it('should not emit the event', () => {
                let callCount = 0;

                const unsubscribe = client.on('ComponentSelected', () => {
                    callCount += 1;
                });

                host.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                expect(callCount).toBe(1);
                host.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                expect(callCount).toBe(2);
                unsubscribe();
                host.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                expect(callCount).toBe(2);
            });
        });

        describe('when emitting an event that is handled by both the client and the host', () => {
            it('should not emit the event on the same source', () => {
                const spy = vi.fn();
                const clientSpy = vi.fn();

                host.on('ComponentSelected', spy);
                client.on('ComponentSelected', clientSpy);
                host.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                expect(clientSpy).toHaveBeenCalledTimes(1);
                expect(spy).not.toHaveBeenCalled();

                client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                expect(clientSpy).toHaveBeenCalledTimes(1);
                expect(spy).toHaveBeenCalledTimes(1);
            });
        });

        describe('when there are no event listeners for an event', () => {
            it('should not error on the remote connection', () => {
                expect(() =>
                    client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' })
                ).not.toThrow();
            });
        });

        describe('when the client configuration changes', () => {
            it('should invoke the onHostConnected callback with the new configuration', () => {
                const config = {
                    components: { 'test-component': { id: 'test-component', type: 'test-type' } },
                    componentTypes: {},
                    labels: {},
                    locale: 'en-US',
                    regions: {},
                };
                expect(clientConfigs).toHaveLength(1);
                host.setClientConfiguration(config);

                expect(clientConfigs).toHaveLength(2);
                expect(clientConfigs[1]).toEqual(expect.objectContaining(config));
            });
        });

        describe('when there are multiple subscriptions to the same event', () => {
            it('should invoke all handlers', () => {
                const spy1 = vi.fn();
                const spy2 = vi.fn();

                host.on('ComponentSelected', spy1);
                host.on('ComponentSelected', spy2);
                client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                expect(spy1).toHaveBeenCalledTimes(1);
                expect(spy2).toHaveBeenCalledTimes(1);
            });

            describe('when unsubscribing from an event', () => {
                it('should only unsubscribe for that subscription', () => {
                    const spy1 = vi.fn();
                    const spy2 = vi.fn();

                    const unsub1 = host.on('ComponentSelected', spy1);
                    const unsub2 = host.on('ComponentSelected', spy2);
                    client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                    expect(spy1).toHaveBeenCalledTimes(1);
                    expect(spy2).toHaveBeenCalledTimes(1);

                    unsub1();
                    client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                    expect(spy1).toHaveBeenCalledTimes(1);
                    expect(spy2).toHaveBeenCalledTimes(2);

                    unsub2();
                    client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                    expect(spy1).toHaveBeenCalledTimes(1);
                    expect(spy2).toHaveBeenCalledTimes(2);
                });
            });

            describe('when unsubscribing from an event multiple times', () => {
                it('should not throw an error', () => {
                    const spy1 = vi.fn();
                    const unsub1 = host.on('ComponentSelected', spy1);

                    client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                    expect(spy1).toHaveBeenCalledTimes(1);

                    unsub1();
                    client.selectComponent({ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' });
                    expect(spy1).toHaveBeenCalledTimes(1);

                    expect(() => unsub1()).not.toThrow();
                });
            });
        });

        describe.each`
            method                         | eventName                   | payload
            ${'addComponentToRegion'}      | ${'ComponentAddedToRegion'} | ${{ componentId: 'test-component', componentType: 'test-specifier', componentProperties: { test: 'value' }, targetComponentId: 'target-component', targetRegionId: 'test-region' }}
            ${'moveComponentToRegion'}     | ${'ComponentMovedToRegion'} | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid', targetComponentId: 'target-component', targetRegionId: 'target-region', sourceRegionId: 'source-region', sourceComponentId: 'source-component' }}
            ${'notifyClientReady'}         | ${'ClientReady'}            | ${{ clientId: 'test-client' }}
            ${'startComponentDrag'}        | ${'ComponentDragStarted'}   | ${{ componentId: 'test-component', x: 100, y: 200 }}
            ${'hoverInToComponent'}        | ${'ComponentHoveredIn'}     | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' }}
            ${'hoverOutOfComponent'}       | ${'ComponentHoveredOut'}    | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' }}
            ${'selectComponent'}           | ${'ComponentSelected'}      | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' }}
            ${'deselectComponent'}         | ${'ComponentDeselected'}    | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' }}
            ${'deleteComponent'}           | ${'ComponentDeleted'}       | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid', sourceComponentId: 'source-component', sourceRegionId: 'source-region' }}
            ${'notifyWindowScrollChanged'} | ${'WindowScrollChanged'}    | ${{ scrollX: 100, scrollY: 200 }}
            ${'notifyError'}               | ${'Error'}                  | ${{ message: 'Test error message', code: 'TEST_ERROR' }}
        `(
            'when $method is called on the client',
            ({
                method,
                eventName,
                payload,
            }: {
                method: keyof ClientApi & keyof HostApi;
                eventName: keyof ClientEventNameMapping & keyof HostEventNameMapping;
                payload: Record<string, unknown>;
            }) => {
                it('should emit the event ($eventName) on the host', () => {
                    return new Promise<void>((resolve) => {
                        host.on(eventName, (event) => {
                            expect(event).toEqual({
                                ...payload,
                                eventType: eventName,
                                meta: {
                                    source: 'client',
                                    clientId: 'test-client',
                                    hostId: 'test-host',
                                    pdMessagingApi: true,
                                },
                            });
                            resolve();
                        });

                        (client[method] as AnyFunction)(payload);
                    });
                });
            }
        );

        describe.each`
            method                             | eventName                       | payload
            ${'addComponentToRegion'}          | ${'ComponentAddedToRegion'}     | ${{ componentId: 'test-component', componentType: 'test-specifier', componentProperties: { test: 'value' }, targetComponentId: 'target-component', targetRegionId: 'test-region' }}
            ${'moveComponentToRegion'}         | ${'ComponentMovedToRegion'}     | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid', targetComponentId: 'target-component', targetRegionId: 'target-region', sourceRegionId: 'source-region', sourceComponentId: 'source-component' }}
            ${'startComponentDrag'}            | ${'ComponentDragStarted'}       | ${{ componentId: 'test-component', x: 100, y: 200 }}
            ${'hoverInToComponent'}            | ${'ComponentHoveredIn'}         | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' }}
            ${'hoverOutOfComponent'}           | ${'ComponentHoveredOut'}        | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' }}
            ${'selectComponent'}               | ${'ComponentSelected'}          | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' }}
            ${'deselectComponent'}             | ${'ComponentDeselected'}        | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid' }}
            ${'deleteComponent'}               | ${'ComponentDeleted'}           | ${{ componentId: 'test-component', contentLinkUuid: 'test-component-uuid', sourceComponentId: 'source-component', sourceRegionId: 'source-region' }}
            ${'forwardKeyPress'}               | ${'HostKeyPressed'}             | ${{ key: 'ArrowUp' }}
            ${'notifyClientWindowDragDropped'} | ${'ClientWindowDragDropped'}    | ${{ componentId: 'test-component', x: 100, y: 200 }}
            ${'notifyClientWindowDragEntered'} | ${'ClientWindowDragEntered'}    | ${{ componentId: 'test-component', x: 100, y: 200 }}
            ${'notifyClientWindowDragMoved'}   | ${'ClientWindowDragMoved'}      | ${{ componentId: 'test-component', x: 100, y: 200 }}
            ${'notifyClientWindowDragExited'}  | ${'ClientWindowDragExited'}     | ${{ componentId: 'test-component', x: 100, y: 200 }}
            ${'setComponentProperties'}        | ${'ComponentPropertiesChanged'} | ${{ componentId: 'test-component', properties: { test: 'value' } }}
            ${'notifyPageSettingsChanged'}     | ${'PageSettingsChanged'}        | ${{ settings: { theme: 'dark' } }}
            ${'notifyMediaChanged'}            | ${'MediaChangedEvent'}          | ${{}}
            ${'notifyError'}                   | ${'Error'}                      | ${{ message: 'Test error message', code: 'TEST_ERROR' }}
            ${'setClientConfiguration'}        | ${'ClientConfigurationChanged'} | ${{ components: {}, componentTypes: {}, labels: {}, locale: 'en-US', regions: {} }}
        `(
            'when $method is called on the host',
            ({
                method,
                eventName,
                payload,
            }: {
                method: keyof HostApi & keyof ClientApi;
                eventName: keyof HostEventNameMapping & keyof ClientEventNameMapping;
                payload: Record<string, unknown>;
            }) => {
                it('should emit the event ($eventName) on the client', () => {
                    return new Promise<void>((resolve) => {
                        client.on(eventName, (event) => {
                            expect(event).toEqual({
                                ...payload,
                                eventType: eventName,
                                meta: {
                                    source: 'host',
                                    clientId: 'test-client',
                                    hostId: 'test-host',
                                    pdMessagingApi: true,
                                },
                            });
                            resolve();
                        });

                        (host[method] as AnyFunction)(payload);
                    });
                });
            }
        );
    });
});
