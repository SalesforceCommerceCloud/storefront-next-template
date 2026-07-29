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
/**
 * Keyboard-accessibility regression guard for the header search combobox
 * (WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value).
 *
 * Unlike search.test.tsx, this file does NOT stub the Suggestions tree — it
 * renders the real recent-searches suggestions so it can prove that a keyboard
 * user can actually reach and activate a suggestion. Only the network/data
 * hooks are mocked so the component takes the offline recent-searches path.
 *
 * These assertions fail against the pre-fix component (input onBlur unmounted
 * the panel before Tab could enter it; options activated on mouseDown only),
 * which is what makes them a regression guard rather than a characterisation
 * of the current DOM.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { useSearchSuggestions } from '@/hooks/use-search-suggestions';
import { useTransformSearchSuggestions } from '@/hooks/use-transform-search-suggestions';
import SearchBar from './search';

const mockNavigate = vi.fn();
vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => mockNavigate,
}));

// Force the offline recent-searches branch: no live suggestion data.
vi.mock('@/hooks/use-search-suggestions', () => ({
    useSearchSuggestions: vi.fn(),
}));
vi.mock('@/hooks/use-transform-search-suggestions', () => ({
    useTransformSearchSuggestions: vi.fn(),
}));

const mockUseSearchSuggestions = vi.mocked(useSearchSuggestions);
const mockUseTransformSearchSuggestions = vi.mocked(useTransformSearchSuggestions);

const renderSearchBar = () => {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: (
                    <AllProvidersWrapper>
                        <SearchBar />
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/global/en-GB'] }
    );
    return render(<RouterProvider router={router} />);
};

describe('SearchBar keyboard accessibility (WCAG 2.1.1 / 4.1.2)', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
        mockUseSearchSuggestions.mockReturnValue({ data: null, refetch: vi.fn().mockResolvedValue(undefined) } as any);
        mockUseTransformSearchSuggestions.mockReturnValue(null);
        sessionStorage.clear();
        sessionStorage.setItem('recent-search-key', JSON.stringify(['shirts', 'ties', 'jackets']));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('exposes the suggestions popup with a valid composite role (dialog, not listbox)', async () => {
        const user = userEvent.setup();
        renderSearchBar();

        // Desktop and mobile headers both render a combobox; act on the first.
        const input = screen.getAllByRole('combobox')[0];
        expect(input).toHaveAttribute('aria-haspopup', 'dialog');

        await user.click(input);

        // Composite popup: a dialog can legally hold headings, a product grid,
        // links and buttons. A listbox cannot (axe aria-required-children).
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('lets a keyboard user Tab from the input onto the first suggestion (2.1.1)', async () => {
        const user = userEvent.setup();
        renderSearchBar();

        const input = screen.getAllByRole('combobox')[0];
        await user.click(input);
        await screen.findByRole('dialog');

        // Tab moves real DOM focus onto the first reachable suggestion button.
        await user.tab();

        const active = document.activeElement as HTMLElement | null;
        expect(active?.getAttribute('data-slot')).toBe('suggestion');
        expect(active?.closest('[role="dialog"]')).not.toBeNull();

        // The panel must stay open while focus is inside it. The pre-fix input
        // onBlur closed it here, making the suggestions unreachable.
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('activates the focused suggestion with Enter and navigates (2.1.1)', async () => {
        const user = userEvent.setup();
        renderSearchBar();

        const input = screen.getAllByRole('combobox')[0];
        await user.click(input);
        await screen.findByRole('dialog');

        await user.tab();
        expect((document.activeElement as HTMLElement)?.getAttribute('data-slot')).toBe('suggestion');

        await user.keyboard('{Enter}');

        // "shirts" is the first seeded recent search.
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('shirts'));
    });

    it('closes the panel on Escape and returns focus to the combobox (2.1.1)', async () => {
        const user = userEvent.setup();
        renderSearchBar();

        const input = screen.getAllByRole('combobox')[0];
        await user.click(input);
        await screen.findByRole('dialog');

        await user.keyboard('{Escape}');

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(input);
    });

    it('reopens the panel when focus returns after Escape was pressed with the input already focused', async () => {
        // Regression guard for the reopen-suppress flag getting permanently stuck. Pressing Escape
        // while the input already holds focus used to arm the flag and then call the no-op focus()
        // on the already-focused input, so the focus event that clears the flag never fired. The
        // next genuine focus was then swallowed and the panel stayed shut. This asserts the panel
        // reopens on that next focus; it fails against the pre-fix component.
        const user = userEvent.setup();
        renderSearchBar();

        const input = screen.getAllByRole('combobox')[0];

        await user.click(input);
        await screen.findByRole('dialog');

        // Escape while the input is the active element — the case that stranded the flag.
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        // Focus leaves the field and the shopper clicks back in. This next focus must reopen the
        // panel (recent searches exist); the stuck flag would drop it and keep the panel closed.
        input.blur();
        await user.click(input);

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
});
