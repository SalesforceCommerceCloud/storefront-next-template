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
import type { ComponentPropsWithoutRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import CategoryNavigationMenu from './impl';
import { testData } from './__tests__/data';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';

const slugPathConfig: AppConfig = {
    ...mockConfig,
    url: {
        ...mockConfig.url,
        seoRoutes: {
            [mockSiteObject.id]: {
                product: { prefix: 'p' },
                category: { prefix: 'catalog', mode: 'slug-path' },
            },
        },
    },
};

describe('CategoryNavigationMenu Component', () => {
    const renderComponent = (
        props: ComponentPropsWithoutRef<typeof CategoryNavigationMenu>,
        config: AppConfig = mockConfig
    ) => {
        const router = createMemoryRouter(
            [
                {
                    path: '*',
                    element: (
                        <AllProvidersWrapper config={config}>
                            <CategoryNavigationMenu {...props} />
                        </AllProvidersWrapper>
                    ),
                },
            ],
            { initialEntries: ['/'] }
        );
        return render(<RouterProvider router={router} />);
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Rendering', () => {
        it('should render leaf categories as links and branch categories with triggers and content', () => {
            const { getByRole } = renderComponent({ categories: testData.basic });

            expect(getByRole('navigation')).toBeInTheDocument();
            expect(getByRole('list')).toBeInTheDocument();

            const element1 = getByRole('button', { name: testData.basic[0].name });
            const element2 = getByRole('button', { name: testData.basic[1].name });
            const element3 = getByRole('link', { name: testData.basic[2].name });
            expect(element1).toBeInTheDocument();
            expect(element2).toBeInTheDocument();
            expect(element3).toBeInTheDocument();
            expect(element3.getAttribute('href')).toBe('/global/en-GB/c/cat-3');
        });

        it('uses the complete authoritative slug for a leaf category', () => {
            const categories = [
                {
                    id: 'internal-id',
                    name: 'Dresses',
                    slug: 'women/clothing/dresses',
                    onlineSubCategoriesCount: 0,
                },
            ];

            const { getByRole } = renderComponent({ categories }, slugPathConfig);

            expect(getByRole('link', { name: 'Dresses' })).toHaveAttribute(
                'href',
                '/global/en-GB/catalog/women/clothing/dresses'
            );
        });

        it('does not expose a missing-slug leaf as an enabled link', () => {
            const categories = [{ id: 'internal-id', name: 'Dresses', onlineSubCategoriesCount: 0 }];

            const { getByText, queryByRole } = renderComponent({ categories }, slugPathConfig);

            expect(getByText('Dresses')).toBeInTheDocument();
            expect(queryByRole('link', { name: 'Dresses' })).not.toBeInTheDocument();
        });

        it('should add data-has-submenu attribute to triggers with submenus', () => {
            const { getByRole } = renderComponent({ categories: testData.basic });

            const triggerWithSubmenu1 = getByRole('button', { name: testData.basic[0].name });
            const triggerWithSubmenu2 = getByRole('button', { name: testData.basic[1].name });
            const leafLink = getByRole('link', { name: testData.basic[2].name });

            // Triggers with submenus should have data-has-submenu
            expect(triggerWithSubmenu1).toHaveAttribute('data-has-submenu', 'true');
            expect(triggerWithSubmenu2).toHaveAttribute('data-has-submenu', 'true');

            // Leaf links should not have data-has-submenu
            expect(leafLink).not.toHaveAttribute('data-has-submenu');
        });

        it('should render nested structure correctly', async () => {
            const { container, getByRole, getByText } = renderComponent({
                categories: testData.deepNesting,
            });

            // Check root categories are present
            const element1 = getByRole('button', { name: testData.deepNesting[0].name });
            const element2 = getByRole('button', { name: testData.deepNesting[1].name });
            expect(element1).toBeInTheDocument();
            expect(element2).toBeInTheDocument();

            // Check child categories aren't present/visible yet
            expect(() => getByText(testData.deepNesting[1]?.categories?.[0]?.name as string)).toThrow();

            // Open the menu of the first root category
            await act(async () => {
                fireEvent.click(element1);
                await Promise.resolve();
            });

            const menuContent1 = container.querySelector('[data-slot="navigation-menu-content"]');
            expect(menuContent1).toBeInTheDocument();

            const menuItems1 = menuContent1?.querySelectorAll('li');
            expect(menuItems1).toBeDefined();
            expect(menuItems1).toHaveLength(4);
            expect(
                Array.from(menuItems1 as NodeListOf<HTMLLIElement>).map((item) =>
                    item.querySelector('a, button')?.textContent?.trim()
                )
            ).toStrictEqual(['Child 1.1', 'Grandchild 1.1.1', 'Grandchild 1.1.2', 'Child 1.2']);

            // Open the menu of the second root category
            await act(async () => {
                fireEvent.click(element2);
                await Promise.resolve();
            });

            const menuContent2 = container.querySelector('[data-slot="navigation-menu-content"]');
            expect(menuContent2).toBeInTheDocument();

            const menuItems2 = menuContent2?.querySelectorAll('li');
            expect(menuItems2).toBeDefined();
            expect(menuItems2).toHaveLength(2);
            expect(
                Array.from(menuItems2 as NodeListOf<HTMLLIElement>).map((item) =>
                    item.querySelector('a, button')?.textContent?.trim()
                )
            ).toStrictEqual(['Child 2.1', 'Child 2.2']);
        });

        it('should return null for empty categories array', () => {
            const { container } = renderComponent({ categories: [] });
            expect(container.firstChild).toBeNull();
        });

        it('should return null for null/undefined categories', () => {
            const { container } = renderComponent({ categories: null as any });
            expect(container.firstChild).toBeNull();
        });

        it('should render with maxDepth = 1', () => {
            const { getByRole } = renderComponent({
                categories: testData.deepNesting,
                maxDepth: 1,
            });

            // Should render parent categories as links, not buttons
            expect(getByRole('link', { name: 'Parent Category 1' })).toBeInTheDocument();
            expect(getByRole('link', { name: 'Parent Category 2' })).toBeInTheDocument();
        });

        it('should render with maxDepth = 2', async () => {
            const { container, getByRole } = renderComponent({
                categories: testData.deepNesting,
                maxDepth: 2,
            });

            // Should render parent categories as buttons
            const element1 = getByRole('button', { name: 'Parent Category 1' });
            expect(element1).toBeInTheDocument();
            expect(getByRole('button', { name: 'Parent Category 2' })).toBeInTheDocument();

            // Open the menu of the first root category
            await act(async () => {
                fireEvent.click(element1);
                await Promise.resolve();
            });

            const menuContent1 = container.querySelector('[data-slot="navigation-menu-content"]');
            expect(menuContent1).toBeInTheDocument();

            const menuItems1 = menuContent1?.querySelectorAll('li');
            expect(menuItems1).toBeDefined();
            expect(menuItems1).toHaveLength(2);
            expect(
                Array.from(menuItems1 as NodeListOf<HTMLLIElement>).map((item) =>
                    item.querySelector('a')?.textContent?.trim()
                )
            ).toStrictEqual(['Child 1.1', 'Child 1.2']);
        });

        it('should throw when maxDepth is 0', () => {
            // With createMemoryRouter, React Router catches the error via its error boundary.
            // We suppress console.error and verify the error boundary rendered.
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            renderComponent({
                categories: testData.basic,
                maxDepth: 0,
            });
            expect(consoleSpy).toHaveBeenCalled();
            const errorMessages = consoleSpy.mock.calls.map((call) => call.join(' ')).join(' ');
            expect(errorMessages).toContain('maxDepth must be greater than 0');
            consoleSpy.mockRestore();
        });
    });

    describe('Rendering Customizations', () => {
        it('should use custom render data', async () => {
            const { getAllByTestId } = renderComponent({
                categories: testData.deepNesting,
                renderElement: <span data-testid="custom-element">Category</span>,
                renderSlotListBefore: <div data-testid="custom-list-before">List Before</div>,
                renderSlotListAfter: <div data-testid="custom-list-after">List Before</div>,
                renderSlotListItemBefore: <div data-testid="custom-list-item-before">List Item Before</div>,
                renderSlotListItemAfter: <div data-testid="custom-list-item-after">List Item After</div>,
            });

            expect(getAllByTestId('custom-element')).toHaveLength(2);
            expect(getAllByTestId('custom-list-before')).toHaveLength(1);
            expect(getAllByTestId('custom-list-after')).toHaveLength(1);
            expect(getAllByTestId('custom-list-item-before')).toHaveLength(2);
            expect(getAllByTestId('custom-list-item-after')).toHaveLength(2);

            // Open the menu of the first root category
            await act(async () => {
                fireEvent.click(getAllByTestId('custom-element')[0]);
                await Promise.resolve();
            });

            expect(getAllByTestId('custom-element')).toHaveLength(6);
            expect(getAllByTestId('custom-list-before')).toHaveLength(3);
            expect(getAllByTestId('custom-list-after')).toHaveLength(3);
            expect(getAllByTestId('custom-list-item-before')).toHaveLength(6);
            expect(getAllByTestId('custom-list-item-after')).toHaveLength(6);
        });

        it('should use custom render functions', async () => {
            const renderElement = vi.fn((ctx) => (
                <span data-testid={`custom-element-${ctx.category.id}`}>Custom: {ctx.category.name}</span>
            ));
            const renderSlotListBefore = vi.fn((ctx) => (
                <div data-testid={`custom-list-before-${ctx.level}`}>
                    List Before: ({ctx.level}, {ctx.categories.length})
                </div>
            ));
            const renderSlotListAfter = vi.fn((ctx) => (
                <div data-testid={`custom-list-after-${ctx.level}`}>
                    List After: ({ctx.level}, {ctx.categories.length})
                </div>
            ));
            const renderSlotListItemBefore = vi.fn((ctx) => (
                <div data-testid={`custom-list-item-before-${ctx.category.id}`}>List Item Before: ({ctx.level})</div>
            ));
            const renderSlotListItemAfter = vi.fn((ctx) => (
                <div data-testid={`custom-list-item-after-${ctx.category.id}`}>List Item After: ({ctx.level})</div>
            ));

            const { getAllByTestId, getByTestId, getByText } = renderComponent({
                categories: testData.deepNesting,
                renderElement,
                renderSlotListBefore,
                renderSlotListAfter,
                renderSlotListItemBefore,
                renderSlotListItemAfter,
            });

            expect(renderElement).toHaveBeenCalledTimes(2);
            expect(renderElement).toHaveBeenNthCalledWith(1, {
                category: testData.deepNesting[0],
                index: 0,
                isFirst: true,
                isLast: false,
                isLeaf: false,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(renderElement).toHaveBeenNthCalledWith(2, {
                category: testData.deepNesting[1],
                index: 1,
                isFirst: false,
                isLast: true,
                isLeaf: false,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(getByTestId('custom-element-parent-1')).toBeInTheDocument();
            expect(getByTestId('custom-element-parent-2')).toBeInTheDocument();
            expect(getByText('Custom: Parent Category 1')).toBeInTheDocument();
            expect(getByText('Custom: Parent Category 2')).toBeInTheDocument();

            expect(renderSlotListBefore).toHaveBeenCalledTimes(1);
            expect(renderSlotListBefore).toHaveBeenCalledWith({
                categories: testData.deepNesting,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(renderSlotListAfter).toHaveBeenCalledTimes(1);
            expect(renderSlotListAfter).toHaveBeenCalledWith({
                categories: testData.deepNesting,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(getAllByTestId('custom-list-before-0')).toHaveLength(1);
            expect(getByTestId('custom-list-before-0')).toBeInTheDocument();
            expect(getAllByTestId('custom-list-after-0')).toHaveLength(1);
            expect(getByTestId('custom-list-after-0')).toBeInTheDocument();
            expect(getByText('List Before: (0, 2)')).toBeInTheDocument();
            expect(getByText('List After: (0, 2)')).toBeInTheDocument();

            expect(renderSlotListItemBefore).toHaveBeenCalledTimes(2);
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(1, {
                category: testData.deepNesting[0],
                index: 0,
                isFirst: true,
                isLast: false,
                isLeaf: false,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(2, {
                category: testData.deepNesting[1],
                index: 1,
                isFirst: false,
                isLast: true,
                isLeaf: false,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(renderSlotListItemAfter).toHaveBeenCalledTimes(2);
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(1, {
                category: testData.deepNesting[0],
                index: 0,
                isFirst: true,
                isLast: false,
                isLeaf: false,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(2, {
                category: testData.deepNesting[1],
                index: 1,
                isFirst: false,
                isLast: true,
                isLeaf: false,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(getByTestId('custom-list-item-before-parent-1')).toBeInTheDocument();
            expect(getByTestId('custom-list-item-before-parent-2')).toBeInTheDocument();

            // Open the menu of the first root category
            await act(async () => {
                fireEvent.click(getByTestId('custom-element-parent-1'));
                await Promise.resolve();
            });

            expect(renderElement).toHaveBeenCalledTimes(10);
            expect(renderElement).toHaveBeenNthCalledWith(3, {
                category: testData.deepNesting[0]?.categories?.[0],
                index: 0,
                isFirst: true,
                isLast: false,
                isLeaf: false,
                level: 1,
                parent: testData.deepNesting[0],
                path: [testData.deepNesting[0]],
            });
            expect(renderElement).toHaveBeenNthCalledWith(4, {
                category: testData.deepNesting[0]?.categories?.[0]?.categories?.[0],
                index: 0,
                isFirst: true,
                isLast: false,
                isLeaf: true,
                level: 2,
                parent: testData.deepNesting[0]?.categories?.[0],
                path: [testData.deepNesting[0], testData.deepNesting[0]?.categories?.[0]],
            });
            expect(renderElement).toHaveBeenNthCalledWith(5, {
                category: testData.deepNesting[0]?.categories?.[0]?.categories?.[1],
                index: 1,
                isFirst: false,
                isLast: true,
                isLeaf: true,
                level: 2,
                parent: testData.deepNesting[0]?.categories?.[0],
                path: [testData.deepNesting[0], testData.deepNesting[0]?.categories?.[0]],
            });
            expect(renderElement).toHaveBeenNthCalledWith(6, {
                category: testData.deepNesting[0]?.categories?.[1],
                index: 1,
                isFirst: false,
                isLast: true,
                isLeaf: true,
                level: 1,
                parent: testData.deepNesting[0],
                path: [testData.deepNesting[0]],
            });

            // The next invocations of renderElement are identical with some before --> Verify why
            // the menu structure apparently gets rendered twice
            expect(renderElement).toHaveBeenNthCalledWith(7, renderElement.mock.calls[2][0]);
            expect(renderElement).toHaveBeenNthCalledWith(8, renderElement.mock.calls[3][0]);
            expect(renderElement).toHaveBeenNthCalledWith(9, renderElement.mock.calls[4][0]);
            expect(renderElement).toHaveBeenNthCalledWith(10, renderElement.mock.calls[5][0]);

            expect(renderSlotListBefore).toHaveBeenCalledTimes(5);
            expect(renderSlotListBefore).toHaveBeenNthCalledWith(2, {
                categories: testData.deepNesting[0].categories,
                level: 1,
                parent: testData.deepNesting[0],
                path: [testData.deepNesting[0]],
            });
            expect(renderSlotListBefore).toHaveBeenNthCalledWith(3, {
                categories: testData.deepNesting[0].categories?.[0]?.categories,
                level: 2,
                parent: testData.deepNesting[0].categories?.[0],
                path: [testData.deepNesting[0], testData.deepNesting[0].categories?.[0]],
            });
            expect(renderSlotListBefore).toHaveBeenNthCalledWith(4, renderSlotListBefore.mock.calls[1][0]);
            expect(renderSlotListBefore).toHaveBeenNthCalledWith(5, renderSlotListBefore.mock.calls[2][0]);
            expect(renderSlotListAfter).toHaveBeenCalledTimes(5);
            expect(renderSlotListAfter).toHaveBeenNthCalledWith(2, renderSlotListBefore.mock.calls[1][0]);
            expect(renderSlotListAfter).toHaveBeenNthCalledWith(3, renderSlotListBefore.mock.calls[2][0]);
            expect(renderSlotListAfter).toHaveBeenNthCalledWith(4, renderSlotListBefore.mock.calls[1][0]);
            expect(renderSlotListAfter).toHaveBeenNthCalledWith(5, renderSlotListBefore.mock.calls[2][0]);

            expect(renderSlotListItemBefore).toHaveBeenCalledTimes(10);
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(3, renderElement.mock.calls[2][0]);
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(4, renderElement.mock.calls[5][0]);
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(5, renderElement.mock.calls[3][0]);
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(6, renderElement.mock.calls[4][0]);
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(7, renderElement.mock.calls[2][0]);
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(8, renderElement.mock.calls[5][0]);
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(9, renderElement.mock.calls[3][0]);
            expect(renderSlotListItemBefore).toHaveBeenNthCalledWith(10, renderElement.mock.calls[4][0]);
            expect(renderSlotListItemAfter).toHaveBeenCalledTimes(10);
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(3, renderElement.mock.calls[2][0]);
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(4, renderElement.mock.calls[5][0]);
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(5, renderElement.mock.calls[3][0]);
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(6, renderElement.mock.calls[4][0]);
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(7, renderElement.mock.calls[2][0]);
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(8, renderElement.mock.calls[5][0]);
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(9, renderElement.mock.calls[3][0]);
            expect(renderSlotListItemAfter).toHaveBeenNthCalledWith(10, renderElement.mock.calls[4][0]);
        });
    });

    describe('Props Customizations', () => {
        it('should use custom properties data', async () => {
            const propsElement = {
                'data-testid': 'custom-element',
                className: 'custom-element',
                style: { color: 'green' },
            };
            const propsViewport = {
                'data-testid': 'custom-viewport',
                className: 'custom-viewport',
                style: { color: 'transparent' },
            };
            const propsList = { 'data-testid': 'custom-list', className: 'custom-list', style: { color: 'red' } };
            const propsListItem = {
                'data-testid': 'custom-list-item',
                className: 'custom-list-item',
                style: { color: 'blue' },
            };
            const propsContent = {
                'data-testid': 'custom-content',
                className: 'custom-content',
                style: { color: 'grey' },
            };
            const propsContentContainer = {
                'data-testid': 'custom-content-container',
                className: 'custom-content-container',
                style: { color: 'black' },
            };

            const { getAllByTestId, getByTestId, queryByTestId } = renderComponent({
                categories: testData.deepNesting,
                propsElement,
                propsViewport,
                propsList,
                propsListItem,
                propsContent,
                propsContentContainer,
            });

            const elements = getAllByTestId('custom-element');
            expect(elements).toHaveLength(2);
            expect(elements[0]).toHaveClass('custom-element');
            expect(elements[0]).toHaveStyle({ color: 'rgb(0, 128, 0)' });
            expect(elements[1]).toHaveClass('custom-element');
            expect(elements[1]).toHaveStyle({ color: 'rgb(0, 128, 0)' });

            const list = getByTestId('custom-list');
            expect(list).toHaveClass('custom-list');
            expect(list).toHaveStyle({ color: 'rgb(255, 0, 0)' });

            const listItems = getAllByTestId('custom-list-item');
            expect(listItems).toHaveLength(2);
            expect(listItems[0]).toHaveClass('custom-list-item');
            expect(listItems[0]).toHaveStyle({ color: 'rgb(0, 0, 255)' });
            expect(listItems[1]).toHaveClass('custom-list-item');
            expect(listItems[1]).toHaveStyle({ color: 'rgb(0, 0, 255)' });

            // No viewport or menu content available yet
            expect(queryByTestId('custom-viewport')).toBeNull();
            expect(queryByTestId('custom-content-container')).toBeNull();
            expect(queryByTestId('custom-content')).toBeNull();

            // Open the menu of the first root category
            await act(async () => {
                fireEvent.click(getAllByTestId('custom-element')[0]);
                await Promise.resolve();
            });

            expect(getAllByTestId('custom-element')).toHaveLength(6);
            expect(getAllByTestId('custom-list')).toHaveLength(3);
            expect(getAllByTestId('custom-list-item')).toHaveLength(6);

            // Viewport and menu content available now
            const viewport = getByTestId('custom-viewport');
            expect(viewport).toHaveClass('custom-viewport');
            expect(viewport).toHaveStyle({ color: 'rgb(0, 0, 0, 0)' });

            const contentContainer = getByTestId('custom-content-container');
            expect(contentContainer).toHaveClass('custom-content-container');
            expect(contentContainer).toHaveStyle({ color: 'rgb(0, 0, 0)' });

            const content = getByTestId('custom-content');
            expect(content).toHaveClass('custom-content');
            expect(content).toHaveStyle({ color: 'rgb(128, 128, 128)' });
        });

        it('should use custom properties functions', async () => {
            const propsElement = vi.fn((ctx) => ({
                'data-testid': `custom-element-${ctx.category.id}`,
                className: `custom-element-${ctx.category.id}`,
                style: { color: 'green' },
            }));
            const propsList = vi.fn((ctx) => ({
                'data-testid': `custom-list-${ctx.level}`,
                className: `custom-list-${ctx.level}`,
                style: { color: 'red' },
            }));
            const propsListItem = vi.fn((ctx) => ({
                'data-testid': `custom-list-item-${ctx.category.id}`,
                className: `custom-list-item-${ctx.level}`,
                style: { color: 'blue' },
            }));

            const { getByTestId } = renderComponent({
                categories: testData.deepNesting,
                propsElement,
                propsList,
                propsListItem,
            });

            expect(propsElement).toHaveBeenCalledTimes(2);
            expect(propsElement).toHaveBeenNthCalledWith(1, {
                category: testData.deepNesting[0],
                index: 0,
                isFirst: true,
                isLast: false,
                isLeaf: false,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(propsElement).toHaveBeenNthCalledWith(2, {
                category: testData.deepNesting[1],
                index: 1,
                isFirst: false,
                isLast: true,
                isLeaf: false,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(propsList).toHaveBeenCalledTimes(1);
            expect(propsList).toHaveBeenCalledWith({
                categories: testData.deepNesting,
                level: 0,
                parent: undefined,
                path: [],
            });
            expect(propsListItem).toHaveBeenCalledTimes(2);
            expect(propsListItem).toHaveBeenNthCalledWith(1, propsElement.mock.calls[0][0]);
            expect(propsListItem).toHaveBeenNthCalledWith(2, propsElement.mock.calls[1][0]);

            expect(getByTestId('custom-element-parent-1')).toHaveClass('custom-element-parent-1');
            expect(getByTestId('custom-element-parent-1')).toHaveStyle({ color: 'rgb(0, 128, 0)' });
            expect(getByTestId('custom-element-parent-2')).toHaveClass('custom-element-parent-2');
            expect(getByTestId('custom-element-parent-2')).toHaveStyle({ color: 'rgb(0, 128, 0)' });
            expect(getByTestId('custom-list-0')).toHaveClass('custom-list-0');
            expect(getByTestId('custom-list-0')).toHaveStyle({ color: 'rgb(255, 0, 0)' });
            expect(getByTestId('custom-list-item-parent-1')).toHaveClass('custom-list-item-0');
            expect(getByTestId('custom-list-item-parent-1')).toHaveStyle({ color: 'rgb(0, 0, 255)' });
            expect(getByTestId('custom-list-item-parent-2')).toHaveClass('custom-list-item-0');
            expect(getByTestId('custom-list-item-parent-2')).toHaveStyle({ color: 'rgb(0, 0, 255)' });

            // Open the menu of the first root category
            await act(async () => {
                fireEvent.click(getByTestId('custom-element-parent-1'));
                await Promise.resolve();
            });

            expect(propsElement).toHaveBeenCalledTimes(10);
            expect(propsElement).toHaveBeenNthCalledWith(3, {
                category: testData.deepNesting[0].categories?.[0],
                index: 0,
                isFirst: true,
                isLast: false,
                isLeaf: false,
                level: 1,
                parent: testData.deepNesting[0],
                path: [testData.deepNesting[0]],
            });
            expect(propsElement).toHaveBeenNthCalledWith(4, {
                category: testData.deepNesting[0].categories?.[1],
                index: 1,
                isFirst: false,
                isLast: true,
                isLeaf: true,
                level: 1,
                parent: testData.deepNesting[0],
                path: [testData.deepNesting[0]],
            });
            expect(propsElement).toHaveBeenNthCalledWith(5, {
                category: testData.deepNesting[0]?.categories?.[0]?.categories?.[0],
                index: 0,
                isFirst: true,
                isLast: false,
                isLeaf: true,
                level: 2,
                parent: testData.deepNesting[0]?.categories?.[0],
                path: [testData.deepNesting[0], testData.deepNesting[0]?.categories?.[0]],
            });
            expect(propsElement).toHaveBeenNthCalledWith(6, {
                category: testData.deepNesting[0]?.categories?.[0]?.categories?.[1],
                index: 1,
                isFirst: false,
                isLast: true,
                isLeaf: true,
                level: 2,
                parent: testData.deepNesting[0]?.categories?.[0],
                path: [testData.deepNesting[0], testData.deepNesting[0]?.categories?.[0]],
            });

            // The next invocations of renderElement are identical with some before --> Verify why
            // the menu structure apparently gets rendered twice
            expect(propsElement).toHaveBeenNthCalledWith(7, propsElement.mock.calls[2][0]);
            expect(propsElement).toHaveBeenNthCalledWith(8, propsElement.mock.calls[3][0]);
            expect(propsElement).toHaveBeenNthCalledWith(9, propsElement.mock.calls[4][0]);
            expect(propsElement).toHaveBeenNthCalledWith(10, propsElement.mock.calls[5][0]);

            expect(propsList).toHaveBeenCalledTimes(5);
            expect(propsList).toHaveBeenNthCalledWith(2, {
                categories: testData.deepNesting[0].categories,
                level: 1,
                parent: testData.deepNesting[0],
                path: [testData.deepNesting[0]],
            });
            expect(propsList).toHaveBeenNthCalledWith(3, {
                categories: testData.deepNesting[0].categories?.[0]?.categories,
                level: 2,
                parent: testData.deepNesting[0].categories?.[0],
                path: [testData.deepNesting[0], testData.deepNesting[0].categories?.[0]],
            });
            expect(propsList).toHaveBeenNthCalledWith(4, propsList.mock.calls[1][0]);
            expect(propsList).toHaveBeenNthCalledWith(5, propsList.mock.calls[2][0]);

            expect(propsListItem).toHaveBeenCalledTimes(10);
            expect(propsListItem).toHaveBeenNthCalledWith(3, propsElement.mock.calls[2][0]);
            expect(propsListItem).toHaveBeenNthCalledWith(4, propsElement.mock.calls[3][0]);
            expect(propsListItem).toHaveBeenNthCalledWith(5, propsElement.mock.calls[4][0]);
            expect(propsListItem).toHaveBeenNthCalledWith(6, propsElement.mock.calls[5][0]);
            expect(propsListItem).toHaveBeenNthCalledWith(7, propsElement.mock.calls[2][0]);
            expect(propsListItem).toHaveBeenNthCalledWith(8, propsElement.mock.calls[3][0]);
            expect(propsListItem).toHaveBeenNthCalledWith(9, propsElement.mock.calls[4][0]);
            expect(propsListItem).toHaveBeenNthCalledWith(10, propsElement.mock.calls[5][0]);
        });
    });
});
