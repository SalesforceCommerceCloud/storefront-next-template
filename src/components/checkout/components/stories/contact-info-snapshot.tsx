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

type MockFormProps = React.PropsWithChildren<Record<string, unknown>>;
type MockLinkProps = React.PropsWithChildren<{ to?: string; href?: string; [key: string]: unknown }>;

const fetcherMock = {
    data: null,
    state: 'idle',

    submit: () => {},
    Form: (props: MockFormProps) => <form {...props}>{props.children}</form>,
};

vi.mock('react-router', () => ({
    href: (path: string) => path,
    createContext: vi.fn().mockImplementation(() => ({})),
    useFetcher: () => fetcherMock,
    useFetchers: () => [],
    useResolvedPath: (to: string) => ({ pathname: to, search: '', hash: '', state: null, key: 'test' }),
    useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' }),
    useNavigate: () => () => {},
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useNavigation: () => ({
        state: 'idle',
        location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
    }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Link: (props: MockLinkProps) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
}));
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: () => {},
    }),
}));
vi.mock('@/providers/basket', () => ({
    default: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useBasket: () => undefined,
}));
/** Guest checkout: hook returns context.customerProfile directly (see use-customer-profile.ts). */
vi.mock('@/hooks/checkout/use-customer-profile', () => ({
    useCustomerProfile: () => undefined,
}));

vi.mock('@/hooks/use-checkout', () => ({
    useCheckoutContext: () => ({
        step: 1,
        computedStep: 1,
        STEPS: { CONTACT_INFO: 1, PICKUP: 1.5, SHIPPING_ADDRESS: 2, SHIPPING_OPTIONS: 3, PAYMENT: 4, PLACE_ORDER: 5 },
        goToStep: vi.fn(),
        goToNextStep: vi.fn(),
        exitEditMode: vi.fn(),
        editingStep: null,
        customerProfile: undefined,
        shippingDefaultSet: Promise.resolve(undefined),
        shipmentDistribution: {
            hasUnaddressedDeliveryItems: false,
            hasEmptyShipments: false,
            deliveryShipments: [],
            hasDeliveryItems: true,
            hasPickupItems: false,
            enableMultiAddress: false,
            hasMultipleDeliveryAddresses: false,
            isDeliveryProductItem: () => true,
        },
        savedAddresses: [],
        setSavedAddresses: vi.fn(),
    }),
}));

vi.mock('@salesforce/storefront-next-runtime/config', async () => {
    const actual = await vi.importActual<typeof import('@salesforce/storefront-next-runtime/config')>(
        '@salesforce/storefront-next-runtime/config'
    );
    return {
        ...actual,
        useConfig: () => ({ auth: { otpLength: 6 }, features: { passkey: { enabled: false, mode: 'email' } } }),
    };
});

import { composeStories } from '@storybook/react-vite';

import * as ContactInfoStories from './contact-info.stories';
import { render, cleanup } from '@testing-library/react';

const composed = composeStories(ContactInfoStories);

afterEach(() => {
    cleanup();
});

describe('ContactInfo stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
