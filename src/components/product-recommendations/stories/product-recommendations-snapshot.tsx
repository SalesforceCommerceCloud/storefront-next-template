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
// oxlint-disable-next-line import/no-namespace
import * as ProductRecommendationsStories from './index.stories';
import { render, cleanup } from '@testing-library/react';

// Hoist dependencies for use in vi.mock (avoids async imports which fail on Windows)
const { createContext: reactCreateContext, actualReactRouter } = vi.hoisted(() => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const reactRouter = require('react-router');
    return { createContext: React.createContext, actualReactRouter: reactRouter };
});

// Pattern 3 cleanup (W-22451618 followup): the `useRecommenders` mock that
// previously lived here was dead boilerplate — the Playground story now passes
// a resolved `Promise<Recommendation>` through the `data` prop, which bypasses
// `useRecommenders` entirely (the hook is only invoked when `data` is absent).
//
// Mock react-router hooks
vi.mock('react-router', () => {
    return {
        ...actualReactRouter,
        createContext: reactCreateContext,
        useNavigate: () => vi.fn(),
        useLocation: () => ({
            pathname: '/',
            search: '',
            hash: '',
            state: null,
            key: 'default',
        }),
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

const composed = composeStories(ProductRecommendationsStories);

afterEach(() => {
    cleanup();
});

describe('ProductRecommendations stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        if (Story?.parameters?.snapshot === false || /interactiontests?/i.test(storyName)) continue;
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
