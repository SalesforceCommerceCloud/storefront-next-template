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
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { SkipLink } from './skip-link';
import userEvent from '@testing-library/user-event';

describe('SkipLink', () => {
    const i18n = i18next.createInstance();
    void i18n.init({
        lng: 'en',
        resources: {
            en: {
                common: {
                    skipToMainContent: 'Skip to main content',
                },
            },
        },
    });

    test('renders skip link with correct text', () => {
        render(
            <I18nextProvider i18n={i18n}>
                <SkipLink />
            </I18nextProvider>
        );

        const link = screen.getByText('Skip to main content');
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '#main-content');
    });

    test('focuses and scrolls to main content on click', async () => {
        const user = userEvent.setup();

        // Create main element
        const main = document.createElement('main');
        main.id = 'main-content';
        main.tabIndex = -1;
        document.body.appendChild(main);

        // Mock scrollIntoView since it's not available in JSDOM
        const scrollSpy = vi.fn();
        main.scrollIntoView = scrollSpy;

        const focusSpy = vi.spyOn(main, 'focus');

        render(
            <I18nextProvider i18n={i18n}>
                <SkipLink />
            </I18nextProvider>
        );

        const link = screen.getByText('Skip to main content');
        await user.click(link);

        expect(focusSpy).toHaveBeenCalled();
        expect(scrollSpy).toHaveBeenCalled();

        // Cleanup
        document.body.removeChild(main);
    });

    test('has sr-only class by default', () => {
        render(
            <I18nextProvider i18n={i18n}>
                <SkipLink />
            </I18nextProvider>
        );

        const link = screen.getByText('Skip to main content');
        expect(link).toHaveClass('sr-only');
    });
});
