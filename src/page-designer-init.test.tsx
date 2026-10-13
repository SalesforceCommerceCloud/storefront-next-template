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
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { PageDesignerInit } from './page-designer-init';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import { useBlocker, useLocation } from 'react-router';

const mockCssImport = vi.fn();
const notifyClientRouteChangedMock = vi.fn();

vi.mock(import('@salesforce/storefront-next-runtime/design/styles.css'), () => {
    mockCssImport();

    return { default: {} };
});

vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    usePageDesignerMode: vi.fn(() => ({ isDesignMode: true })),
    usePreviewContext: vi.fn(() => ({
        isPreviewMode: false,
        isConnected: false,
        notifyClientRouteChanged: notifyClientRouteChangedMock,
    })),
}));

vi.mock('react-router', () => ({
    href: (path: string) => path,
    useBlocker: vi.fn(),
    useLocation: vi.fn(() => ({ pathname: '/', search: '', hash: '' })),
}));

describe('Page Designer Styles Component', () => {
    beforeEach(() => {
        mockCssImport.mockClear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('when in design mode', () => {
        it('should import the Page Designer styles', async () => {
            render(<PageDesignerInit />);

            await waitFor(() => {
                expect(mockCssImport).toHaveBeenCalled();
            });
        });
    });

    describe('when not in design mode', () => {
        it('should not import the Page Designer styles', () => {
            (usePageDesignerMode as Mock).mockReturnValue({ isDesignMode: false });
            render(<PageDesignerInit />);

            expect(mockCssImport).not.toHaveBeenCalled();
        });
    });

    describe('navigation blocking', () => {
        it('should block navigation when in design mode', () => {
            (usePageDesignerMode as Mock).mockReturnValue({ isDesignMode: true });
            render(<PageDesignerInit />);

            expect(useBlocker).toHaveBeenCalledWith(expect.any(Function));

            const blockerFunction = (useBlocker as Mock).mock.calls[0][0];
            expect(blockerFunction()).toBe(true);
        });

        it('should not block navigation when not in design mode', () => {
            (usePageDesignerMode as Mock).mockReturnValue({ isDesignMode: false });
            render(<PageDesignerInit />);

            expect(useBlocker).toHaveBeenCalledWith(expect.any(Function));

            const blockerFunction = (useBlocker as Mock).mock.calls[0][0];
            expect(blockerFunction()).toBe(false);
        });
    });

    describe('client route notifications', () => {
        it('emits the composed origin+pathname+search+hash URL to notifyClientRouteChanged', async () => {
            (usePageDesignerMode as Mock).mockReturnValue({ isDesignMode: false, isPreviewMode: true });
            (useLocation as Mock).mockReturnValue({
                pathname: '/products/abc',
                search: '?utm=x',
                hash: '#top',
            });
            render(<PageDesignerInit />);

            const expected = `${window.location.origin}/products/abc?utm=x#top`;
            await waitFor(() => {
                expect(notifyClientRouteChangedMock).toHaveBeenLastCalledWith(expected);
            });
        });

        it('emits a URL without query or hash when the route has neither', async () => {
            (usePageDesignerMode as Mock).mockReturnValue({ isDesignMode: false, isPreviewMode: true });
            (useLocation as Mock).mockReturnValue({
                pathname: '/home',
                search: '',
                hash: '',
            });
            render(<PageDesignerInit />);

            await waitFor(() => {
                expect(notifyClientRouteChangedMock).toHaveBeenLastCalledWith(`${window.location.origin}/home`);
            });
        });

        it('does not emit when not in preview mode', () => {
            (usePageDesignerMode as Mock).mockReturnValue({ isDesignMode: true, isPreviewMode: false });
            (useLocation as Mock).mockReturnValue({ pathname: '/home', search: '', hash: '' });
            render(<PageDesignerInit />);

            expect(notifyClientRouteChangedMock).not.toHaveBeenCalled();
        });
    });
});
