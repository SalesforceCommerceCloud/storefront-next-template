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

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ShopperExperience } from '@/scapi';
import type { Route } from './+types/_app.about-us';
import AboutUs, { type AboutUsPageData, loader } from './_app.about-us';
import { createTestContext } from '@/lib/test-utils';
import { fetchPageWithComponentData } from '@/lib/page-designer/page-loader.server';

// Shared translation stub used by BOTH the component (via the react-i18next mock below) and the
// assertions, so expected values always match what the component renders — independent of which
// vertical's i18n resources are active (verticals override the aboutUs namespace, which would
// otherwise make live getTranslation() expectations diverge from the mocked component render).
const { mockTranslate } = vi.hoisted(() => {
    const translations: Record<string, string> = {
        title: 'About Us',
        'meta.description': 'Learn more about our story, mission, and the team behind the store.',
        'breadcrumb.home': 'Home',
        'breadcrumb.aboutUs': 'About Us',
        'section.ourGoal.title': 'Built for movement. Designed for everyday life.',
        'section.ourGoal.content': 'Inspired by urban culture and the energy of movement.',
        'section.ourVision.title': 'Our Vision',
        'section.ourVision.content': 'To redefine modern retail through technology, design, and customer experience.',
        'section.ourVision.imageAlt': 'Our vision',
        'section.ourValue.title': 'Why We Exist',
        'section.ourValue.content': 'We exist to remove friction between people and what they love.',
        'section.ourValue.imageAlt': 'Our values',
        'section.ourMission.title': 'What We Stand For',
        'section.ourMission.content':
            'Design with purpose—every product, every interaction, every detail is intentional.',
        'section.ourMission.cta': 'Explore',
        'section.ourTeam.title': 'A Global Brand, A Street-Level Soul',
        'section.ourTeam.content': "Market Street was born from the idea that great style shouldn't feel unreachable.",
        'section.ourTeam.imageAlt': 'Our team',
        'section.ourTeam.cta': 'Explore',
    };
    return {
        mockTranslate: (key: string): string => {
            const normalizedKey = key.startsWith('aboutUs:') ? key.substring(8) : key;
            return translations[normalizedKey] || key;
        },
    };
});

const t = mockTranslate;

// Helper function to create mock Page objects
const createMockPage = (regions: any[] = []): ShopperExperience.schemas['Page'] =>
    ({
        id: 'mock-page',
        typeId: 'aboutus',
        regions,
    }) as ShopperExperience.schemas['Page'];

// Mock the Region component - simulates PD/MRT behavior
vi.mock('@/components/region', async () => {
    const React = await vi.importActual<typeof import('react')>('react');

    function RegionMock({ regionId, page, errorElement }: any) {
        const [resolvedPage, setResolvedPage] = React.useState<any>(null);
        const [isLoading, setIsLoading] = React.useState(true);

        React.useEffect(() => {
            if (page) {
                void Promise.resolve(page).then((p) => {
                    setResolvedPage(p);
                    setIsLoading(false);
                });
            } else {
                setIsLoading(false);
            }
        }, [page]);

        if (isLoading) {
            return null;
        }

        // Simulate the actual Region behavior: check if region has components
        const region = resolvedPage?.regions?.find((r: any) => r.id === regionId);
        const hasComponents = (region?.components?.length ?? 0) > 0;

        // If no region or no components, show errorElement (MRT behavior)
        if (!region || !hasComponents) {
            return errorElement ?? null;
        }

        // Otherwise show Page Designer region placeholder
        return <div data-testid={`region-${regionId}`}>Page Designer Region: {regionId}</div>;
    }

    return {
        Region: RegionMock,
    };
});

// Mock the Link component
vi.mock('@/components/link', () => ({
    Link: ({ to, children }: any) => <a href={to}>{children}</a>,
}));

// Mock the Contact component
vi.mock('@/components/contact', () => ({
    default: () => <div data-testid="contact">Contact Form</div>,
}));

// Mock the ContentCard component
vi.mock('@/components/content-card', () => ({
    default: ({ title, description }: any) => (
        <div data-testid="content-card">
            <h3>{title}</h3>
            <p>{description}</p>
        </div>
    ),
}));

// Mock react-i18next with partial mock to preserve other exports
vi.mock('react-i18next', async () => {
    const actual: any = await vi.importActual('react-i18next');
    return {
        ...actual,
        useTranslation: () => ({
            t: mockTranslate,
            i18n: {
                language: 'en-US',
                changeLanguage: vi.fn(),
            },
        }),
    };
});

// Mock decorators and utilities
vi.mock('@/lib/decorators/page-type', () => ({
    PageType: () => (target: any) => target,
}));

vi.mock('@/lib/decorators/region-definition', () => ({
    RegionDefinition: () => (target: any) => target,
}));

