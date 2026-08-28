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
import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useComponentUpdateInteraction } from './useComponentUpdateInteraction';
import { useDesignContext } from '../context/DesignContext';
import type { ClientApi } from '../../messaging-api';

vi.mock('../context/DesignContext');

/**
 * Minimal ClientApi stand-in. `on` records each (eventName -> dispatcher) pair so
 * tests can drive host events through the exact dispatcher `useInteraction`
 * registers, then returns a no-op unsubscribe.
 */
function makeClientApi() {
    const handlers: Record<string, (event: unknown) => void> = {};
    const on = vi.fn((eventName: string, handler: (event: unknown) => void) => {
        handlers[eventName] = handler;
        return vi.fn();
    });
    return { on, handlers, api: { on } as unknown as ClientApi };
}

function mockDesignContext(clientApi: ClientApi) {
    vi.mocked(useDesignContext).mockReturnValue({
        isDesignMode: true,
        clientApi,
    } as Partial<ReturnType<typeof useDesignContext>> as ReturnType<typeof useDesignContext>);
}

/**
 * Builds a `HostToClientConfiguration`-shaped event carrying the given
 * component map. Both `ClientConfigurationChanged` and `ClientAcknowledged`
 * deliver this shape; the hook seeds its override map from `event.components`.
 */
function configEvent(eventType: string, components: Record<string, Record<string, unknown>>) {
    return {
        eventType,
        components,
        componentTypes: {},
        labels: {},
        regions: {},
    };
}

