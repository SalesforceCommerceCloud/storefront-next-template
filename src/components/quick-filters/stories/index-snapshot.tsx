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

vi.mock('react-router', async (importOriginal) => ({
    // Preserve real exports so canonical middleware's dependency on react-router's
    // createContext keeps working when this story runs under the flattened mirror.
    ...(await importOriginal<typeof import('react-router')>()),
    href: (path: string) => path,
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useNavigation: () => ({ state: 'idle', location: undefined }),
}));

vi.mock('storybook/test', () => ({
    within: vi.fn(),
    expect: vi.fn(),
    userEvent: {
        click: vi.fn(),
    },
}));

vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => vi.fn(),
}));

import { composeStories } from '@storybook/react-vite';
import { cleanup, render } from '@testing-library/react';
import * as QuickFiltersStories from './index.stories';

const composed = composeStories(QuickFiltersStories);

afterEach(() => {
    cleanup();
});

describe('QuickFilters stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
