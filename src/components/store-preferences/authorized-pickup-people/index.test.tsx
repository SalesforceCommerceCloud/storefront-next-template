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
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import AuthorizedPickupPeople from '.';

const STORAGE_KEY = 'store-preferences-authorized-pickup';

describe('AuthorizedPickupPeople', () => {
    beforeEach(() => {
        window.localStorage.removeItem(STORAGE_KEY);
    });

    afterEach(() => {
        window.localStorage.removeItem(STORAGE_KEY);
    });

    const renderComponent = () => render(<AuthorizedPickupPeople />);

    describe('Section content', () => {
        test('renders Authorized Pickup People heading', () => {
            renderComponent();
            expect(screen.getByText('Authorised Pickup People')).toBeInTheDocument();
        });

        test('renders section description', () => {
            renderComponent();
            expect(
                screen.getByText('Add people who are authorised to pick up orders on your behalf')
            ).toBeInTheDocument();
        });

        test('renders Add Person button', () => {
            renderComponent();
            expect(screen.getByRole('button', { name: /Add Person/i })).toBeInTheDocument();
        });

        test('renders ID note alert', () => {
            renderComponent();
            expect(
                screen.getByText(
                    /Authorised pickup people will need to show a valid ID matching the name on file when picking up orders/i
                )
            ).toBeInTheDocument();
        });

        test('renders empty state when no people exist', () => {
            renderComponent();
            expect(
                screen.getByText(/No authorised pickup people yet. Add someone who can pick up orders on your behalf/i)
            ).toBeInTheDocument();
        });
    });

    describe('accessibility - informational note is not announced assertively', () => {
        // The ID note is static, non-urgent guidance. It must not sit in an assertive
        // live region (role="alert"), which a screen reader would announce on load,
        // interrupting the user. It should be a passive note instead. Guard for W-23325763.

        test('presents the ID note as a passive note, not an alert', () => {
            renderComponent();

            const note = screen.getByText(
                /Authorised pickup people will need to show a valid ID matching the name on file when picking up orders/i
            );
            const container = note.closest('[data-slot="alert"]');

            expect(container).not.toBeNull();
            expect(container).toHaveAttribute('role', 'note');
        });

        test('renders no assertive alert region on the page', () => {
            renderComponent();
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
    });

    describe('Add Authorized Person modal', () => {
        test('opens modal when Add Person is clicked', async () => {
            const user = userEvent.setup();
            renderComponent();
            await user.click(screen.getByRole('button', { name: /Add Person/i }));

            const dialog = screen.getByRole('dialog', {
                name: 'Add Authorised Person',
            });
            expect(dialog).toBeInTheDocument();
            expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
            expect(dialog).toHaveTextContent('Relationship');
            expect(screen.getByRole('combobox')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        });

        test('closes modal when Cancel is clicked', async () => {
            const user = userEvent.setup();
            renderComponent();
            await user.click(screen.getByRole('button', { name: /Add Person/i }));
            expect(screen.getByRole('dialog', { name: 'Add Authorised Person' })).toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(screen.queryByRole('dialog', { name: 'Add Authorised Person' })).not.toBeInTheDocument();
        });

        test('shows validation errors when Save is clicked with empty required fields', async () => {
            const user = userEvent.setup();
            renderComponent();
            await user.click(screen.getByRole('button', { name: /Add Person/i }));

            await user.click(screen.getByRole('button', { name: 'Save' }));

            expect(screen.getByText('First name is required.')).toBeInTheDocument();
            expect(screen.getByText('Last name is required.')).toBeInTheDocument();
            expect(screen.getByText('Email is required.')).toBeInTheDocument();
        });

        test('keeps modal open and shows validation when email is invalid', async () => {
            const user = userEvent.setup();
            renderComponent();
            await user.click(screen.getByRole('button', { name: /Add Person/i }));

            await user.type(screen.getByPlaceholderText('First Name'), 'Jane');
            await user.type(screen.getByPlaceholderText('Last Name'), 'Doe');
            await user.type(screen.getByPlaceholderText('email@example.com'), 'not-an-email');
            await user.click(screen.getByRole('button', { name: 'Save' }));

            // Validation prevents submit: dialog stays open (person not added)
            expect(screen.getByRole('dialog', { name: 'Add Authorised Person' })).toBeInTheDocument();
        });

        test('adds a person and displays in list when form is valid', async () => {
            const user = userEvent.setup();
            renderComponent();
            await user.click(screen.getByRole('button', { name: /Add Person/i }));

            await user.type(screen.getByPlaceholderText('First Name'), 'Jane');
            await user.type(screen.getByPlaceholderText('Last Name'), 'Doe');
            await user.type(screen.getByPlaceholderText('email@example.com'), 'jane.doe@example.com');
            await user.selectOptions(screen.getByRole('combobox'), 'spouse');
            await user.click(screen.getByRole('button', { name: 'Save' }));

            expect(screen.queryByRole('dialog', { name: 'Add Authorised Person' })).not.toBeInTheDocument();
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
            expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument();
            expect(screen.getByText('Active')).toBeInTheDocument();
        });
    });

    describe('Edit and delete', () => {
        test('opens Edit modal when edit button is clicked on a person', async () => {
            const user = userEvent.setup();
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify([
                    {
                        id: 'test-id-1',
                        firstName: 'Jane',
                        lastName: 'Doe',
                        email: 'jane@example.com',
                        relationship: 'spouse',
                    },
                ])
            );
            renderComponent();

            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
            const editButton = screen.getByRole('button', { name: 'Edit' });
            await user.click(editButton);

            expect(screen.getByRole('dialog', { name: 'Edit Authorised Person' })).toBeInTheDocument();
            expect(screen.getByPlaceholderText('First Name')).toHaveValue('Jane');
            expect(screen.getByPlaceholderText('Last Name')).toHaveValue('Doe');
            expect(screen.getByPlaceholderText('email@example.com')).toHaveValue('jane@example.com');
        });

        test('updates person when Edit form is saved', async () => {
            const user = userEvent.setup();
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify([
                    {
                        id: 'test-id-1',
                        firstName: 'Jane',
                        lastName: 'Doe',
                        email: 'jane@example.com',
                        relationship: 'spouse',
                    },
                ])
            );
            renderComponent();

            await user.click(screen.getByRole('button', { name: 'Edit' }));
            const firstNameInput = screen.getByPlaceholderText('First Name');
            await user.clear(firstNameInput);
            await user.type(firstNameInput, 'Janet');
            await user.click(screen.getByRole('button', { name: 'Save' }));

            expect(screen.getByText('Janet Doe')).toBeInTheDocument();
            expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
        });

        test('removes person when delete button is clicked', async () => {
            const user = userEvent.setup();
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify([
                    {
                        id: 'test-id-1',
                        firstName: 'Jane',
                        lastName: 'Doe',
                        email: 'jane@example.com',
                        relationship: 'spouse',
                    },
                ])
            );
            renderComponent();

            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
            const deleteButton = screen.getByRole('button', { name: 'Delete' });
            await user.click(deleteButton);

            expect(screen.getByRole('alertdialog')).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Remove' }));

            expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
        });
    });

    describe('Persistence', () => {
        test('persists added person to localStorage', async () => {
            const user = userEvent.setup();
            renderComponent();
            await user.click(screen.getByRole('button', { name: /Add Person/i }));

            await user.type(screen.getByPlaceholderText('First Name'), 'Jane');
            await user.type(screen.getByPlaceholderText('Last Name'), 'Doe');
            await user.type(screen.getByPlaceholderText('email@example.com'), 'jane@example.com');
            await user.selectOptions(screen.getByRole('combobox'), 'spouse');
            await user.click(screen.getByRole('button', { name: 'Save' }));

            const stored = window.localStorage.getItem(STORAGE_KEY);
            expect(stored).toBeTruthy();
            const parsed = JSON.parse(stored as string);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(1);
            expect(parsed[0]).toMatchObject({
                firstName: 'Jane',
                lastName: 'Doe',
                email: 'jane@example.com',
            });
        });

        test('hydrates list from localStorage on mount', () => {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify([
                    {
                        id: 'hydrated-id',
                        firstName: 'Bob',
                        lastName: 'Smith',
                        email: 'bob@example.com',
                        relationship: 'friend',
                    },
                ])
            );
            renderComponent();

            expect(screen.getByText('Bob Smith')).toBeInTheDocument();
            expect(screen.getByText('bob@example.com')).toBeInTheDocument();
        });
    });
});
