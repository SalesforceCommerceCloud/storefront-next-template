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
import { afterEach, describe, expect, test } from 'vitest';
import { composeStories } from '@storybook/react-vite';
import { cleanup, render } from '@testing-library/react';
import * as ShopByStoreSheetStories from './shop-by-store-sheet.stories';

const composed = composeStories(ShopByStoreSheetStories);

afterEach(() => {
    cleanup();
});

describe('ShopByStoreSheet stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            render(<Story />);
            expect(document.body).toMatchSnapshot();
        });
    }
});
