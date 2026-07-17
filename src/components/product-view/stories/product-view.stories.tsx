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
import type { Meta, StoryObj } from '@storybook/react-vite';
import ProductView from '../product-view';
import { mockStandardProductOrderable } from '../../__mocks__/standard-product';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

const mockSite = mockSiteObject;

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logAction = action('interaction');

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;

            const interactiveElement = target.closest('button, a, [role="button"]');
            if (interactiveElement) {
                event.preventDefault();
                event.stopPropagation();
                const label = interactiveElement.textContent?.trim().substring(0, 50) || 'unlabeled';
                const tag = interactiveElement.tagName.toLowerCase();

                if (label.match(/add to cart/i)) {
                    action('add-to-cart')({ label });
                } else if (label.match(/wishlist/i)) {
                    action('wishlist')({ label });
                } else {
                    logAction({ type: 'click', tag, label });
                }
            }
        };

        root.addEventListener('click', handleClick, true);
        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

type SyntheticArgs = {
    productName: string;
    shortDescription: string;
};

const meta: Meta<typeof ProductView> = {
    title: 'Products/Product View/Product View',
    component: ProductView,
    tags: ['autodocs', 'chromatic-core'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Main product detail page (PDP) layout. Renders the image gallery, ' +
                    'product info, cart actions, and below-the-fold accordion sections ' +
                    'driven by the `product` SCAPI shape. Use Playground to drive ' +
                    'long-name / long-description coverage; OutOfStock and MissingImages ' +
                    'cover data-shape variants.',
            },
        },
        a11y: {
            config: {
                rules: [
                    // In isolated Storybook context, heading hierarchy is incomplete (h1 -> h3)
                    // Real PDP page provides proper h1/h2 context from page layout
                    { id: 'heading-order', enabled: false },
                ],
            },
        },
    },
    argTypes: {
        product: { table: { disable: true } },
        mode: {
            control: 'inline-radio',
            options: ['add', 'edit'],
            description: 'Add-to-cart vs. edit-cart-line variant. Edit mode hides the wishlist button.',
        },
    },
    decorators: [
        (Story) => {
            // Mock window.fetch to prevent 404s from FAQ / EstimatedDelivery / ReturnsAndWarranty
            // children that fire fetches on mount.
            if (typeof window !== 'undefined') {
                window.fetch = async () =>
                    ({
                        ok: true,
                        json: async () => ({}),
                        text: async () => '',
                    }) as any;
            }
            return (
                <ConfigProvider config={mockConfig}>
                    <SiteProvider
                        site={mockSite}
                        locale={mockLocale}
                        language={mockSiteObject.defaultLocale}
                        currency={mockSiteObject.defaultCurrency}>
                        <ActionLogger>
                            <div className="section-container py-4">
                                <Story />
                            </div>
                        </ActionLogger>
                    </SiteProvider>
                </ConfigProvider>
            );
        },
    ],
};

export default meta;
type Story = StoryObj<typeof ProductView>;
type StoryWithSynthetic = StoryObj<React.ComponentType<Parameters<typeof ProductView>[0] & Partial<SyntheticArgs>>>;

/**
 * Rich-but-realistic baseline. The Controls panel exposes the component's
 * `mode` prop alongside synthetic `productName` and `shortDescription` text
 * controls so QA can drive long-name and long-description coverage without
 * dedicated stories. View-changing data states (out-of-stock, missing images)
 * remain dedicated stories below.
 */
export const Playground: StoryWithSynthetic = {
    args: {
        mode: 'add',
        productName: mockStandardProductOrderable.product.name,
        shortDescription: mockStandardProductOrderable.product.shortDescription ?? '',
    },
    argTypes: {
        productName: {
            description: 'Synthetic: product display name (use for long-name coverage)',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        shortDescription: {
            description: 'Synthetic: short description shown under the title',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const { productName, shortDescription, ...componentProps } = args;
        const product = {
            ...mockStandardProductOrderable.product,
            name: productName ?? mockStandardProductOrderable.product.name,
            shortDescription: shortDescription ?? mockStandardProductOrderable.product.shortDescription,
        };
        return <ProductView {...(componentProps as Parameters<typeof ProductView>[0])} product={product} />;
    },
};

/**
 * Image gallery has no images to render — layout collapses to a placeholder.
 * Worth a dedicated bookmarkable URL because the visual change is structural,
 * not just stylistic.
 */
export const MissingImages: Story = {
    args: {
        product: {
            ...mockStandardProductOrderable.product,
            imageGroups: [],
        },
    },
};

/**
 * Out-of-stock — the cart action button, delivery options, and inventory
 * messaging all change. Distinct enough visually to warrant a dedicated story
 * rather than a Controls toggle.
 */
export const OutOfStock: Story = {
    args: {
        product: {
            ...mockStandardProductOrderable.product,
            inventory: {
                id: 'inv-out',
                ats: 0,
                orderable: false,
                backorderable: false,
                preorderable: false,
            },
        },
    },
};
