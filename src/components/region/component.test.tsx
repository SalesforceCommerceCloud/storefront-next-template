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
import { type FC, Suspense } from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Component } from './component';
import type { ComponentType } from './index';

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => mockLogger),
}));

// Mock registry
vi.mock('@/lib/page-designer/registry', () => ({
    registry: {
        getFallback: vi.fn(),
        getComponent: vi.fn(),
        preload: vi.fn(),
    },
}));

// Track error for useAsyncError mock
let mockAsyncError: unknown = undefined;
let shouldTriggerError = false;

vi.mock('react-router', async (importOriginal) => {
    const actual = (await importOriginal()) as any;
    return {
        ...actual,
        useAsyncError: () => mockAsyncError,
        Await: ({ resolve, children, errorElement }: any) => {
            if (shouldTriggerError && errorElement) {
                return errorElement;
            }
            return actual.Await({ resolve, children, errorElement });
        },
    };
});

// Mock component data context
const mockUseComponentDataById = vi.fn();
vi.mock('./component-data-context', () => ({
    useComponentDataById: (id: string) => mockUseComponentDataById(id),
}));

import { registry } from '@/lib/page-designer/registry';

// Helper for creating deferred promises
const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseComponentDataById.mockReset();
        mockAsyncError = undefined;
        shouldTriggerError = false;
    });

    describe('Async data loading', () => {
        test('shows custom fallback while loading, then renders with resolved data', async () => {
            const Fallback: FC<any> = (props) => <div data-testid="fallback">Loading {props.title}</div>;
            (registry.getFallback as any).mockReturnValue(Fallback);

            let capturedProps: any;
            const Dynamic: FC<any> = (props) => {
                capturedProps = props;
                return <div data-testid="dynamic">Content</div>;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component = {
                id: 'comp1',
                typeId: 'hero',
                data: { title: 'Hero Title', subtitle: 'Subtitle' } as any,
                designMetadata: { name: 'Hero Banner' },
                localized: true,
                visible: true,
            } as ComponentType;

            const dataPromise = deferred<any>();
            mockUseComponentDataById.mockImplementation((id: string) =>
                id === 'comp1' ? dataPromise.promise : undefined
            );

            render(<Component component={component} className="test-class" regionId="main" />);

            // Verify fallback shows with component.data props
            expect(screen.getByTestId('fallback')).toBeInTheDocument();
            expect(screen.getByText('Loading Hero Title')).toBeInTheDocument();

            // Resolve data
            const resolvedData = { apiData: 'test' };
            dataPromise.resolve(resolvedData);

            // Verify component renders with all props
            await waitFor(() => {
                expect(screen.getByTestId('dynamic')).toBeInTheDocument();
            });

            expect(capturedProps).toMatchObject({
                title: 'Hero Title',
                subtitle: 'Subtitle',
                className: 'test-class',
                regionId: 'main',
                data: resolvedData,
                component,
            });

            expect(capturedProps.designMetadata).toEqual({
                id: 'comp1',
                name: 'Hero Banner',
                isFragment: false,
                isVisible: true,
                isLocalized: true,
                // No contentLinkUuid on the component, falls back to id.
                contentLinkUuid: 'comp1',
            });
        });

        test('uses default fallback when no custom fallback is registered', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            const Dynamic: FC = () => <div data-testid="content" />;
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component: ComponentType = { id: 'comp2', typeId: 'banner' };
            const dataPromise = deferred<any>();
            mockUseComponentDataById.mockReturnValue(dataPromise.promise);

            const { container } = render(<Component component={component} regionId="main" />);

            // Default fallback is an empty div
            expect(container.querySelector('div')).toBeInTheDocument();
            expect(screen.queryByTestId('content')).not.toBeInTheDocument();

            dataPromise.resolve({});
            await waitFor(() => expect(screen.getByTestId('content')).toBeInTheDocument());
        });
    });

    describe('Synchronous rendering', () => {
        test('renders immediately when no data promise is provided', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedProps: any;
            const Dynamic: FC<any> = (props) => {
                capturedProps = props;
                return <div data-testid="sync-content" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component = {
                id: 'comp3',
                typeId: 'static-banner',
                data: { message: 'Hello' } as any,
                designMetadata: { name: 'Static Banner' },
            } as ComponentType;

            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="sidebar" />);

            // Should render immediately without loading state
            expect(await screen.findByTestId('sync-content')).toBeInTheDocument();

            expect(capturedProps).toMatchObject({
                message: 'Hello',
                regionId: 'sidebar',
                data: undefined,
                component,
            });

            // Check default designMetadata values when localized/visible not specified
            expect(capturedProps.designMetadata).toEqual({
                id: 'comp3',
                name: 'Static Banner',
                isFragment: false,
                isVisible: false,
                isLocalized: false,
                contentLinkUuid: 'comp3',
            });
        });

        test('handles component with empty data object', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedProps: any;
            const Dynamic: FC<any> = (props) => {
                capturedProps = props;
                return <div data-testid="empty-data" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component: ComponentType = {
                id: 'comp4',
                typeId: 'empty',
                data: {} as any,
            };

            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="main" />);

            expect(await screen.findByTestId('empty-data')).toBeInTheDocument();
            expect(capturedProps.data).toBeUndefined();

            // Verify designMetadata with minimal component
            expect(capturedProps.designMetadata).toEqual({
                id: 'comp4',
                name: undefined,
                isFragment: false,
                isVisible: false,
                isLocalized: false,
                contentLinkUuid: 'comp4',
            });
        });

        test('handles component without data property', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            const Dynamic: FC<any> = () => <div data-testid="no-data-prop" />;
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component: ComponentType = {
                id: 'comp5',
                typeId: 'minimal',
            };

            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="footer" />);

            expect(await screen.findByTestId('no-data-prop')).toBeInTheDocument();
        });
    });

    describe('Component registry and lazy loading', () => {
        test('triggers preload when component not yet loaded', async () => {
            (registry.getComponent as any).mockReturnValue(undefined);
            const preloadPromise = deferred<void>();
            const mockPreload = vi.fn().mockReturnValue(preloadPromise.promise);
            (registry.preload as any) = mockPreload;

            const component: ComponentType = { id: 'comp6', typeId: 'lazy-hero' };
            mockUseComponentDataById.mockReturnValue(undefined);

            render(
                <Suspense fallback={<div data-testid="loading">Loading component...</div>}>
                    <Component component={component} regionId="main" />
                </Suspense>
            );

            // Verify preload was called
            expect(mockPreload).toHaveBeenCalledWith('lazy-hero');
            expect(screen.getByTestId('loading')).toBeInTheDocument();

            // Simulate component loading
            const DynamicComponent: FC<any> = () => <div data-testid="loaded" />;
            (registry.getComponent as any).mockReturnValue(DynamicComponent);
            preloadPromise.resolve();

            await waitFor(() => {
                expect(screen.getByTestId('loaded')).toBeInTheDocument();
            });
        });
    });

    describe('Data selection', () => {
        test('selects correct data promise by component ID', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedData: any;
            const Dynamic: FC<any> = (props) => {
                capturedData = props.data;
                return <div data-testid="rendered" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component: ComponentType = { id: 'comp-b', typeId: 'hero' };
            const promiseB = deferred<any>();

            // Simulate multiple components with different data
            mockUseComponentDataById.mockImplementation((id: string) => {
                if (id === 'comp-a') return Promise.resolve({ value: 'A' });
                if (id === 'comp-b') return promiseB.promise;
                if (id === 'comp-c') return Promise.resolve({ value: 'C' });
                return undefined;
            });

            render(<Component component={component} regionId="main" />);

            promiseB.resolve({ value: 'B' });

            await waitFor(() => expect(screen.getByTestId('rendered')).toBeInTheDocument());
            expect(capturedData).toEqual({ value: 'B' });
        });
    });

    describe('Error handling', () => {
        test('renders nothing and logs error when data loading fails', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            const Dynamic: FC<any> = () => <div data-testid="should-not-render" />;
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component: ComponentType = { id: 'error-comp', typeId: 'hero' };
            const testError = new Error('Network timeout');

            mockAsyncError = testError;
            shouldTriggerError = true;
            mockUseComponentDataById.mockReturnValue(undefined);

            const { container } = render(<Component component={component} regionId="main" />);

            await waitFor(() => {
                expect(screen.queryByTestId('should-not-render')).not.toBeInTheDocument();
            });

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to load data for component "error-comp" (hero)', {
                error: testError,
            });

            // Verify nothing rendered
            expect(container.textContent).toBe('');
        });

        test('error fallback receives component context for debugging', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);
            (registry.getComponent as any).mockReturnValue(() => <div data-testid="content" />);

            const component: ComponentType = {
                id: 'special-hero',
                typeId: 'advanced-hero',
            };

            const apiError = new Error('API Error: 503 Service Unavailable');
            mockAsyncError = apiError;
            shouldTriggerError = true;
            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="header" />);

            await waitFor(() => {
                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Failed to load data for component "special-hero" (advanced-hero)',
                    { error: apiError }
                );
            });
        });
    });

    describe('Props spreading', () => {
        test('spreads component.data props correctly', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedProps: any;
            const Dynamic: FC<any> = (props) => {
                capturedProps = props;
                return <div data-testid="props-check" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component: ComponentType = {
                id: 'comp7',
                typeId: 'hero',
                data: {
                    title: 'Title',
                    description: 'Description',
                    imageUrl: '/image.jpg',
                    ctaText: 'Click me',
                } as any,
            };

            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} className="custom-class" regionId="main" />);

            expect(await screen.findByTestId('props-check')).toBeInTheDocument();

            // All data props should be spread to the dynamic component
            expect(capturedProps.title).toBe('Title');
            expect(capturedProps.description).toBe('Description');
            expect(capturedProps.imageUrl).toBe('/image.jpg');
            expect(capturedProps.ctaText).toBe('Click me');
            expect(capturedProps.className).toBe('custom-class');
        });

        test('className prop is optional', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedProps: any;
            const Dynamic: FC<any> = (props) => {
                capturedProps = props;
                return <div data-testid="no-classname" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component: ComponentType = { id: 'comp8', typeId: 'banner' };
            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="main" />);

            expect(await screen.findByTestId('no-classname')).toBeInTheDocument();
            expect(capturedProps.className).toBeUndefined();
        });
    });

    describe('Design metadata', () => {
        test('builds correct metadata with all fields present', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedMetadata: any;
            const Dynamic: FC<any> = (props) => {
                capturedMetadata = props.designMetadata;
                return <div data-testid="metadata-test" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component = {
                id: 'meta-comp',
                typeId: 'hero',
                designMetadata: {
                    id: 'meta-comp',
                    contentLinkUuid: 'test-content-link-uuid',
                    name: 'Main Hero',
                    isFragment: false,
                    isVisible: true,
                    isLocalized: true,
                },
                visible: true,
                localized: true,
            } as unknown as ComponentType;

            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="main" />);

            expect(await screen.findByTestId('metadata-test')).toBeInTheDocument();
            expect(capturedMetadata).toEqual({
                id: 'meta-comp',
                name: 'Main Hero',
                isFragment: false,
                isVisible: true,
                isLocalized: true,
                // designMetadata.contentLinkUuid is ignored; the component-level field is
                // undefined here, so it falls back to id.
                contentLinkUuid: 'meta-comp',
            });
        });

        test('handles missing designMetadata gracefully', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedMetadata: any;
            const Dynamic: FC<any> = (props) => {
                capturedMetadata = props.designMetadata;
                return <div data-testid="no-design-meta" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component: ComponentType = {
                id: 'minimal-comp',
                typeId: 'simple',
            };

            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="main" />);

            expect(await screen.findByTestId('no-design-meta')).toBeInTheDocument();
            expect(capturedMetadata).toEqual({
                id: 'minimal-comp',
                name: undefined,
                isFragment: false,
                isVisible: false,
                isLocalized: false,
                contentLinkUuid: 'minimal-comp',
            });
        });

        test('extracts contentLinkUuid from component', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedMetadata: any;
            const Dynamic: FC<any> = (props) => {
                capturedMetadata = props.designMetadata;
                return <div data-testid="content-link-test" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component = {
                id: 'fragment-comp',
                typeId: 'hero',
                fragment: true,
                contentLinkUuid: 'uuid-12345-abcde',
                designMetadata: {
                    id: 'fragment-comp',
                    contentLinkUuid: 'uuid-12345-abcde',
                    name: 'Reusable Hero',
                    isFragment: true,
                    isVisible: true,
                    isLocalized: false,
                },
                visible: true,
            } as unknown as ComponentType;

            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="main" />);

            expect(await screen.findByTestId('content-link-test')).toBeInTheDocument();
            expect(capturedMetadata).toEqual({
                id: 'fragment-comp',
                name: 'Reusable Hero',
                isFragment: true,
                isVisible: true,
                isLocalized: false,
                contentLinkUuid: 'uuid-12345-abcde',
            });
        });

        test('falls back to component id when contentLinkUuid is missing (mini-PD)', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedMetadata: any;
            const Dynamic: FC<any> = (props) => {
                capturedMetadata = props.designMetadata;
                return <div data-testid="no-uuid-test" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component: ComponentType = {
                id: 'regular-comp',
                typeId: 'banner',
            };

            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="main" />);

            expect(await screen.findByTestId('no-uuid-test')).toBeInTheDocument();
            expect(capturedMetadata.contentLinkUuid).toBe('regular-comp');
        });

        test('prefers component contentLinkUuid over id fallback when present', async () => {
            (registry.getFallback as any).mockReturnValue(undefined);

            let capturedMetadata: any;
            const Dynamic: FC<any> = (props) => {
                capturedMetadata = props.designMetadata;
                return <div data-testid="uuid-preferred-test" />;
            };
            (registry.getComponent as any).mockReturnValue(Dynamic);

            const component = {
                id: 'regular-comp',
                typeId: 'banner',
                contentLinkUuid: 'real-uuid',
            } as unknown as ComponentType;

            mockUseComponentDataById.mockReturnValue(undefined);

            render(<Component component={component} regionId="main" />);

            expect(await screen.findByTestId('uuid-preferred-test')).toBeInTheDocument();
            expect(capturedMetadata.contentLinkUuid).toBe('real-uuid');
        });
    });
});
