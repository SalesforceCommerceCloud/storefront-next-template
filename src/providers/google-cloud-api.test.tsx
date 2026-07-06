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
import { render, screen } from '@testing-library/react';
import GoogleCloudApiProvider from './google-cloud-api';

const mockUseConfig = vi.hoisted(() => vi.fn());
// Capture the apiKey the Maps APIProvider is mounted with; render children so the tree is inspectable.
const apiProviderSpy = vi.hoisted(() => vi.fn());

vi.mock('@salesforce/storefront-next-runtime/config', async () => {
    const actual = await vi.importActual('@salesforce/storefront-next-runtime/config');
    return {
        ...actual,
        useConfig: mockUseConfig,
    };
});

vi.mock('@vis.gl/react-google-maps', () => ({
    APIProvider: ({ apiKey, children }: { apiKey: string; children: React.ReactNode }) => {
        apiProviderSpy(apiKey);
        return <div data-testid="maps-api-provider">{children}</div>;
    },
}));

function setConfigKey(apiKey: string) {
    mockUseConfig.mockReturnValue({ features: { googleCloudAPI: { apiKey } } });
}

describe('GoogleCloudApiProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setConfigKey('');
    });

    it('renders children without the Maps provider when no key resolves', () => {
        render(
            <GoogleCloudApiProvider>
                <span data-testid="child">child</span>
            </GoogleCloudApiProvider>
        );

        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.queryByTestId('maps-api-provider')).not.toBeInTheDocument();
        expect(apiProviderSpy).not.toHaveBeenCalled();
    });

    it('mounts the Maps provider with the data-store key passed via props', () => {
        render(
            <GoogleCloudApiProvider apiKey="gcp-ootb-key">
                <span data-testid="child">child</span>
            </GoogleCloudApiProvider>
        );

        expect(screen.getByTestId('maps-api-provider')).toBeInTheDocument();
        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(apiProviderSpy).toHaveBeenCalledWith('gcp-ootb-key');
    });

    it('prefers the merchant-configured key over the data-store prop', () => {
        setConfigKey('merchant-key');

        render(
            <GoogleCloudApiProvider apiKey="gcp-ootb-key">
                <span>child</span>
            </GoogleCloudApiProvider>
        );

        expect(apiProviderSpy).toHaveBeenCalledWith('merchant-key');
    });
});
