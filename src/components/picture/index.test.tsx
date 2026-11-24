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
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Picture } from './index';

const preloadMock = vi.hoisted(() => vi.fn());
const isServerMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('react-dom', async () => ({ ...(await vi.importActual<object>('react-dom')), preload: preloadMock }));
vi.mock('@/lib/utils', async () => ({ ...(await vi.importActual<object>('@/lib/utils')), isServer: isServerMock }));

describe('Picture', () => {
    beforeEach(() => {
        preloadMock.mockClear();
        isServerMock.mockReturnValue(true);
    });

    test('renders sources in the given order ahead of the image', () => {
        const { container } = render(
            <Picture
                sources={[
                    { srcSet: '/mobile.webp', media: '(max-width: 10px)' },
                    { srcSet: '/desktop.webp', media: '(min-width: 11px)', type: 'image/webp', sizes: '100vw' },
                ]}>
                <img src="/fallback.jpg" alt="hero" />
            </Picture>
        );

        const children = [...container.querySelectorAll('picture > *')];
        expect(children.map((node) => node.tagName)).toEqual(['SOURCE', 'SOURCE', 'IMG']);
        expect(children[0]).toHaveAttribute('srcset', '/mobile.webp');
        expect(children[1]).toHaveAttribute('type', 'image/webp');
        expect(children[1]).toHaveAttribute('sizes', '100vw');
    });

    test('omits media and type attributes when absent', () => {
        const { container } = render(
            <Picture sources={[{ srcSet: '/a.webp' }]}>
                <img src="/a.jpg" alt="" />
            </Picture>
        );

        const source = container.querySelector('source');
        expect(source).not.toHaveAttribute('media');
        expect(source).not.toHaveAttribute('type');
    });

    test('renders the projected image component as is', () => {
        const Custom = ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
            <img data-custom="yes" alt={alt} {...props} />
        );
        const { container } = render(
            <Picture sources={[{ srcSet: '/a.webp' }]}>
                <Custom src="/a.jpg" alt="alt text" className="w-full" />
            </Picture>
        );

        const img = container.querySelector('picture > img');
        expect(img).toHaveAttribute('data-custom', 'yes');
        expect(img).toHaveAttribute('alt', 'alt text');
        expect(img).toHaveAttribute('class', 'w-full');
    });

    test('renders only the image when there are no sources', () => {
        const { container } = render(
            <Picture sources={[]}>
                <img src="/a.jpg" alt="a" />
            </Picture>
        );

        expect(container.querySelector('picture')).toBeNull();
        expect(container.querySelector('img')).toHaveAttribute('src', '/a.jpg');
    });

    describe('preloading', () => {
        const links = [
            { href: '/mobile.webp', media: 'not all and (min-width: 48rem)' },
            {
                href: '/d.webp',
                srcSet: '/d.webp 640w',
                sizes: '100vw',
                type: 'image/webp',
                media: '(min-width: 48rem)',
            },
        ];

        test('preloads every link at high priority during SSR', () => {
            render(
                <Picture sources={[]} preloadLinks={links}>
                    <img src="/a.jpg" alt="" />
                </Picture>
            );

            expect(preloadMock).toHaveBeenCalledTimes(2);
            expect(preloadMock).toHaveBeenCalledWith('/mobile.webp', {
                as: 'image',
                fetchPriority: 'high',
                imageSrcSet: undefined,
                imageSizes: undefined,
                type: undefined,
                media: 'not all and (min-width: 48rem)',
            });
            expect(preloadMock).toHaveBeenCalledWith('/d.webp', {
                as: 'image',
                fetchPriority: 'high',
                imageSrcSet: '/d.webp 640w',
                imageSizes: '100vw',
                type: 'image/webp',
                media: '(min-width: 48rem)',
            });
        });

        test('does not preload without links or outside SSR', () => {
            render(
                <Picture sources={[]}>
                    <img src="/a.jpg" alt="" />
                </Picture>
            );
            isServerMock.mockReturnValue(false);
            render(
                <Picture sources={[]} preloadLinks={links}>
                    <img src="/a.jpg" alt="" />
                </Picture>
            );

            expect(preloadMock).not.toHaveBeenCalled();
        });
    });
});
