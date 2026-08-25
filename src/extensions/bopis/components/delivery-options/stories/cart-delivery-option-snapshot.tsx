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
import { vi, expect, test, describe, afterEach } from 'vitest';
import { composeStories } from '@storybook/react-vite';
import * as CartDeliveryOptionStories from './cart-delivery-option.stories';
import { render, cleanup } from '@testing-library/react';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// Mock react-i18next
const tMap: Record<string, string> = {
    'deliveryOptions.pickupOrDelivery.shipToAddress': 'Ship to Address',
    'deliveryOptions.pickupOrDelivery.storePickup': 'Pick Up in Store',
    'deliveryOptions.pickupOrDelivery.delivery': 'Delivery',
    'deliveryOptions.pickupOrDelivery.outOfStockAtStore': 'Out of stock at store',
    'cart.pickupStoreInfo.missingStoreIdOrInventoryIdError': 'Missing store or inventory information',
};
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => tMap[key] || key,
    }),
}));

// Mock hooks
vi.mock('@/extensions/bopis/hooks/use-pickup-availability', () => ({
    usePickupAvailability: () => false,
}));

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    default: ({ children }: { children: React.ReactNode }) => children,
    useStoreLocator: (selector: (store: any) => any) => {
        const mockStore = {
            selectedStoreInfo: null,
            open: vi.fn(),
            close: vi.fn(),
            isOpen: false,
        };
        return selector(mockStore);
    },
}));

vi.mock('@/providers/basket', () => ({
    default: ({ children }: { children: React.ReactNode; value?: any }) => children,
    useBasket: () => ({
        basketId: 'basket-1',
        shipments: [],
    }),
}));

vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: vi.fn(),
    }),
}));

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: () => ({
            data: null,
            state: 'idle',
            submit: vi.fn(),
            Form: (props: React.PropsWithChildren<Record<string, unknown>>) => <form {...props}>{props.children}</form>,
        }),
        useFetchers: () => [],
        useNavigate: () => vi.fn(),
        useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
        useResolvedPath: () => ({ pathname: '/', search: '', hash: '' }),
        useHref: () => '/',
        Link: (props: any) => (
            <a href={props.to} {...props}>
                {props.children}
            </a>
        ),
        NavLink: (props: any) => (
            <a href={props.to} {...props}>
                {props.children}
            </a>
        ),
    };
});

const composed = composeStories(CartDeliveryOptionStories);

afterEach(() => {
    cleanup();
});

describe('CartDeliveryOption stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(
                <AllProvidersWrapper>
                    <Story />
                </AllProvidersWrapper>
            );
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