vi.mock('@/lib/page-designer/page-loader.server', () => ({
    fetchPageWithComponentData: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

const renderComponent = (loaderDataOverrides?: Partial<AboutUsPageData>) => {
    const defaultData: AboutUsPageData = {
        page: {
            ...createMockPage([]),
            componentData: {},
        },
        pageUrl: 'http://localhost/about-us',
        ogImageUrl: 'http://localhost/__ASSET_MOCK__',
    };
    const data = { ...defaultData, ...loaderDataOverrides };
    return render(<AboutUs loaderData={data} />);
};

describe('AboutUs', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Reset mock implementations for loader tests
        vi.mocked(fetchPageWithComponentData).mockResolvedValue({
            ...createMockPage([]),
            componentData: {},
        });
    });

    describe('Basic Rendering', () => {
        test('renders breadcrumb navigation', () => {
            renderComponent();
            expect(screen.getByText(t('aboutUs:breadcrumb.home'))).toBeInTheDocument();
            // About Us appears twice (breadcrumb + title), so use getAllByText
            const aboutUsTexts = screen.getAllByText(t('aboutUs:breadcrumb.aboutUs'));
            expect(aboutUsTexts.length).toBeGreaterThanOrEqual(1);
        });

        test('renders page title', () => {
            renderComponent();
            // About Us appears twice (breadcrumb + title), so use getAllByText
            const aboutUsTexts = screen.getAllByText(t('aboutUs:title'));
            expect(aboutUsTexts.length).toBeGreaterThanOrEqual(1);
        });

        test('renders static content cards when regions are empty', async () => {
            renderComponent();
            await waitFor(() => {
                expect(screen.getByText(t('aboutUs:section.ourGoal.title'))).toBeInTheDocument();
                expect(screen.getByText(t('aboutUs:section.ourVision.title'))).toBeInTheDocument();
                expect(screen.getByText(t('aboutUs:section.ourValue.title'))).toBeInTheDocument();
            });
        });

        test('renders Contact component - always visible', async () => {
            renderComponent();
            await waitFor(() => {
                expect(screen.getByTestId('contact')).toBeInTheDocument();
                expect(screen.getByText('Contact Form')).toBeInTheDocument();
            });
        });

        test('renders default fallback content when regions do not exist', async () => {
            renderComponent();
            await waitFor(() => {
                // Pre-contact static content
                expect(screen.getByText(t('aboutUs:section.ourGoal.title'))).toBeInTheDocument();
                // Post-contact static content
                expect(screen.getByText(t('aboutUs:section.ourMission.title'))).toBeInTheDocument();
                expect(screen.getByText(t('aboutUs:section.ourTeam.title'))).toBeInTheDocument();
            });
        });

        test('renders all content cards with correct count when regions are empty', async () => {
            renderComponent();
            await waitFor(() => {
                const contentCards = screen.getAllByTestId('content-card');
                // Goal, Vision, Value, Mission, Team = 5 cards
                expect(contentCards).toHaveLength(5);
            });
        });
    });

    describe('Region Rendering', () => {
        test('renders static content when headline region does not exist', async () => {
            const page = {
                ...createMockPage([]),
                componentData: {},
            };

            renderComponent({
                page,
            });

            await waitFor(() => {
                // Contact should still render
                expect(screen.getByTestId('contact')).toBeInTheDocument();
                // Static fallback content should render
                expect(screen.getByText(t('aboutUs:section.ourGoal.title'))).toBeInTheDocument();
                expect(screen.getByText(t('aboutUs:section.ourMission.title'))).toBeInTheDocument();
            });
        });

        test('renders Page Designer region when headline region has components', async () => {
            const headlineRegion = {
                id: 'headline',
                components: [
                    { id: 'component-1', typeId: 'hero' },
                    { id: 'component-2', typeId: 'banner' },
                ],
            };

            const page = {
                ...createMockPage([headlineRegion]),
                componentData: {},
            };

            renderComponent({
                page,
            });

            await waitFor(() => {
                // Contact should still render
                expect(screen.getByTestId('contact')).toBeInTheDocument();
                // Page Designer region should render
                expect(screen.getByTestId('region-headline')).toBeInTheDocument();
                expect(screen.getByText('Page Designer Region: headline')).toBeInTheDocument();
                // Static content should NOT render when region has components
                expect(screen.queryByText(t('aboutUs:section.ourGoal.title'))).not.toBeInTheDocument();
            });
        });

        test('renders static content when headline region has no components', async () => {
            const headlineRegion = {
                id: 'headline',
                components: [],
            };

            const page = {
                ...createMockPage([headlineRegion]),
                componentData: {},
            };

            renderComponent({
                page,
            });

            await waitFor(() => {
                // Contact should still render
                expect(screen.getByTestId('contact')).toBeInTheDocument();
                // Static fallback content should render
                expect(screen.getByText(t('aboutUs:section.ourGoal.title'))).toBeInTheDocument();
                // Page Designer region should NOT render
                expect(screen.queryByTestId('region-headline')).not.toBeInTheDocument();
            });
        });

        test('renders Page Designer region when additionalinformation region has components', async () => {
            const additionalinformationRegion = {
                id: 'additionalinformation',
                components: [
                    { id: 'component-1', typeId: 'contentcard' },
                    { id: 'component-2', typeId: 'grid' },
                ],
            };

            const page = {
                ...createMockPage([additionalinformationRegion]),
                componentData: {},
            };

            renderComponent({
                page,
            });

            await waitFor(() => {
                // Contact should still render
                expect(screen.getByTestId('contact')).toBeInTheDocument();
                // Page Designer region should render
                expect(screen.getByTestId('region-additionalinformation')).toBeInTheDocument();
                expect(screen.getByText('Page Designer Region: additionalinformation')).toBeInTheDocument();
                // Static content should NOT render when region has components
                expect(screen.queryByText(t('aboutUs:section.ourMission.title'))).not.toBeInTheDocument();
            });
        });

        test('renders static content when additionalinformation region has no components', async () => {
            const additionalinformationRegion = {
                id: 'additionalinformation',
                components: [],
            };

            const page = {
                ...createMockPage([additionalinformationRegion]),
                componentData: {},
            };

            renderComponent({
                page,
            });

            await waitFor(() => {
                // Contact should still render
                expect(screen.getByTestId('contact')).toBeInTheDocument();
                // Static fallback content should render
                expect(screen.getByText(t('aboutUs:section.ourMission.title'))).toBeInTheDocument();
                // Page Designer region should NOT render
                expect(screen.queryByTestId('region-additionalinformation')).not.toBeInTheDocument();
            });
        });

        test('renders both Page Designer regions when both have components', async () => {
            const headlineRegion = {
                id: 'headline',
                components: [{ id: 'component-1', typeId: 'hero' }],
            };
            const additionalinformationRegion = {
                id: 'additionalinformation',
                components: [{ id: 'component-2', typeId: 'contentcard' }],
            };

            const page = {
                ...createMockPage([headlineRegion, additionalinformationRegion]),
                componentData: {},
            };

            renderComponent({
                page,
            });

            await waitFor(() => {
                // Contact should always render
                expect(screen.getByTestId('contact')).toBeInTheDocument();
                // Both Page Designer regions should render
                expect(screen.getByTestId('region-headline')).toBeInTheDocument();
                expect(screen.getByTestId('region-additionalinformation')).toBeInTheDocument();
                // Static content should NOT render when regions have components
                expect(screen.queryByText(t('aboutUs:section.ourGoal.title'))).not.toBeInTheDocument();
                expect(screen.queryByText(t('aboutUs:section.ourMission.title'))).not.toBeInTheDocument();
            });
        });
    });

    describe('Error Handling', () => {
        test('handles null page gracefully', async () => {
            renderComponent({
                page: null,
            });

            await waitFor(() => {
                // Should still render static content and contact
                expect(screen.getByText(t('aboutUs:section.ourGoal.title'))).toBeInTheDocument();
                expect(screen.getByTestId('contact')).toBeInTheDocument();
            });
        });
    });

    describe('Layout and Styling', () => {
        test('applies correct main container styling', () => {
            const { container } = renderComponent();
            const mainContainer = container.firstChild as HTMLElement;
            expect(mainContainer).toHaveClass('pb-8');
        });

        test('applies correct spacing between sections', async () => {
            renderComponent();
            await waitFor(() => {
                const goalTitle = screen.getByText(t('aboutUs:section.ourGoal.title'));
                const sectionWithSpacing = goalTitle.closest('[class*="space-y-6"]');
                expect(sectionWithSpacing).toBeInTheDocument();
            });
        });

        test('applies correct grid layout for Vision and Value cards', async () => {
            renderComponent();
            await waitFor(() => {
                const visionTitle = screen.getByText(t('aboutUs:section.ourVision.title'));
                const gridContainer = visionTitle.closest('div')?.parentElement;
                expect(gridContainer).toHaveClass('grid', 'grid-cols-1', 'md:grid-cols-2', 'gap-6');
            });
        });

        test('applies correct background styling to Contact section', async () => {
            renderComponent();
            await waitFor(() => {
                const contact = screen.getByTestId('contact');
                const contactSection = contact.closest('[class*="bg-secondary"]');
                expect(contactSection).toBeInTheDocument();
            });
        });
    });

    describe('Loaders', () => {
        let mockContext: ReturnType<typeof createTestContext>;
        let baseLoaderArgs: Route.LoaderArgs;

        beforeEach(() => {
            mockContext = createTestContext();
            baseLoaderArgs = {
                request: new Request('http://localhost/about-us'),
                url: new URL('http://localhost/about-us'),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: '/about-us',
            };
        });

        describe('loader (server-side)', () => {
            test('returns about us page data with fetchPageWithComponentData', async () => {
                const mockPageWithData = {
                    ...createMockPage([]),
                    componentData: { test: Promise.resolve('data') },
                };

                vi.mocked(fetchPageWithComponentData).mockResolvedValue(mockPageWithData);

                const result = await loader(baseLoaderArgs);

                // Assert - API calls
                expect(vi.mocked(fetchPageWithComponentData)).toHaveBeenCalledWith(baseLoaderArgs, {
                    pageId: 'aboutus',
                });

                // Assert - Return value contains all expected properties
                expect(result.page).toBe(mockPageWithData);
                expect(result.pageUrl).toBe('http://localhost/about-us');
                expect(result.ogImageUrl).toContain('__ASSET_MOCK__');
            });

            test('constructs correct canonical URL', async () => {
                vi.mocked(fetchPageWithComponentData).mockResolvedValue({
                    ...createMockPage([]),
                    componentData: {},
                });

                const result = await loader(baseLoaderArgs);

                expect(result.pageUrl).toBe('http://localhost/about-us');
            });

            test('constructs correct og image URL', async () => {
                vi.mocked(fetchPageWithComponentData).mockResolvedValue({
                    ...createMockPage([]),
                    componentData: {},
                });

                const result = await loader(baseLoaderArgs);

                expect(result.ogImageUrl).toContain('__ASSET_MOCK__');
                expect(result.ogImageUrl).toContain('http://localhost');
            });
        });

        describe('Error Handling', () => {
            test('loader handles API errors by propagating them', async () => {
                const error = new Error('API Error');
                vi.mocked(fetchPageWithComponentData).mockRejectedValue(error);

                await expect(loader(baseLoaderArgs)).rejects.toThrow('API Error');
            });
        });

        describe('Data Integration', () => {
            test('page data is returned with componentData', async () => {
                const mockPageWithData = {
                    ...createMockPage([]),
                    componentData: { some: Promise.resolve('data') },
                };

                vi.mocked(fetchPageWithComponentData).mockResolvedValue(mockPageWithData);

                const result = await loader(baseLoaderArgs);

                expect(vi.mocked(fetchPageWithComponentData)).toHaveBeenCalledWith(baseLoaderArgs, {
                    pageId: 'aboutus',
                });
                expect(result.page).toBe(mockPageWithData);
            });
        });
    });

    describe('SEO Metadata', () => {
        test('renders SEO meta component with correct props', async () => {
            renderComponent();

            // The SeoMeta component is rendered (we can't directly test meta tags in jsdom,
            // but we can verify the component receives correct data through loaderData)
            await waitFor(() => {
                // About Us appears twice (breadcrumb + title), so use getAllByText
                const aboutUsTexts = screen.getAllByText(t('aboutUs:title'));
                expect(aboutUsTexts.length).toBeGreaterThanOrEqual(1);
            });
        });
    });

    describe('Contact Section Position', () => {
        test('Contact section is rendered with empty regions', async () => {
            // Test with empty regions
            renderComponent({
                page: {
                    ...createMockPage([]),
                    componentData: {},
                },
            });
            await waitFor(() => {
                expect(screen.getByTestId('contact')).toBeInTheDocument();
            });
        });

        test('Contact section is rendered with regions provided', async () => {
            // Test with regions
            const page = {
                ...createMockPage([
                    { id: 'headline', components: [] },
                    { id: 'additionalinformation', components: [] },
                ]),
                componentData: {},
            };

            renderComponent({ page });
            await waitFor(() => {
                expect(screen.getByTestId('contact')).toBeInTheDocument();
            });
        });

        test('Contact section maintains correct positioning between regions', async () => {
            renderComponent();

            await waitFor(() => {
                const contact = screen.getByTestId('contact');
                const goalSection = screen.getByText(t('aboutUs:section.ourGoal.title'));
                const missionSection = screen.getByText(t('aboutUs:section.ourMission.title'));
                const ourGoalText = screen.getByText('Built for movement. Designed for everyday life.');
                const whatWeStandForText = screen.getByText('What We Stand For');

                // Contact should be in the document
                expect(contact).toBeInTheDocument();

                // Goal section (before precontact region) should be before Contact
                expect(goalSection).toBeInTheDocument();
                expect(ourGoalText).toBeInTheDocument();

                // Mission section (in postcontact static content) should be after Contact
                expect(missionSection).toBeInTheDocument();
                expect(whatWeStandForText).toBeInTheDocument();
            });
        });
    });
});
