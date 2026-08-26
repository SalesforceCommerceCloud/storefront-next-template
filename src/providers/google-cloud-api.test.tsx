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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import GoogleCloudApiProvider from './google-cloud-api';
import { useGoogleMaps } from './google-maps-context';

const mockUseConfig = vi.hoisted(() => vi.fn());
const apiProviderSpy = vi.hoisted(() => vi.fn());
const mapsLibrarySpy = vi.hoisted(() => vi.fn());

vi.mock('@salesforce/storefront-next-runtime/config', async () => {
    const actual = await vi.importActual('@salesforce/storefront-next-runtime/config');
    return {
        ...actual,
        useConfig: mockUseConfig,
    };
});

// Mock the dynamically-imported bridge module.
// Vitest resolves dynamic imports of mocked modules synchronously, so state
// updates driven by activate() are observable within the same act() tick.
vi.mock('./google-maps-bridge', () => ({
    APIProvider: ({ apiKey, children }: { apiKey: string; children: React.ReactNode }) => {
        apiProviderSpy(apiKey);
        return <div data-testid="maps-api-provider">{children}</div>;
    },
    MapsLibraryBridge: ({ onLoad }: { onLoad: (places: object) => void }) => {
        mapsLibrarySpy(onLoad);
        return null;
    },
}));

function setConfigKey(apiKey: string) {
    mockUseConfig.mockReturnValue({ features: { googleCloudAPI: { apiKey } } });
}

/** Helper: calls activate() and flushes all pending microtasks / React state updates. */
async function triggerActivate(fn: (() => void) | undefined) {
    await act(async () => {
        fn?.();
        await Promise.resolve(); // flush dynamic-import .then() and React state batches
    });
}

describe('GoogleCloudApiProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setConfigKey('');
    });

    it('renders children without loading the Maps module when no key resolves', () => {
        render(
            <GoogleCloudApiProvider>
                <span data-testid="child">child</span>
            </GoogleCloudApiProvider>
        );

        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.queryByTestId('maps-api-provider')).not.toBeInTheDocument();
        expect(apiProviderSpy).not.toHaveBeenCalled();
    });

    it('does NOT load @vis.gl module or mount APIProvider before activate() is called', () => {
        render(
            <GoogleCloudApiProvider apiKey="test-key">
                <span data-testid="child">child</span>
            </GoogleCloudApiProvider>
        );

        // Children are rendered immediately
        expect(screen.getByTestId('child')).toBeInTheDocument();
        // APIProvider is NOT mounted until activate() is called
        expect(screen.queryByTestId('maps-api-provider')).not.toBeInTheDocument();
        expect(apiProviderSpy).not.toHaveBeenCalled();
    });

    it('children are not remounted when activate() triggers module load', async () => {
        const mountCount = vi.fn();
        let capturedActivate: (() => void) | undefined;

        function TrackMount() {
            // Called once per React mount; increments again only on remount.
            mountCount();
            return <span data-testid="child">child</span>;
        }

        function ContextCapture() {
            const { activate } = useGoogleMaps();
            capturedActivate = activate;
            return null;
        }

        render(
            <GoogleCloudApiProvider apiKey="test-key">
                <ContextCapture />
                <TrackMount />
            </GoogleCloudApiProvider>
        );

        // Initial render: one mount
        expect(mountCount).toHaveBeenCalledTimes(1);

        // Trigger deferred load (simulates address-field focus)
        await triggerActivate(capturedActivate);

        // APIProvider mounts as a sibling — TrackMount must NOT have been remounted
        expect(screen.getByTestId('maps-api-provider')).toBeInTheDocument();
        expect(mountCount).toHaveBeenCalledTimes(1);
    });

    it('mounts APIProvider (via bridge) with correct key after activate()', async () => {
        let capturedActivate: (() => void) | undefined;

        function ContextCapture() {
            const { activate } = useGoogleMaps();
            capturedActivate = activate;
            return null;
        }

        render(
            <GoogleCloudApiProvider apiKey="gcp-ootb-key">
                <ContextCapture />
                <span data-testid="child">child</span>
            </GoogleCloudApiProvider>
        );

        // Before activate: no Maps provider
        expect(screen.queryByTestId('maps-api-provider')).not.toBeInTheDocument();
        expect(apiProviderSpy).not.toHaveBeenCalled();

        // Call activate (simulates address field focus)
        await triggerActivate(capturedActivate);

        expect(screen.getByTestId('maps-api-provider')).toBeInTheDocument();
        expect(apiProviderSpy).toHaveBeenCalledWith('gcp-ootb-key');
    });

    it('prefers merchant config key over data-store prop after activate()', async () => {
        setConfigKey('merchant-key');

        let capturedActivate: (() => void) | undefined;

        function ContextCapture() {
            const { activate } = useGoogleMaps();
            capturedActivate = activate;
            return null;
        }

        render(
            <GoogleCloudApiProvider apiKey="gcp-ootb-key">
                <ContextCapture />
            </GoogleCloudApiProvider>
        );

        await triggerActivate(capturedActivate);

        expect(apiProviderSpy).toHaveBeenCalledWith('merchant-key');
    });

    it('calling activate() multiple times only loads the module once', async () => {
        let capturedActivate: (() => void) | undefined;

        function ContextCapture() {
            const { activate } = useGoogleMaps();
            capturedActivate = activate;
            return null;
        }

        render(
            <GoogleCloudApiProvider apiKey="test-key">
                <ContextCapture />
            </GoogleCloudApiProvider>
        );

        await act(async () => {
            capturedActivate?.();
            capturedActivate?.();
            capturedActivate?.();
            await Promise.resolve();
        });

        // APIProvider should only be mounted once
        expect(apiProviderSpy).toHaveBeenCalledTimes(1);
    });

    it('activate() is a no-op when no API key is configured', async () => {
        let capturedActivate: (() => void) | undefined;

        function ContextCapture() {
            const { activate } = useGoogleMaps();
            capturedActivate = activate;
            return null;
        }

        render(
            <GoogleCloudApiProvider>
                {/* no apiKey prop, no config key */}
                <ContextCapture />
            </GoogleCloudApiProvider>
        );

        await triggerActivate(capturedActivate);

        expect(screen.queryByTestId('maps-api-provider')).not.toBeInTheDocument();
        expect(apiProviderSpy).not.toHaveBeenCalled();
    });

    it('provides places: null to context before activate()', () => {
        let capturedPlaces: unknown = 'unset';

        function ContextCapture() {
            const { places } = useGoogleMaps();
            capturedPlaces = places;
            return null;
        }

        render(
            <GoogleCloudApiProvider apiKey="test-key">
                <ContextCapture />
            </GoogleCloudApiProvider>
        );

        expect(capturedPlaces).toBeNull();
    });

    it('children are always rendered outside the Maps provider subtree', async () => {
        let capturedActivate: (() => void) | undefined;

        function ContextCapture() {
            const { activate } = useGoogleMaps();
            capturedActivate = activate;
            return null;
        }

        render(
            <GoogleCloudApiProvider apiKey="test-key">
                <ContextCapture />
                <span data-testid="child">child</span>
            </GoogleCloudApiProvider>
        );

        // Before activate
        expect(screen.getByTestId('child')).toBeInTheDocument();

        // After activate
        await triggerActivate(capturedActivate);

        // Child is still in the document and NOT inside maps-api-provider
        expect(screen.getByTestId('child')).toBeInTheDocument();
        const mapsProvider = screen.getByTestId('maps-api-provider');
        expect(mapsProvider.contains(screen.getByTestId('child'))).toBe(false);
    });
});
