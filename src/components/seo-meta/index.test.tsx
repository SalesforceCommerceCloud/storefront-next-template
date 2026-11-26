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
import i18next from 'i18next';
import { describe, test, expect } from 'vitest';
import { SeoMeta, DEFAULT_SITE_NAME_KEY } from '.';

function getMeta(name: string) {
    return document.head.querySelector(`meta[name="${name}"]`);
}

function getMetaProperty(property: string) {
    return document.head.querySelector(`meta[property="${property}"]`);
}

// Site name comes from the active i18n bundle (common.defaultSiteName), so
// tests resolve it the same way SeoMeta does instead of hardcoding a value.
// Resolved lazily inside each test — i18n is initialized by vitest setup, which
// hasn't run by the time module-level top-level code evaluates.
const siteName = () => i18next.t(DEFAULT_SITE_NAME_KEY, { ns: 'common' });

describe('SeoMeta', () => {
    describe('title', () => {
        test('renders title with site name suffix', () => {
            render(<SeoMeta title="Classic Jacket" />);
            expect(document.title).toBe(`Classic Jacket | ${siteName()}`);
        });

        test('renders raw title without suffix when rawTitle is set', () => {
            render(<SeoMeta title="Custom Page Title" rawTitle />);
            expect(document.title).toBe('Custom Page Title');
        });

        test('renders site name as fallback when no title is provided', () => {
            render(<SeoMeta />);
            expect(document.title).toBe(siteName());
        });
    });

    describe('description', () => {
        test('renders meta description', () => {
            render(<SeoMeta description="A premium leather jacket." />);
            const meta = getMeta('description');
            expect(meta).toBeInTheDocument();
            expect(meta).toHaveAttribute('content', 'A premium leather jacket.');
        });

        test('does not render meta description when not provided', () => {
            render(<SeoMeta title="Test" />);
            expect(getMeta('description')).not.toBeInTheDocument();
        });
    });

    describe('noIndex', () => {
        test('renders robots noindex when set', () => {
            render(<SeoMeta title="Secret Page" noIndex />);
            const meta = getMeta('robots');
            expect(meta).toBeInTheDocument();
            expect(meta).toHaveAttribute('content', 'noindex');
        });

        test('renders robots noindex,nofollow when noFollow is also set', () => {
            render(<SeoMeta title="Cart" noIndex noFollow />);
            expect(getMeta('robots')).toHaveAttribute('content', 'noindex,nofollow');
        });

        test('ignores noFollow without noIndex', () => {
            render(<SeoMeta title="Page" noFollow />);
            expect(getMeta('robots')).not.toBeInTheDocument();
        });

        test('does not render robots meta when noIndex is not set', () => {
            render(<SeoMeta title="Public Page" />);
            expect(getMeta('robots')).not.toBeInTheDocument();
        });
    });

    describe('siteName', () => {
        test('uses custom site name in title suffix', () => {
            render(<SeoMeta title="Products" siteName="My Store" />);
            expect(document.title).toBe('Products | My Store');
        });

        test('uses custom site name as fallback when no title provided', () => {
            render(<SeoMeta siteName="My Store" />);
            expect(document.title).toBe('My Store');
        });
    });

    describe('X (formerly Twitter) card', () => {
        test('renders twitter card tags', () => {
            render(
                <SeoMeta
                    title="Jacket"
                    description="Nice jacket"
                    twitter={{ cardType: 'summary_large_image', image: 'https://img.example.com/jacket.jpg' }}
                />
            );

            expect(getMeta('twitter:card')).toHaveAttribute('content', 'summary_large_image');
            expect(getMeta('twitter:title')).toHaveAttribute('content', 'Jacket');
            expect(getMeta('twitter:description')).toHaveAttribute('content', 'Nice jacket');
            expect(getMeta('twitter:image')).toHaveAttribute('content', 'https://img.example.com/jacket.jpg');
        });

        test('defaults twitter card type to summary', () => {
            render(<SeoMeta title="Page" twitter={{}} />);
            expect(getMeta('twitter:card')).toHaveAttribute('content', 'summary');
        });

        test('omits twitter image when not provided', () => {
            render(<SeoMeta title="Page" twitter={{}} />);
            expect(getMeta('twitter:image')).not.toBeInTheDocument();
        });

        test('does not render twitter tags when neither twitter nor openGraph is provided', () => {
            render(<SeoMeta title="Page" />);
            expect(getMeta('twitter:card')).not.toBeInTheDocument();
            expect(getMeta('twitter:title')).not.toBeInTheDocument();
        });
    });

    describe('open graph', () => {
        test('renders OG tags with all properties', () => {
            render(
                <SeoMeta
                    title="Leather Jacket"
                    description="Premium leather jacket with a tailored fit."
                    openGraph={{
                        type: 'product',
                        url: 'https://store.com/product/jacket',
                        image: 'https://img.example.com/jacket.jpg',
                    }}
                />
            );

            expect(getMetaProperty('og:title')).toHaveAttribute('content', 'Leather Jacket');
            expect(getMetaProperty('og:description')).toHaveAttribute(
                'content',
                'Premium leather jacket with a tailored fit.'
            );
            expect(getMetaProperty('og:type')).toHaveAttribute('content', 'product');
            expect(getMetaProperty('og:url')).toHaveAttribute('content', 'https://store.com/product/jacket');
            expect(getMetaProperty('og:image')).toHaveAttribute('content', 'https://img.example.com/jacket.jpg');
            expect(getMetaProperty('og:site_name')).toHaveAttribute('content', siteName());
        });

        test('defaults og:type to website when not specified', () => {
            render(<SeoMeta title="Home" openGraph={{}} />);
            expect(getMetaProperty('og:type')).toHaveAttribute('content', 'website');
        });

        test('omits og:url when not provided', () => {
            render(<SeoMeta title="Page" openGraph={{ type: 'article' }} />);
            expect(getMetaProperty('og:url')).not.toBeInTheDocument();
        });

        test('omits og:image when not provided', () => {
            render(<SeoMeta title="Page" openGraph={{}} />);
            expect(getMetaProperty('og:image')).not.toBeInTheDocument();
        });

        test('omits og:description when description is not provided', () => {
            render(<SeoMeta title="Page" openGraph={{}} />);
            expect(getMetaProperty('og:description')).not.toBeInTheDocument();
        });

        test('uses site name as og:title fallback when title is not provided', () => {
            render(<SeoMeta openGraph={{}} />);
            expect(getMetaProperty('og:title')).toHaveAttribute('content', siteName());
        });

        test('uses custom site name for og:site_name', () => {
            render(<SeoMeta title="Page" siteName="My Brand" openGraph={{}} />);
            expect(getMetaProperty('og:site_name')).toHaveAttribute('content', 'My Brand');
        });

        test('does not render OG tags when openGraph is not provided', () => {
            render(<SeoMeta title="Page" />);
            expect(getMetaProperty('og:title')).not.toBeInTheDocument();
            expect(getMetaProperty('og:type')).not.toBeInTheDocument();
            expect(getMetaProperty('og:site_name')).not.toBeInTheDocument();
        });
    });

    describe('X Card auto-derivation from openGraph', () => {
        test('auto-derives twitter tags from openGraph when twitter is not provided', () => {
            render(
                <SeoMeta
                    title="Jacket"
                    description="Nice jacket"
                    openGraph={{
                        type: 'product',
                        image: 'https://img.example.com/jacket.jpg',
                    }}
                />
            );

            expect(getMeta('twitter:card')).toHaveAttribute('content', 'summary_large_image');
            expect(getMeta('twitter:title')).toHaveAttribute('content', 'Jacket');
            expect(getMeta('twitter:description')).toHaveAttribute('content', 'Nice jacket');
            expect(getMeta('twitter:image')).toHaveAttribute('content', 'https://img.example.com/jacket.jpg');
        });

        test('defaults to summary card when openGraph has no image', () => {
            render(<SeoMeta title="Page" openGraph={{}} />);
            expect(getMeta('twitter:card')).toHaveAttribute('content', 'summary');
            expect(getMeta('twitter:image')).not.toBeInTheDocument();
        });

        test('explicit twitter prop overrides auto-derived values while OG tags render independently', () => {
            render(
                <SeoMeta
                    title="Jacket"
                    description="Nice jacket"
                    openGraph={{ image: 'https://img.example.com/og.jpg' }}
                    twitter={{ cardType: 'summary', image: 'https://img.example.com/twitter.jpg' }}
                />
            );

            expect(getMeta('twitter:card')).toHaveAttribute('content', 'summary');
            expect(getMeta('twitter:image')).toHaveAttribute('content', 'https://img.example.com/twitter.jpg');

            expect(getMetaProperty('og:image')).toHaveAttribute('content', 'https://img.example.com/og.jpg');
            expect(getMetaProperty('og:title')).toHaveAttribute('content', 'Jacket');
        });
    });
});
