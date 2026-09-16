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
import { useContext } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';

// Mock the lazy-loaded context modules with lightweight test doubles that
// expose the props they receive so we can assert them, and unmount cleanly
// so we can assert mount/unmount transitions.
vi.mock('../context/PreviewContext', () => ({
    PreviewProvider: vi.fn(({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
        <div data-testid="preview-provider" data-props={JSON.stringify(props)}>
            {children}
        </div>
    )),
}));

vi.mock('../context/DesignContext', () => ({
    DesignProvider: vi.fn(({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
        <div data-testid="design-provider" data-props={JSON.stringify(props)}>
            {children}
        </div>
    )),
}));

vi.mock('../../modeDetection', () => ({
    isDesignModeActive: vi.fn(() => false),
    isPreviewModeActive: vi.fn(() => false),
}));

import { PageDesignerProvider, PageDesignerContext, usePageDesignerMode } from './PageDesignerProvider';
import { isDesignModeActive, isPreviewModeActive } from '../../modeDetection';

const asMock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const Child = () => <div data-testid="child">child</div>;

const readContextValue = () => {
    let seen: { isDesignMode: boolean; isPreviewMode: boolean } | undefined;
    const Probe = () => {
        seen = useContext(PageDesignerContext);
        return null;
    };
    return { Probe, get: () => seen };
};

describe('PageDesignerProvider', () => {
    beforeEach(() => {
        asMock(isDesignModeActive).mockReturnValue(false);
        asMock(isPreviewModeActive).mockReturnValue(false);
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    describe('no active mode', () => {
        it('renders children directly without mounting either provider', () => {
            render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com">
                    <Child />
                </PageDesignerProvider>
            );

            expect(screen.getByTestId('child')).toBeTruthy();
            expect(screen.queryByTestId('preview-provider')).toBeNull();
            expect(screen.queryByTestId('design-provider')).toBeNull();
        });

        it('reports both modes as false via usePageDesignerMode', () => {
            let seen: { isDesignMode: boolean; isPreviewMode: boolean } | undefined;
            const Probe = () => {
                seen = usePageDesignerMode();
                return null;
            };

            render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com">
                    <Probe />
                </PageDesignerProvider>
            );

            expect(seen).toEqual({ isDesignMode: false, isPreviewMode: false });
        });
    });

    describe('mode from prop', () => {
        it('mounts DesignProvider when mode="EDIT"', async () => {
            render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="EDIT">
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('design-provider')).toBeTruthy();
            expect(screen.queryByTestId('preview-provider')).toBeNull();
        });

        it('mounts PreviewProvider when mode="PREVIEW"', async () => {
            render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="PREVIEW">
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('preview-provider')).toBeTruthy();
            expect(screen.queryByTestId('design-provider')).toBeNull();
        });

        it('exposes isDesignMode=true via context in EDIT mode', async () => {
            const { Probe, get } = readContextValue();

            render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="EDIT">
                    <Probe />
                </PageDesignerProvider>
            );

            await screen.findByTestId('design-provider');
            expect(get()).toEqual({ isDesignMode: true, isPreviewMode: false });
        });

        it('exposes isPreviewMode=true via context in PREVIEW mode', async () => {
            const { Probe, get } = readContextValue();

            render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="PREVIEW">
                    <Probe />
                </PageDesignerProvider>
            );

            await screen.findByTestId('preview-provider');
            expect(get()).toEqual({ isDesignMode: false, isPreviewMode: true });
        });

        it('plumbs messaging props (targetOrigin, clientId, usid, timeouts, logger) to PreviewProvider', async () => {
            const clientLogger = vi.fn();

            render(
                <PageDesignerProvider
                    clientId="probe-client"
                    targetOrigin="https://host.example.com"
                    usid="usid-123"
                    clientLogger={clientLogger}
                    clientConnectionTimeout={45_000}
                    clientConnectionInterval={500}
                    mode="PREVIEW">
                    <Child />
                </PageDesignerProvider>
            );

            const provider = await screen.findByTestId('preview-provider');
            const props = JSON.parse(provider.getAttribute('data-props') ?? '{}');

            expect(props).toMatchObject({
                targetOrigin: 'https://host.example.com',
                clientId: 'probe-client',
                usid: 'usid-123',
                clientConnectionTimeout: 45_000,
                clientConnectionInterval: 500,
            });
        });
    });

    describe('mode from URL (fallback when prop is undefined)', () => {
        it('mounts DesignProvider when isDesignModeActive() returns true', async () => {
            asMock(isDesignModeActive).mockReturnValue(true);

            render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com">
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('design-provider')).toBeTruthy();
        });

        it('mounts PreviewProvider when isPreviewModeActive() returns true', async () => {
            asMock(isPreviewModeActive).mockReturnValue(true);

            render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com">
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('preview-provider')).toBeTruthy();
        });

        it('prefers the mode prop over the URL-derived value on initial mount', async () => {
            asMock(isPreviewModeActive).mockReturnValue(true);

            render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="EDIT">
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('design-provider')).toBeTruthy();
            expect(screen.queryByTestId('preview-provider')).toBeNull();
        });
    });

    describe('sticky mode latch', () => {
        it('keeps PreviewProvider mounted when the mode prop becomes undefined (client-side nav dropping ?mode=)', async () => {
            const { rerender } = render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="PREVIEW">
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('preview-provider')).toBeTruthy();

            rerender(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode={undefined}>
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('preview-provider')).toBeTruthy();
            expect(screen.queryByTestId('design-provider')).toBeNull();
        });

        it('keeps DesignProvider mounted when the mode prop becomes undefined', async () => {
            const { rerender } = render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="EDIT">
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('design-provider')).toBeTruthy();

            rerender(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode={undefined}>
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('design-provider')).toBeTruthy();
            expect(screen.queryByTestId('preview-provider')).toBeNull();
        });

        it('does not fall back to URL detection on subsequent renders after the latch is set', async () => {
            const { rerender } = render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="PREVIEW">
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('preview-provider')).toBeTruthy();

            // Simulate a client-side navigation where the URL now says EDIT and the prop is gone.
            // The latch must ignore both — mode is sticky for the session.
            asMock(isDesignModeActive).mockReturnValue(true);
            asMock(isPreviewModeActive).mockReturnValue(false);

            rerender(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode={undefined}>
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('preview-provider')).toBeTruthy();
            expect(screen.queryByTestId('design-provider')).toBeNull();
        });

        it('updates the latch when the mode prop changes from EDIT to PREVIEW', async () => {
            const { rerender } = render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="EDIT">
                    <Child />
                </PageDesignerProvider>
            );

            expect(await screen.findByTestId('design-provider')).toBeTruthy();

            act(() => {
                rerender(
                    <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="PREVIEW">
                        <Child />
                    </PageDesignerProvider>
                );
            });

            expect(await screen.findByTestId('preview-provider')).toBeTruthy();
            expect(screen.queryByTestId('design-provider')).toBeNull();
        });

        it('starts inactive when neither prop nor URL indicate a mode, then latches EDIT once the prop arrives', async () => {
            const { rerender } = render(
                <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com">
                    <Child />
                </PageDesignerProvider>
            );

            expect(screen.queryByTestId('design-provider')).toBeNull();
            expect(screen.queryByTestId('preview-provider')).toBeNull();

            act(() => {
                rerender(
                    <PageDesignerProvider clientId="test-client" targetOrigin="https://host.example.com" mode="EDIT">
                        <Child />
                    </PageDesignerProvider>
                );
            });

            expect(await screen.findByTestId('design-provider')).toBeTruthy();
        });
    });

    describe('targetOrigin guard', () => {
        it('throws when a mode is active but targetOrigin is missing', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            expect(() =>
                render(
                    <PageDesignerProvider clientId="test-client" targetOrigin="" mode="PREVIEW">
                        <Child />
                    </PageDesignerProvider>
                )
            ).toThrow(/targetOrigin is required/);

            spy.mockRestore();
        });

        it('does not throw when no mode is active and targetOrigin is missing', () => {
            expect(() =>
                render(
                    <PageDesignerProvider clientId="test-client" targetOrigin="">
                        <Child />
                    </PageDesignerProvider>
                )
            ).not.toThrow();
        });
    });
});
