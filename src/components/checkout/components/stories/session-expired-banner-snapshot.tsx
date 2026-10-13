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

type MockLinkProps = React.PropsWithChildren<{ to?: string; href?: string; [key: string]: unknown }>;

vi.mock('react-router', async (importOriginal) => ({
    // Preserve real exports so canonical middleware's dependency on react-router's
    // createContext keeps working when this story runs under the flattened mirror.
    ...(await importOriginal<typeof import('react-router')>()),
    href: (path: string) => path,
    useLocation: () => ({ pathname: '/checkout', search: '', hash: '', state: null, key: 'test' }),
    Link: (props: MockLinkProps) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
}));

vi.mock('@/components/link', () => ({
    Link: (props: MockLinkProps) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
}));

import { composeStories } from '@storybook/react-vite';
import * as SessionExpiredBannerStories from './session-expired-banner.stories';
import { render, cleanup } from '@testing-library/react';

const composed = composeStories(SessionExpiredBannerStories);

afterEach(() => {
    cleanup();
});

describe('SessionExpiredBanner stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
