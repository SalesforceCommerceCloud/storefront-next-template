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
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigWrapper, mockLocale, mockSiteObject } from '@/test-utils/config';
import { CarouselItem } from '@/components/ui/carousel';
import { CarouselSection } from '../index';

type CarouselSectionArgs = React.ComponentProps<typeof CarouselSection> & {
    slideCount?: number;
};

function DemoSlides({ count = 4 }: { count?: number }): ReactElement {
    return (
        <>
            {Array.from({ length: count }, (_, i) => (
                <CarouselItem key={i} className="basis-1/2 pl-4 sm:basis-1/3 md:basis-1/4">
                    <div className="flex h-28 min-w-0 items-center justify-center rounded-none border border-border bg-muted text-sm">
                        Slide {i + 1}
                    </div>
                </CarouselItem>
            ))}
        </>
    );
}

const meta: Meta<CarouselSectionArgs> = {
    title: 'Content/Marketing/Carousel Section',
    component: CarouselSection,
    tags: ['autodocs', 'skip-a11y'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Shared carousel shell used by the storefront product / category carousels. Provides section padding, the title row (left- or center-aligned, with optional shop-all link), the Embla track, and prev/next navigation buttons. Children must be `CarouselItem` elements.',
            },
        },
    },
    argTypes: {
        slideCount: {
            control: { type: 'number', min: 0, max: 12 },
            description: 'Synthetic toggle: how many demo slides to render inside the carousel.',
            table: { category: 'Synthetic' },
        },
        titleAlign: { control: 'inline-radio', options: ['left', 'center'] },
        titleClassName: { table: { disable: true } },
        className: { table: { disable: true } },
    },
    args: {
        title: 'Featured',
        subtitle: 'Hand-picked for you',
        shopAllUrl: '/category/root',
        shopAllText: 'Shop all',
        titleAlign: 'left',
        ariaLabel: 'Featured carousel',
        slideCount: 4,
    },
    render: ({ slideCount = 4, ...props }) => (
        <CarouselSection {...props}>
            <DemoSlides count={slideCount} />
        </CarouselSection>
    ),
    // Snapshot harness uses composeStories, which runs OUTSIDE the global storybook decorator
    // stack. CarouselSection -> @/components/link -> useSite() requires SiteProvider + a router
    // context, so we declare the providers on the meta decorator to satisfy both the storybook UI
    // and the snapshot path. (Pattern 18 / "composeStories runs outside the global decorator stack"
    // in the storybook-component-audit skill.)
    //
    // NOTE: We use useInRouterContext() to conditionally create a router. In the Storybook UI, the
    // global withRouter decorator already provides a router, so we skip creating a nested one (which
    // would cause "You cannot render a <Router> inside another <Router>"). In composeStories snapshot
    // tests, no global decorator exists, so we create the router here. Pattern from .storybook/test-wrapper.tsx.
    decorators: [
        (Story) => {
            const inRouter = useInRouterContext();
            const content = (
                <ConfigWrapper>
                    <SiteProvider
                        site={mockSiteObject}
                        locale={mockLocale}
                        language={mockSiteObject.defaultLocale}
                        currency={mockSiteObject.defaultCurrency}>
                        <Story />
                    </SiteProvider>
                </ConfigWrapper>
            );

            // If already in a router (Storybook UI), just return the content
            if (inRouter) {
                return content;
            }

            // If not in a router (composeStories), create one
            const router = createMemoryRouter(
                [
                    {
                        path: '*',
                        element: content,
                    },
                ],
                {
                    initialEntries: ['/'],
                }
            );

            return <RouterProvider router={router} />;
        },
    ],
};

export default meta;
type Story = StoryObj<CarouselSectionArgs>;

export const Playground: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Toggle every prop via Controls. Note that `shopAllUrl` and `shopAllText` are ignored when `titleAlign` is `center`.',
            },
        },
    },
};

export const LeftTitleWithShopAll: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Default left-aligned title with a shop-all link on the right (the product-carousel shape).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('heading', { name: /featured/i })).toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: /shop all/i })).toBeInTheDocument();
    },
};

export const CenterTitleWithSubtitle: Story = {
    args: {
        title: 'Shop by category',
        subtitle: 'Explore our collections',
        titleAlign: 'center',
        // Shop-all props are PRESENT here on purpose: the centered layout must ignore
        // them (carousel-section/index.tsx renders the shop-all block only in the 'left'
        // branch). Leaving them undefined would make the "no link" assertion below pass
        // for the wrong reason (no props) instead of exercising the ignore-in-center branch.
        shopAllUrl: '/category/all',
        shopAllText: 'Shop all',
        ariaLabel: 'Categories carousel',
    },
    parameters: {
        docs: {
            description: {
                story: 'Centered title with subtitle (the category-carousel shape). `shopAllUrl` and `shopAllText` are passed but intentionally ignored in this layout.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('heading', { name: /shop by category/i })).toBeInTheDocument();
        await expect(canvas.getByText(/explore our collections/i)).toBeInTheDocument();
        // Centered layout ignores shop-all: even though shopAllUrl + shopAllText are set,
        // no link (and no shop-all text) should render.
        await expect(canvas.queryByRole('link', { name: /shop all/i })).not.toBeInTheDocument();
        await expect(canvas.queryByText(/shop all/i)).not.toBeInTheDocument();
    },
};

export const ShopAllLabelWithoutLink: Story = {
    args: {
        title: 'New arrivals',
        subtitle: undefined,
        shopAllUrl: undefined,
        shopAllText: 'View all',
        ariaLabel: 'New arrivals carousel',
    },
    parameters: {
        docs: {
            description: {
                story: 'Branch where `shopAllText` is set without `shopAllUrl` — the label renders as plain text instead of a link.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(/view all/i)).toBeInTheDocument();
        // Plain span, not a link.
        await expect(canvas.queryByRole('link', { name: /view all/i })).not.toBeInTheDocument();
    },
};

export const CarouselOnly: Story = {
    args: {
        title: undefined,
        subtitle: undefined,
        shopAllUrl: undefined,
        shopAllText: undefined,
        titleAlign: 'left',
        ariaLabel: 'Demo carousel',
    },
    parameters: {
        docs: {
            description: {
                story: 'No title, no subtitle, no shop-all — the title row is omitted entirely. Used when the surrounding layout already provides a heading.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByLabelText(/demo carousel/i)).toBeInTheDocument();
        // No <h2> when title and subtitle are both undefined.
        await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
    },
};

export const LongCopy: Story = {
    args: {
        title: 'A Substantially Longer Section Heading That Tests Whether the Title Row Reflows Cleanly Alongside the Shop-All Link',
        subtitle:
            'A multi-sentence subtitle that exercises the secondary line under the title — long enough to wrap to several lines and verify the spacing between heading, subtitle, and the carousel track below.',
        shopAllText: 'Shop the entire editorial collection',
    },
    parameters: {
        docs: {
            description: {
                story: 'AC #2 long-copy authoring — long title + long subtitle + long shop-all label exercise the title row layout under realistic content density.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(
            canvas.getByRole('heading', { name: /a substantially longer section heading/i })
        ).toBeInTheDocument();
        await expect(canvas.getByText(/multi-sentence subtitle/i)).toBeInTheDocument();
    },
};