describe('useComponentUpdateInteraction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // `ClientConfigurationChanged` (a live config swap) and `ClientAcknowledged`
    // (the initial handshake) both seed the override map from the host's
    // `components`, so they share behavior.
    describe.each(['ClientConfigurationChanged', 'ClientAcknowledged'] as const)('%s seeding', (eventType) => {
        it('seeds name, properties, and visibility from each ComponentInfo', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers[eventType](
                    configEvent(eventType, {
                        'comp-1': {
                            id: 'comp-1',
                            type: 'commerce.test',
                            name: 'Hero',
                            properties: { headline: 'Hi' },
                            visibility: 'hidden',
                        },
                    })
                );
            });

            expect(result.current.componentUpdates['comp-1']).toEqual({
                name: 'Hero',
                properties: { headline: 'Hi' },
                visibility: 'hidden',
            });
        });

        it('omits name when the ComponentInfo has none', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers[eventType](
                    configEvent(eventType, {
                        'comp-1': { id: 'comp-1', type: 'commerce.test', properties: { headline: 'Hi' } },
                    })
                );
            });

            expect(result.current.componentUpdates['comp-1']).toEqual({ properties: { headline: 'Hi' } });
            expect(result.current.componentUpdates['comp-1'].name).toBeUndefined();
        });

        it('drops overrides for components absent from the new configuration', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            // A live property edit on comp-1 is recorded first...
            act(() => {
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    properties: { headline: 'Live edit' },
                });
            });

            // ...then a config change arrives that no longer mentions comp-1.
            act(() => {
                handlers[eventType](
                    configEvent(eventType, {
                        'comp-2': { id: 'comp-2', type: 'commerce.test', name: 'Banner', properties: {} },
                    })
                );
            });

            // The override map is rebuilt from the new config's keys, so an id it
            // no longer mentions is dropped regardless of the seeding mode.
            expect(result.current.componentUpdates['comp-1']).toBeUndefined();
            expect(result.current.componentUpdates['comp-2']).toEqual({ name: 'Banner', properties: {} });
        });
    });

    // When a component appears in BOTH the prior override map and the incoming
    // config, the two seeding events diverge: `ClientConfigurationChanged` (a
    // live config swap) preserves the shopper's local edits by seeding from the
    // previous state, while `ClientAcknowledged` (the initial handshake) seeds
    // from nothing and takes the host config verbatim.
    describe('ClientConfigurationChanged preserves prior local overrides', () => {
        it('keeps local name + property edits over the incoming config while merging in new host keys', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            // Shopper locally renames comp-1 and edits one of its properties.
            act(() => {
                handlers.ComponentUpdated({
                    eventType: 'ComponentUpdated',
                    componentId: 'comp-1',
                    changeType: 'name',
                    newValue: 'Local name',
                });
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    properties: { headline: 'Local edit' },
                });
            });

            // A live config swap re-sends comp-1 with the host's values plus a
            // new `subtitle` key the shopper never touched.
            act(() => {
                handlers.ClientConfigurationChanged(
                    configEvent('ClientConfigurationChanged', {
                        'comp-1': {
                            id: 'comp-1',
                            type: 'commerce.test',
                            name: 'Host name',
                            properties: { headline: 'From host', subtitle: 'Host sub' },
                        },
                    })
                );
            });

            // Local name + local `headline` survive the swap; the untouched
            // `subtitle` is picked up from the incoming config.
            expect(result.current.componentUpdates['comp-1']).toEqual({
                name: 'Local name',
                properties: { headline: 'Local edit', subtitle: 'Host sub' },
            });
        });
    });

    describe("ClientConfigurationChanged with changeType 'replace'", () => {
        it('discards prior local overrides and takes the incoming config verbatim (clean slate)', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            // Shopper locally renames comp-1 and edits one of its properties.
            act(() => {
                handlers.ComponentUpdated({
                    eventType: 'ComponentUpdated',
                    componentId: 'comp-1',
                    changeType: 'name',
                    newValue: 'Local name',
                });
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    properties: { headline: 'Local edit' },
                });
            });

            // A 'replace' config swap is an authoritative clean slate — unlike the
            // default 'reconcile', the local edits must NOT survive it.
            act(() => {
                handlers.ClientConfigurationChanged({
                    ...configEvent('ClientConfigurationChanged', {
                        'comp-1': {
                            id: 'comp-1',
                            type: 'commerce.test',
                            name: 'Host name',
                            properties: { headline: 'From host', subtitle: 'Host sub' },
                        },
                    }),
                    changeType: 'replace',
                });
            });

            expect(result.current.componentUpdates['comp-1']).toEqual({
                name: 'Host name',
                properties: { headline: 'From host', subtitle: 'Host sub' },
            });
        });

        it("reconciles by default when changeType is 'reconcile'", () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    properties: { headline: 'Local edit' },
                });
            });

            // An explicit 'reconcile' behaves like the omitted default: local edits win.
            act(() => {
                handlers.ClientConfigurationChanged({
                    ...configEvent('ClientConfigurationChanged', {
                        'comp-1': {
                            id: 'comp-1',
                            type: 'commerce.test',
                            properties: { headline: 'From host', subtitle: 'Host sub' },
                        },
                    }),
                    changeType: 'reconcile',
                });
            });

            expect(result.current.componentUpdates['comp-1'].properties).toEqual({
                headline: 'Local edit',
                subtitle: 'Host sub',
            });
        });
    });

    describe('ClientAcknowledged takes the host config verbatim', () => {
        it('overwrites a prior local override with the incoming config', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            // Shopper locally renames comp-1 and edits one of its properties.
            act(() => {
                handlers.ComponentUpdated({
                    eventType: 'ComponentUpdated',
                    componentId: 'comp-1',
                    changeType: 'name',
                    newValue: 'Local name',
                });
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    properties: { headline: 'Local edit' },
                });
            });

            // The initial handshake seeds from nothing, so the host config wins.
            act(() => {
                handlers.ClientAcknowledged(
                    configEvent('ClientAcknowledged', {
                        'comp-1': {
                            id: 'comp-1',
                            type: 'commerce.test',
                            name: 'Host name',
                            properties: { headline: 'From host', subtitle: 'Host sub' },
                        },
                    })
                );
            });

            expect(result.current.componentUpdates['comp-1']).toEqual({
                name: 'Host name',
                properties: { headline: 'From host', subtitle: 'Host sub' },
            });
        });
    });

    describe('ComponentReset', () => {
        it('does not create an override for a component without local updates', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers.ComponentReset({
                    eventType: 'ComponentReset',
                    componentId: 'comp-1',
                });
            });

            expect(result.current.componentUpdates).toEqual({});
        });

        it('clears every override for only the specified component when changeTypes are omitted', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers.ComponentUpdated({
                    eventType: 'ComponentUpdated',
                    componentId: 'comp-1',
                    changeType: 'name',
                    newValue: 'Local name',
                });
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    properties: { headline: 'Local edit' },
                });
                handlers.ComponentUpdated({
                    eventType: 'ComponentUpdated',
                    componentId: 'comp-2',
                    changeType: 'name',
                    newValue: 'Keep me',
                });
            });

            act(() => {
                handlers.ComponentReset({
                    eventType: 'ComponentReset',
                    componentId: 'comp-1',
                });
            });

            expect(result.current.componentUpdates).toEqual({
                'comp-2': { name: 'Keep me' },
            });
        });

        it('clears only the requested override types and preserves other component updates', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers.ComponentUpdated({
                    eventType: 'ComponentUpdated',
                    componentId: 'comp-1',
                    changeType: 'name',
                    newValue: 'Local name',
                });
                handlers.ComponentUpdated({
                    eventType: 'ComponentUpdated',
                    componentId: 'comp-1',
                    changeType: 'visibility',
                    newValue: 'hidden',
                });
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    properties: { headline: 'Local edit' },
                });
                handlers.ComponentUpdated({
                    eventType: 'ComponentUpdated',
                    componentId: 'comp-2',
                    changeType: 'name',
                    newValue: 'Keep me',
                });
            });

            act(() => {
                handlers.ComponentReset({
                    eventType: 'ComponentReset',
                    componentId: 'comp-1',
                    changeTypes: ['name', 'properties'],
                });
            });

            expect(result.current.componentUpdates).toEqual({
                'comp-1': { visibility: 'hidden' },
                'comp-2': { name: 'Keep me' },
            });
        });
    });

    it('applies ComponentPropertiesChanged deltas into a component override map', () => {
        const { handlers, api } = makeClientApi();
        mockDesignContext(api);

        const { result } = renderHook(() => useComponentUpdateInteraction());

        act(() => {
            handlers.ComponentPropertiesChanged({
                eventType: 'ComponentPropertiesChanged',
                componentId: 'comp-1',
                properties: { headline: 'Live edit' },
            });
        });

        expect(result.current.componentUpdates['comp-1'].properties).toEqual({ headline: 'Live edit' });
    });

    describe('ComponentPropertiesChanged changeType', () => {
        it("merges onto existing overrides when changeType is 'partial'", () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    changeType: 'partial',
                    properties: { headline: 'First', subtitle: 'Keep me' },
                });
            });

            act(() => {
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    changeType: 'partial',
                    properties: { headline: 'Second' },
                });
            });

            // The partial delta overrides `headline` but preserves the untouched `subtitle`.
            expect(result.current.componentUpdates['comp-1'].properties).toEqual({
                headline: 'Second',
                subtitle: 'Keep me',
            });
        });

        it('defaults to a partial merge when changeType is absent', () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    properties: { headline: 'First', subtitle: 'Keep me' },
                });
            });

            act(() => {
                // No changeType — must behave like 'partial'.
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    properties: { headline: 'Second' },
                });
            });

            expect(result.current.componentUpdates['comp-1'].properties).toEqual({
                headline: 'Second',
                subtitle: 'Keep me',
            });
        });

        it("replaces existing overrides wholesale when changeType is 'full'", () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    changeType: 'partial',
                    properties: { headline: 'First', subtitle: 'Drop me' },
                });
            });

            act(() => {
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    changeType: 'full',
                    properties: { headline: 'Second' },
                });
            });

            // A full change is the authoritative property set — the previously-set
            // `subtitle` is discarded rather than merged.
            expect(result.current.componentUpdates['comp-1'].properties).toEqual({ headline: 'Second' });
        });

        it("preserves non-property fields (name) across a 'full' change", () => {
            const { handlers, api } = makeClientApi();
            mockDesignContext(api);

            const { result } = renderHook(() => useComponentUpdateInteraction());

            act(() => {
                handlers.ComponentUpdated({
                    eventType: 'ComponentUpdated',
                    componentId: 'comp-1',
                    changeType: 'name',
                    newValue: 'Renamed',
                });
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    changeType: 'partial',
                    properties: { headline: 'First' },
                });
            });

            act(() => {
                handlers.ComponentPropertiesChanged({
                    eventType: 'ComponentPropertiesChanged',
                    componentId: 'comp-1',
                    changeType: 'full',
                    properties: { headline: 'Second' },
                });
            });

            // A full change replaces `properties` but must not blow away the
            // component's `name`, which lives outside the property override map.
            expect(result.current.componentUpdates['comp-1']).toEqual({
                name: 'Renamed',
                properties: { headline: 'Second' },
            });
        });
    });
});
