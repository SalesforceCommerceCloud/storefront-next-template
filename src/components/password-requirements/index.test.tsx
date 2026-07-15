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
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PasswordRequirement } from './index';

describe('PasswordRequirement', () => {
    describe('rendering', () => {
        it('should render all password requirements', () => {
            render(<PasswordRequirement password="" />);

            expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
            expect(screen.getByText(/uppercase/i)).toBeInTheDocument();
            expect(screen.getByText(/lowercase/i)).toBeInTheDocument();
            expect(screen.getByText(/number/i)).toBeInTheDocument();
            expect(screen.getByText(/special/i)).toBeInTheDocument();
        });

        it('should render X icons when password is empty', () => {
            render(<PasswordRequirement password="" />);

            const xIcons = screen.getAllByTestId('x-icon');
            expect(xIcons).toHaveLength(5);
        });

        it('should render correct icons for valid password', () => {
            render(<PasswordRequirement password="ValidPass123!" />);

            const checkIcons = screen.getAllByTestId('check-icon');
            const xIcons = screen.queryAllByTestId('x-icon');

            expect(checkIcons.length).toBeGreaterThan(0);
            expect(xIcons.length).toBe(0);
        });
    });

    describe('password validation', () => {
        describe('length requirement', () => {
            it('should show X icon for password with less than 8 characters', () => {
                render(<PasswordRequirement password="Short1" />);

                const xIcons = screen.getAllByTestId('x-icon');
                expect(xIcons.length).toBeGreaterThan(0);
            });

            it('should show check icon for password with exactly 8 characters', () => {
                render(<PasswordRequirement password="Eight123!" />);

                const checkIcons = screen.getAllByTestId('check-icon');
                expect(checkIcons.length).toBeGreaterThan(0);
            });

            it('should show check icon for password with more than 8 characters', () => {
                render(<PasswordRequirement password="VeryLongPass123!" />);

                const checkIcons = screen.getAllByTestId('check-icon');
                expect(checkIcons.length).toBeGreaterThan(0);
            });
        });

        describe('uppercase requirement', () => {
            it('should show X icon when password has no uppercase letters', () => {
                render(<PasswordRequirement password="nouppercase123!" />);

                const xIcons = screen.getAllByTestId('x-icon');
                expect(xIcons.length).toBeGreaterThan(0);
            });

            it('should show check icon when password has uppercase letters', () => {
                render(<PasswordRequirement password="HasUppercase123!" />);

                const checkIcons = screen.getAllByTestId('check-icon');
                expect(checkIcons.length).toBeGreaterThan(0);
            });
        });

        describe('lowercase requirement', () => {
            it('should show X icon when password has no lowercase letters', () => {
                render(<PasswordRequirement password="NOLOWERCASE123!" />);

                const xIcons = screen.getAllByTestId('x-icon');
                expect(xIcons.length).toBeGreaterThan(0);
            });

            it('should show check icon when password has lowercase letters', () => {
                render(<PasswordRequirement password="HasLowercase123!" />);

                const checkIcons = screen.getAllByTestId('check-icon');
                expect(checkIcons.length).toBeGreaterThan(0);
            });
        });

        describe('number requirement', () => {
            it('should show X icon when password has no numbers', () => {
                render(<PasswordRequirement password="NoNumbers!" />);

                const xIcons = screen.getAllByTestId('x-icon');
                expect(xIcons.length).toBeGreaterThan(0);
            });

            it('should show check icon when password has numbers', () => {
                render(<PasswordRequirement password="HasNumber123!" />);

                const checkIcons = screen.getAllByTestId('check-icon');
                expect(checkIcons.length).toBeGreaterThan(0);
            });
        });

        describe('special character requirement', () => {
            it('should show X icon when password has no special characters', () => {
                render(<PasswordRequirement password="NoSpecial123" />);

                const xIcons = screen.getAllByTestId('x-icon');
                expect(xIcons.length).toBeGreaterThan(0);
            });

            it('should show check icon when password has special characters', () => {
                render(<PasswordRequirement password="HasSpecial123!" />);

                const checkIcons = screen.getAllByTestId('check-icon');
                expect(checkIcons.length).toBeGreaterThan(0);
            });

            it('should accept various special characters', () => {
                const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '='];
                specialChars.forEach((char) => {
                    const { unmount } = render(<PasswordRequirement password={`Pass123${char}`} />);
                    const checkIcons = screen.queryAllByTestId('check-icon');
                    expect(checkIcons.length).toBeGreaterThan(0);
                    unmount();
                });
            });
        });

        describe('complete valid password', () => {
            it('should show all check icons for fully valid password', () => {
                render(<PasswordRequirement password="ValidPass123!" />);

                const checkIcons = screen.getAllByTestId('check-icon');
                const xIcons = screen.queryAllByTestId('x-icon');

                expect(checkIcons.length).toBe(5);
                expect(xIcons.length).toBe(0);
            });

            it('should show mixed icons for partially valid password', () => {
                render(<PasswordRequirement password="lowercase123" />);

                const checkIcons = screen.queryAllByTestId('check-icon');
                const xIcons = screen.queryAllByTestId('x-icon');

                expect(checkIcons.length).toBeGreaterThan(0);
                expect(xIcons.length).toBeGreaterThan(0);
                expect(checkIcons.length + xIcons.length).toBe(5);
            });
        });
    });

    describe('className prop', () => {
        it('should apply custom className to the container', () => {
            const { container } = render(<PasswordRequirement password="" className="custom-class" />);

            const wrapper = container.querySelector('.custom-class');
            expect(wrapper).toBeInTheDocument();
        });

        it('should not break when className is not provided', () => {
            render(<PasswordRequirement password="" />);

            expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
        });
    });

    describe('edge cases', () => {
        it('should handle very long passwords', () => {
            render(<PasswordRequirement password="VeryLongPassword123456789!" />);

            const checkIcons = screen.getAllByTestId('check-icon');
            expect(checkIcons.length).toBe(5);
        });

        it('should handle passwords with unicode characters', () => {
            render(<PasswordRequirement password="TestUnicode✓123!" />);

            const checkIcons = screen.getAllByTestId('check-icon');
            expect(checkIcons.length).toBeGreaterThan(0);
        });

        it('should handle passwords with spaces', () => {
            render(<PasswordRequirement password="Pass With Space123!" />);

            const checkIcons = screen.getAllByTestId('check-icon');
            expect(checkIcons.length).toBeGreaterThan(0);
        });
    });

    describe('Semantic list markup', () => {
        it('renders requirements in a ul with role="list"', () => {
            render(<PasswordRequirement password="" />);

            const list = screen.getByRole('list');
            expect(list).toBeInTheDocument();
            expect(list.tagName).toBe('UL');
        });

        it('renders each requirement in a li element', () => {
            render(<PasswordRequirement password="" />);

            const list = screen.getByRole('list');
            const listItems = list.querySelectorAll('li');
            expect(listItems).toHaveLength(5);
        });
    });
});
