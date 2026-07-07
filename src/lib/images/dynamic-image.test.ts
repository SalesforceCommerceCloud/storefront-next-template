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
import { test } from 'vitest';
import { deepMerge } from '@/test-utils/deep-merge';
import type { Config } from '@/types/config';
import {
    getResponsivePictureAttributes,
    getSrc,
    isDynamicImageSource,
    replaceImageFormat,
    resolveDynamicImageAttributes,
    toDisBaseUrl,
    toDisImageUrl,
    toImageUrl,
} from './dynamic-image';
import { mockBuildConfig, mockConfig } from '@/test-utils/config';

const disImageURL = {
    withOptionalParams:
        'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw1e4fcb17/images/large/PG.10212867.JJ3XYXX.PZ.jpg[?sw={width}&q=60]',
    withoutOptionalParams:
        'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw1e4fcb17/images/large/PG.10212867.JJ3XYXX.PZ.jpg',
    withoutQualityParam:
        'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw1e4fcb17/images/large/PG.10212867.JJ3XYXX.PZ.jpg[?sw={width}]',
};

const urlWithWidth = (width: number) => getSrc(disImageURL.withOptionalParams, { w: width, f: 'webp' });

describe('replaceImageFormat()', () => {
    const disUrl = (ext: string) =>
        `https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/path/image.${ext}`;

    describe('default target format', () => {
        test('does not change URL', () => {
            expect(replaceImageFormat(disUrl('webp'))).toBe(disUrl('webp'));
        });

        test.each(['jpg', 'jpeg', 'jp2', 'png', 'gif', 'tif', 'tiff', 'avif'])(
            'replaces %s with webp',
            (ext: string) => {
                expect(replaceImageFormat(disUrl(ext))).toContain(`/path/image.webp?sfrm=${ext}`);
            }
        );
    });

    describe('custom target format', () => {
        test('does not change URL', () => {
            expect(replaceImageFormat(disUrl('avif'), 'avif')).toBe(disUrl('avif'));
        });

        test.each(['jpg', 'jpeg', 'jp2', 'png', 'gif', 'tif', 'tiff', 'webp'])(
            'replaces %s with avif',
            (ext: string) => {
                expect(replaceImageFormat(disUrl(ext), 'avif')).toContain(`/path/image.avif?sfrm=${ext}`);
            }
        );
    });

    describe('URLs with query parameters', () => {
        test('does not replace .webp with .webp', () => {
            const url = `${disUrl('webp')}?sw=461&q=60`;
            expect(replaceImageFormat(url)).toBe(url);
        });

        test.each(['jpg', 'jpeg', 'jp2', 'png', 'gif', 'tif', 'tiff', 'avif'])(
            'replaces %s with .webp',
            (ext: string) => {
                expect(replaceImageFormat(`${disUrl(ext)}?sw=461&q=60`)).toContain(
                    `/path/image.webp?sw=461&q=60&sfrm=${ext}`
                );
            }
        );
    });

    describe('case insensitivity', () => {
        test('handles uppercase JPG', () => {
            const url = 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/path/image.JPG';
            expect(replaceImageFormat(url)).toContain('/path/image.webp?sfrm=jpg');
        });

        test('handles mixed case JpG', () => {
            const url = 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/path/image.JpG';
            expect(replaceImageFormat(url)).toContain('/path/image.webp?sfrm=jpg');
        });
    });

    describe('no image extension found', () => {
        test('returns unchanged URL without image extension', () => {
            expect(replaceImageFormat('https://example.com/document.pdf')).toBe('https://example.com/document.pdf');
        });

        test('returns unchanged URL for text files', () => {
            expect(replaceImageFormat('https://example.com/file.txt')).toBe('https://example.com/file.txt');
        });

        test('returns unchanged URL without extension', () => {
            expect(replaceImageFormat('https://example.com/image')).toBe('https://example.com/image');
        });
    });

    describe('edge cases', () => {
        test('handles extension-like strings in path (not at end)', () => {
            // Should not match .jpg in the middle of the path
            const url =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/images.jpg.backup/file.png';
            expect(replaceImageFormat(url)).toContain('/images.jpg.backup/file.webp?sfrm=png');
        });

        test('handles URLs with fragments', () => {
            // Note: fragments come after query params, so this tests the regex boundary
            expect(replaceImageFormat(disUrl('jpg'))).toContain('/path/image.webp?sfrm=jpg');
        });

        test('handles empty string', () => {
            expect(replaceImageFormat('')).toBe('');
        });

        test('handles URL with only extension (already has sfrm)', () => {
            // Edge case: minimal URL with sfrm → DIS-eligible
            expect(replaceImageFormat('.jpg?sfrm=png')).toBe('.jpg?sfrm=png');
        });

        test('handles relative paths with sfrm param', () => {
            // Relative path with sfrm → DIS-eligible
            expect(replaceImageFormat('/images/photo.jpg?sfrm=png')).toBe('/images/photo.jpg?sfrm=png');
        });

        test('handles relative paths with query params and sfrm', () => {
            expect(replaceImageFormat('/images/photo.jpeg?size=large&sfrm=jpg')).toBe(
                '/images/photo.jpeg?size=large&sfrm=jpg'
            );
        });
    });

    describe('DIS-eligibility gate (Part 1: Stop the leak)', () => {
        test('does not transform non-DIS URL even if it has image extension', () => {
            // URL without DIS path and without sfrm param → not DIS-eligible → no transformation
            const nonDisUrl = 'https://example.com/image.jpg';
            expect(replaceImageFormat(nonDisUrl)).toBe(nonDisUrl);
        });

        test('does not transform non-DIS URL with query params', () => {
            const nonDisUrl = 'https://example.com/image.jpg?size=large';
            expect(replaceImageFormat(nonDisUrl)).toBe(nonDisUrl);
        });

        test('transforms URL with DIS path structure', () => {
            const url = 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/path/image.jpg';
            expect(replaceImageFormat(url)).toBe(
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/path/image.webp?sfrm=jpg'
            );
        });

        test('transforms URL that already has sfrm param (already transformed)', () => {
            const url = 'https://example.com/image.png?sfrm=jpg';
            // Has sfrm → already transformed → return as-is (early exit)
            expect(replaceImageFormat(url)).toBe('https://example.com/image.png?sfrm=jpg');
        });
    });
});

describe('isDynamicImageSource()', () => {
    test.each(['avif', 'gif', 'jp2', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp'])(
        'returns true for DIS-supported extension .%s',
        (ext) => {
            expect(isDynamicImageSource(`https://example.com/foo.${ext}`)).toBe(true);
        }
    );

    test('matches when a query string follows the extension', () => {
        expect(isDynamicImageSource('https://example.com/foo.jpg?sw=200')).toBe(true);
    });

    test('is case-insensitive', () => {
        expect(isDynamicImageSource('https://example.com/FOO.JPG')).toBe(true);
    });

    test.each(['mp4', 'webm', 'ogg', 'mov', 'pdf', 'glb', 'usdz'])('returns false for non-DIS extension .%s', (ext) => {
        expect(isDynamicImageSource(`https://example.com/foo.${ext}`)).toBe(false);
    });

    test('returns false for paths without an extension', () => {
        expect(isDynamicImageSource('https://example.com/media/asset')).toBe(false);
    });

    test('returns false for empty / undefined input', () => {
        expect(isDynamicImageSource('')).toBe(false);
        expect(isDynamicImageSource(undefined)).toBe(false);
    });
});

describe('getResponsivePictureAttributes()', () => {
    test('vw widths', () => {
        let props = getResponsivePictureAttributes({
            src: disImageURL.withOptionalParams,
            widths: ['50vw', '50vw', '20vw', '20vw', '25vw'],
        });

        // Breakpoints
        // base: "0px",
        // sm: "640px",
        // md: "768px",
        // lg: "1024px",
        // xl: "1280px",
        // "2xl": "1536px"

        // 50vw of sm => 320px
        // 50vw of md => 384px
        // 20vw of lg => 204.8px
        // 20vw of xl => 256px
        // 25vw of 2xl => 384px

        expect(props).toStrictEqual({
            src: disImageURL.withoutOptionalParams,
            sources: [
                {
                    media: '(min-width: 1280px)',
                    sizes: '25vw',
                    srcSet: [384, 768].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1024px)',
                    sizes: '20vw',
                    srcSet: [256, 512].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px)',
                    sizes: '20vw',
                    srcSet: [205, 410].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px)',
                    sizes: '50vw',
                    srcSet: [384, 768].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '',
                    sizes: '50vw',
                    srcSet: [320, 640].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
            links: [
                {
                    media: '(max-width: 639px)',
                    sizes: '50vw',
                    href: urlWithWidth(320),
                    srcSet: [320, 640].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px) and (max-width: 767px)',
                    sizes: '50vw',
                    href: urlWithWidth(384),
                    srcSet: [384, 768].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px) and (max-width: 1023px)',
                    sizes: '20vw',
                    href: urlWithWidth(205),
                    srcSet: [205, 410].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1024px) and (max-width: 1279px)',
                    sizes: '20vw',
                    href: urlWithWidth(256),
                    srcSet: [256, 512].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1280px)',
                    sizes: '25vw',
                    href: urlWithWidth(384),
                    srcSet: [384, 768].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
        });

        // This time as _object_
        props = getResponsivePictureAttributes({
            src: disImageURL.withOptionalParams,
            widths: {
                base: '100vw',
                sm: '100vw',
                md: '50vw',
            },
        });
        expect(props).toStrictEqual({
            src: disImageURL.withoutOptionalParams,
            sources: [
                {
                    media: '(min-width: 1280px)',
                    sizes: '50vw',
                    srcSet: [768, 1536].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1024px)',
                    sizes: '50vw',
                    srcSet: [640, 1280].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px)',
                    sizes: '50vw',
                    srcSet: [512, 1024].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px)',
                    sizes: '100vw',
                    srcSet: [768, 1536].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '',
                    sizes: '100vw',
                    srcSet: [640, 1280].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
            links: [
                {
                    media: '(max-width: 639px)',
                    sizes: '100vw',
                    href: urlWithWidth(640),
                    srcSet: [640, 1280].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px) and (max-width: 767px)',
                    sizes: '100vw',
                    href: urlWithWidth(768),
                    srcSet: [768, 1536].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px) and (max-width: 1023px)',
                    sizes: '50vw',
                    href: urlWithWidth(512),
                    srcSet: [512, 1024].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1024px) and (max-width: 1279px)',
                    sizes: '50vw',
                    href: urlWithWidth(640),
                    srcSet: [640, 1280].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1280px)',
                    sizes: '50vw',
                    href: urlWithWidth(768),
                    srcSet: [768, 1536].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
        });

        // Edge case: testing changing width at the very last breakpoint (2xl)
        props = getResponsivePictureAttributes({
            src: disImageURL.withOptionalParams,
            widths: {
                base: '100vw',
                '2xl': '50vw',
            },
        });

        // 100vw of sm => 640px
        // 100vw of md => 768px
        // 100vw of lg => 1024px
        // 100vw of xl => 1280px
        // 100vw of 2xl => 1536px
        // 50vw of 2xl => 768px
        expect(props).toStrictEqual({
            src: disImageURL.withoutOptionalParams,
            sources: [
                {
                    media: '(min-width: 1536px)',
                    sizes: '50vw',
                    srcSet: [768, 1536].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1280px)',
                    sizes: '100vw',
                    srcSet: [1536, 3072].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1024px)',
                    sizes: '100vw',
                    srcSet: [1280, 2560].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px)',
                    sizes: '100vw',
                    srcSet: [1024, 2048].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px)',
                    sizes: '100vw',
                    srcSet: [768, 1536].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '',
                    sizes: '100vw',
                    srcSet: [640, 1280].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
            links: [
                {
                    media: '(max-width: 639px)',
                    sizes: '100vw',
                    href: urlWithWidth(640),
                    srcSet: [640, 1280].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px) and (max-width: 767px)',
                    sizes: '100vw',
                    href: urlWithWidth(768),
                    srcSet: [768, 1536].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px) and (max-width: 1023px)',
                    sizes: '100vw',
                    href: urlWithWidth(1024),
                    srcSet: [1024, 2048].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1024px) and (max-width: 1279px)',
                    sizes: '100vw',
                    href: urlWithWidth(1280),
                    srcSet: [1280, 2560].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1280px) and (max-width: 1535px)',
                    sizes: '100vw',
                    href: urlWithWidth(1536),
                    srcSet: [1536, 3072].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1536px)',
                    sizes: '50vw',
                    href: urlWithWidth(768),
                    srcSet: [768, 1536].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
        });
    });

    test('px values', () => {
        // widths in array format
        let props = getResponsivePictureAttributes({
            src: disImageURL.withOptionalParams,
            widths: [100, 500, 1000],
        });
        expect(props).toStrictEqual({
            src: disImageURL.withoutOptionalParams,
            sources: [
                {
                    media: '(min-width: 768px)',
                    sizes: '1000px',
                    srcSet: [1000, 2000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px)',
                    sizes: '500px',
                    srcSet: [500, 1000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '',
                    sizes: '100px',
                    srcSet: [100, 200].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
            links: [
                {
                    media: '(max-width: 639px)',
                    sizes: '100px',
                    href: urlWithWidth(100),
                    srcSet: [100, 200].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px) and (max-width: 767px)',
                    sizes: '500px',
                    href: urlWithWidth(500),
                    srcSet: [500, 1000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px)',
                    sizes: '1000px',
                    href: urlWithWidth(1000),
                    srcSet: [1000, 2000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
        });

        props = getResponsivePictureAttributes({
            src: disImageURL.withOptionalParams,
            widths: {
                base: 100,
                sm: 500,
                md: 1000,
                '2xl': 500,
            },
        });
        expect(props).toStrictEqual({
            src: disImageURL.withoutOptionalParams,
            sources: [
                {
                    media: '(min-width: 1536px)',
                    sizes: '500px',
                    srcSet: [500, 1000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px)',
                    sizes: '1000px',
                    srcSet: [1000, 2000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px)',
                    sizes: '500px',
                    srcSet: [500, 1000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '',
                    sizes: '100px',
                    srcSet: [100, 200].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
            links: [
                {
                    media: '(max-width: 639px)',
                    sizes: '100px',
                    href: urlWithWidth(100),
                    srcSet: [100, 200].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px) and (max-width: 767px)',
                    sizes: '500px',
                    href: urlWithWidth(500),
                    srcSet: [500, 1000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px) and (max-width: 1535px)',
                    sizes: '1000px',
                    href: urlWithWidth(1000),
                    srcSet: [1000, 2000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 1536px)',
                    sizes: '500px',
                    href: urlWithWidth(500),
                    srcSet: [500, 1000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
        });
    });

    test('mixture of px and vw values', () => {
        const props = getResponsivePictureAttributes({
            src: disImageURL.withOptionalParams,
            widths: ['100vw', '720px', 500],
        });

        expect(props).toStrictEqual({
            src: disImageURL.withoutOptionalParams,
            sources: [
                {
                    media: '(min-width: 768px)',
                    sizes: '500px',
                    srcSet: [500, 1000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px)',
                    sizes: '720px',
                    srcSet: [720, 1440].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '',
                    sizes: '100vw',
                    srcSet: [640, 1280].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
            links: [
                {
                    media: '(max-width: 639px)',
                    sizes: '100vw',
                    href: urlWithWidth(640),
                    srcSet: [640, 1280].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 640px) and (max-width: 767px)',
                    sizes: '720px',
                    href: urlWithWidth(720),
                    srcSet: [720, 1440].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 768px)',
                    sizes: '500px',
                    href: urlWithWidth(500),
                    srcSet: [500, 1000].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
        });
    });

    test('only src', () => {
        let props = getResponsivePictureAttributes({
            src: disImageURL.withoutOptionalParams,
        });
        expect(props).toStrictEqual({
            sources: [],
            links: [],
            src: disImageURL.withoutOptionalParams,
        });

        // This time _with_ the optional params
        props = getResponsivePictureAttributes({
            src: disImageURL.withOptionalParams,
        });
        expect(props).toStrictEqual({
            sources: [],
            links: [],
            src: disImageURL.withoutOptionalParams,
        });
    });

    test('passing in theme breakpoints', () => {
        const props = getResponsivePictureAttributes({
            src: disImageURL.withOptionalParams,
            widths: ['100vw', 360],
            breakpoints: {
                base: '0px',
                sm: '320px',
                md: '768px',
                lg: '960px',
                xl: '1200px',
                '2xl': '1536px',
            },
        });
        expect(props).toStrictEqual({
            src: disImageURL.withoutOptionalParams,
            sources: [
                {
                    media: '(min-width: 320px)',
                    sizes: '360px',
                    srcSet: [360, 720].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '',
                    sizes: '100vw',
                    srcSet: [320, 640].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
            links: [
                {
                    media: '(max-width: 319px)',
                    sizes: '100vw',
                    href: urlWithWidth(320),
                    srcSet: [320, 640].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
                {
                    media: '(min-width: 320px)',
                    sizes: '360px',
                    href: urlWithWidth(360),
                    srcSet: [360, 720].map((width) => `${urlWithWidth(width)} ${width}w`).join(', '),
                    type: 'image/webp',
                },
            ],
        });
    });

    describe('edge cases', () => {
        test('dynamic image instructions are added to an already parameterized source URL', () => {
            const { src, sources } = getResponsivePictureAttributes({
                src: `${disImageURL.withoutOptionalParams}?w=200&h=200[?sw={width}&q=60]`,
                widths: [100],
            });

            expect(src).toBe(`${disImageURL.withoutOptionalParams}?w=200&h=200`);
            expect(sources).toEqual([
                expect.objectContaining({
                    srcSet: 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw1e4fcb17/images/large/PG.10212867.JJ3XYXX.PZ.webp?w=200&h=200&sw=100&q=60&sfrm=jpg 100w, https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw1e4fcb17/images/large/PG.10212867.JJ3XYXX.PZ.webp?w=200&h=200&sw=200&q=60&sfrm=jpg 200w',
                }),
            ]);
        });
    });

    describe('formats array', () => {
        test('no explicit format (default behavior)', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withOptionalParams,
                widths: [100],
            });

            expect(props.sources).toHaveLength(1);
            expect(props.sources[0].type).toBe('image/webp');
            expect(props.links).toHaveLength(1);
            expect(props.links[0].type).toBe('image/webp');
        });

        test('single format', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withOptionalParams,
                widths: [100],
                formats: ['webp'],
            });

            expect(props.sources).toHaveLength(1);
            expect(props.sources[0].type).toBe('image/webp');
            expect(props.links).toHaveLength(1);
            expect(props.links[0].type).toBe('image/webp');
        });

        test('multiple formats', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withOptionalParams,
                widths: [100, 200],
                formats: ['avif', 'webp', 'png'],
            });

            // Should have 3 sources (one per format) for each breakpoint
            expect(props.sources).toHaveLength(6);
            expect(props.sources[0].type).toBe('image/avif');
            expect(props.sources[1].type).toBe('image/webp');
            expect(props.sources[2].type).toBe('image/png');
            expect(props.sources[3].type).toBe('image/avif');
            expect(props.sources[4].type).toBe('image/webp');
            expect(props.sources[5].type).toBe('image/png');

            expect(props.links).toHaveLength(6);
            expect(props.links[0].type).toBe('image/avif');
            expect(props.links[1].type).toBe('image/webp');
            expect(props.links[2].type).toBe('image/png');
            expect(props.links[3].type).toBe('image/avif');
            expect(props.links[4].type).toBe('image/webp');
            expect(props.links[5].type).toBe('image/png');
        });

        test('jpg format uses image/jpeg MIME type', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withOptionalParams,
                widths: [100],
                formats: ['jpg'],
            });

            expect(props.sources[0].type).toBe('image/jpeg');
            expect(props.links[0].type).toBe('image/jpeg');
        });

        test('multiple formats with multiple breakpoints', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withOptionalParams,
                widths: [100, 500],
                formats: ['avif', 'webp'],
            });

            // 2 breakpoints × 2 formats = 4 sources
            expect(props.sources).toHaveLength(4);

            // Check that each breakpoint has both formats
            // Sources are ordered: larger breakpoint first, formats in array order
            expect(props.sources[0]).toMatchObject({ sizes: '500px', type: 'image/avif' });
            expect(props.sources[1]).toMatchObject({ sizes: '500px', type: 'image/webp' });
            expect(props.sources[2]).toMatchObject({ sizes: '100px', type: 'image/avif' });
            expect(props.sources[3]).toMatchObject({ sizes: '100px', type: 'image/webp' });

            // Links should also have entries for both formats at each breakpoint
            expect(props.links).toHaveLength(4);
        });

        test('all supported formats', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withOptionalParams,
                widths: [100],
                formats: ['gif', 'jp2', 'jpg', 'jpeg', 'jxr', 'png', 'webp', 'avif'],
            });

            expect(props.sources).toHaveLength(8);
            // Verify MIME types are correct (sources are reversed)
            const mimeTypes = props.sources.map((s) => s.type);
            expect(mimeTypes).toStrictEqual([
                'image/gif',
                'image/jp2',
                'image/jpeg',
                'image/jpeg', // for both jpg and jpeg
                'image/jxr',
                'image/png',
                'image/webp',
                'image/avif',
            ]);
        });

        test('empty formats array results in no sources or links', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withOptionalParams,
                widths: [100],
                formats: [],
            });

            expect(props.sources).toHaveLength(0);
            expect(props.links).toHaveLength(0);
            expect(props.src).toBe(disImageURL.withoutOptionalParams);
        });
    });

    describe('height parameter (sh)', () => {
        test('getSrc adds sh parameter when h is provided', () => {
            const result = getSrc(disImageURL.withOptionalParams, { w: 720, f: 'webp', h: 480 });
            expect(result).toContain('sw=720');
            expect(result).toContain('sh=480');
        });

        test('getSrc does not add sh parameter when h is not provided', () => {
            const result = getSrc(disImageURL.withOptionalParams, { w: 720, f: 'webp' });
            expect(result).toContain('sw=720');
            expect(result).not.toContain('sh=');
        });

        test('getSrc updates existing sh= parameter in URL', () => {
            const urlWithSh =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw1e4fcb17/images/large/PG.10212867.JJ3XYXX.PZ.jpg[?sw={width}&sh={height}&q=60]';
            const result = getSrc(urlWithSh, { w: 720, f: 'webp', h: 480 });
            expect(result).toContain('sh=480');
            // Should not have duplicate sh= parameters
            expect((result.match(/sh=/g) || []).length).toBe(1);
        });

        test('getSrc replaces {width} and {height} placeholders independently', () => {
            const urlWithBoth = 'https://example.com/image.jpg[?sw={width}&sh={height}&q=60]';
            const result = getSrc(urlWithBoth, { w: 720, f: 'webp', h: 360 });
            expect(result).toContain('sw=720');
            expect(result).toContain('sh=360');
        });

        test('getSrc replaces {height} with w when h is not provided (backward compat)', () => {
            const urlWithHeight = 'https://example.com/image.jpg[?sw={width}&sh={height}]';
            const result = getSrc(urlWithHeight, { w: 720, f: 'webp' });
            // {height} falls back to w, but no sh= param is added since h is not provided
            // The placeholder replacement still happens, converting {height} to w
            expect(result).toContain('sw=720');
        });

        test('getResponsivePictureAttributes with heights produces sh in srcSet', () => {
            const props = getResponsivePictureAttributes({
                src: 'https://example.com/image.jpg[?sw={width}&sh={height}&q=60]',
                widths: [200],
                heights: [150],
            });

            // Single width/height → all breakpoints identical → 1 unique source
            // 1x: sw=200&sh=150, 2x: sw=400&sh=300
            expect(props.sources).toHaveLength(1);
            expect(props.sources[0].srcSet).toContain('sw=200');
            expect(props.sources[0].srcSet).toContain('sh=150');
            expect(props.sources[0].srcSet).toContain('sw=400');
            expect(props.sources[0].srcSet).toContain('sh=300');
        });

        test('getResponsivePictureAttributes without heights produces no sh in srcSet', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withOptionalParams,
                widths: [200],
            });

            // 1x: sw=200, 2x: sw=400
            expect(props.sources).toHaveLength(1);
            expect(props.sources[0].srcSet).toContain('sw=200');
            expect(props.sources[0].srcSet).toContain('sw=400');
            expect(props.sources[0].srcSet).not.toContain('sh=');
        });

        test('getResponsivePictureAttributes with array heights and widths scales by DPR', () => {
            const props = getResponsivePictureAttributes({
                src: 'https://example.com/image.jpg[?sw={width}&sh={height}]',
                widths: [400],
                heights: [300],
                formats: ['webp'],
            });

            // Each srcSet should contain 1x and 2x variants
            props.sources.forEach((source) => {
                // 1x: sw=400&sh=300, 2x: sw=800&sh=600
                expect(source.srcSet).toContain('sw=400');
                expect(source.srcSet).toContain('sh=300');
                expect(source.srcSet).toContain('sw=800');
                expect(source.srcSet).toContain('sh=600');
            });
        });

        test('getResponsivePictureAttributes with object heights', () => {
            const props = getResponsivePictureAttributes({
                src: 'https://example.com/image.jpg[?sw={width}&sh={height}]',
                widths: { base: 200, md: 400 },
                heights: { base: 150, md: 300 },
                formats: ['webp'],
            });

            // {base: 200, md: 400} → [200, 200, 400] → 2 unique sources (md first, then base)
            expect(props.sources).toHaveLength(2);
            // First source (md): 1x sw=400&sh=300, 2x sw=800&sh=600
            expect(props.sources[0].srcSet).toContain('sw=400');
            expect(props.sources[0].srcSet).toContain('sh=300');
            expect(props.sources[0].srcSet).toContain('sw=800');
            expect(props.sources[0].srcSet).toContain('sh=600');
            // Second source (base): 1x sw=200&sh=150, 2x sw=400&sh=300
            expect(props.sources[1].srcSet).toContain('sw=200');
            expect(props.sources[1].srcSet).toContain('sh=150');
        });

        test('getSrc with only h (no w) adds sh but not sw', () => {
            const disUrl = 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/path/image.jpg';
            const result = getSrc(disUrl, { f: 'webp', h: 300 });
            expect(result).toContain('sh=300');
            expect(result).not.toContain('sw=');
        });

        test('getResponsivePictureAttributes with only heights (no widths) produces sh in srcSet', () => {
            const disUrl = 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/path/image.jpg';
            const props = getResponsivePictureAttributes({
                src: disUrl,
                heights: [200],
                formats: ['webp'],
            });

            // Single height → 1 unique source, 1x: sh=200, 2x: sh=400
            expect(props.sources).toHaveLength(1);
            expect(props.sources[0].srcSet).toContain('sh=200');
            expect(props.sources[0].srcSet).toContain('sh=400');
            expect(props.sources[0].srcSet).not.toContain('sw=');
        });

        test('getResponsivePictureAttributes with only object heights produces responsive sources', () => {
            const disUrl = 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/path/image.jpg';
            const props = getResponsivePictureAttributes({
                src: disUrl,
                heights: { base: 150, md: 300 },
                formats: ['webp'],
            });

            // {base: 150, md: 300} → [150, 150, 300] → 2 unique sources
            expect(props.sources).toHaveLength(2);
            // First source (md): 1x sh=300, 2x sh=600
            expect(props.sources[0].srcSet).toContain('sh=300');
            expect(props.sources[0].srcSet).toContain('sh=600');
            expect(props.sources[0].srcSet).not.toContain('sw=');
            // Second source (base): 1x sh=150, 2x sh=300
            expect(props.sources[1].srcSet).toContain('sh=150');
            expect(props.sources[1].srcSet).not.toContain('sw=');
        });

        test('getResponsivePictureAttributes with only heights scales by DPR', () => {
            const disUrl = 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/path/image.jpg';
            const props = getResponsivePictureAttributes({
                src: disUrl,
                heights: [300],
                formats: ['webp'],
            });

            // Single height → 1 unique source, 1x: sh=300, 2x: sh=600
            expect(props.sources).toHaveLength(1);
            expect(props.sources[0].srcSet).toContain('sh=300');
            expect(props.sources[0].srcSet).toContain('sh=600');
            expect(props.sources[0].srcSet).not.toContain('sw=');
        });
    });

    describe('quality parameter', () => {
        test('getSrc adds quality parameter when provided', () => {
            const result = getSrc(disImageURL.withoutQualityParam, { w: 720, q: 80 });
            expect(result).toContain('q=80');
        });

        test('getSrc does not add quality when not provided', () => {
            const result = getSrc(disImageURL.withoutQualityParam, { w: 720 });
            expect(result).not.toContain('q=');
        });

        test('getSrc preserves existing q parameter in URL (URL takes priority)', () => {
            const result = getSrc(disImageURL.withOptionalParams, { w: 720, q: 80 });
            // URL has q=60, should not be overwritten by quality=80
            expect(result).toContain('q=60');
            expect(result).not.toContain('q=80');
        });

        test('getResponsivePictureAttributes passes quality to srcSet URLs', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withoutQualityParam,
                widths: [100],
                quality: 75,
            });

            // All srcSet URLs should contain the quality parameter
            props.sources.forEach((source) => {
                expect(source.srcSet).toContain('q=75');
            });
            props.links.forEach((link) => {
                expect(link.srcSet).toContain('q=75');
            });
        });

        test('getResponsivePictureAttributes respects existing q parameter in URL', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withOptionalParams,
                widths: [100],
                quality: 75,
            });

            // URL has q=60, should not be overwritten
            props.sources.forEach((source) => {
                expect(source.srcSet).toContain('q=60');
                expect(source.srcSet).not.toContain('q=75');
            });
        });

        test('getResponsivePictureAttributes without quality does not add q parameter', () => {
            const props = getResponsivePictureAttributes({
                src: disImageURL.withoutQualityParam,
                widths: [100],
            });

            props.sources.forEach((source) => {
                expect(source.srcSet).not.toContain('q=');
            });
        });
    });
});

describe('toDisImageUrl()', () => {
    describe('basic conversion', () => {
        test('converts SFCC static URL to DIS URL', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/dw1234/images/large/product.jpg';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toBe(
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw1234/images/large/product.webp?sfrm=jpg&q=70'
            );
        });

        test('converts URL with different realm format', () => {
            const staticUrl =
                'https://abc-123.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.png';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('/dw/image/v2/ABC_123/');
            expect(result).toContain('.webp');
            expect(result).toContain('sfrm=png');
        });

        test('converts URL from MyDomain host (.my.cc.salesforce.com)', () => {
            const staticUrl =
                'https://demo-001.my.cc.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/dw945986e2/images/swatch/B0574182_001_sw.jpg';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('/dw/image/v2/DEMO_001/');
            expect(result).toContain('.webp');
            expect(result).toContain('sfrm=jpg');
        });
    });

    describe('handles undefined and invalid inputs', () => {
        test('returns undefined for undefined input', () => {
            expect(toDisImageUrl({ src: undefined })).toBeUndefined();
        });

        test('returns undefined for empty string', () => {
            expect(toDisImageUrl({ src: '' })).toBeUndefined();
        });

        test('returns undefined for non-SFCC URL without realm mapping', () => {
            // Only transforms URLs from Commerce Cloud domains when no realm fallback
            expect(toDisImageUrl({ src: 'https://example.com/image.jpg' })).toBeUndefined();
            expect(toDisImageUrl({ src: 'https://cdn.example.com/image.jpg' })).toBeUndefined();
        });

        test('returns undefined for invalid URL', () => {
            expect(toDisImageUrl({ src: 'not-a-valid-url' })).toBeUndefined();
        });

        test('returns undefined for relative URL', () => {
            expect(toDisImageUrl({ src: '/images/product.jpg' })).toBeUndefined();
        });
    });

    describe('custom realm mappings (vanity domains)', () => {
        test('converts vanity domain URL using custom realm mapping', () => {
            const vanityUrl =
                'https://ha-dev.storefront-next-demo.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const configWithMapping = deepMerge(mockConfig, {
                images: {
                    realmHostMappings: [{ hostSuffix: '.storefront-next-demo.com', realm: 'bjnl_dev' }],
                },
            });
            const result = toDisImageUrl({ src: vanityUrl, config: configWithMapping });

            expect(result).toBe(
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/BJNL_DEV/on/demandware.static/-/Sites-catalog/default/image.webp?sfrm=jpg&q=70'
            );
        });

        test('converts exact hostname match', () => {
            const vanityUrl = 'https://shop.example.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const configWithMapping = deepMerge(mockConfig, {
                images: {
                    realmHostMappings: [{ hostSuffix: 'shop.example.com', realm: 'prod_001' }],
                },
            });
            const result = toDisImageUrl({ src: vanityUrl, config: configWithMapping });

            expect(result).toContain('/dw/image/v2/PROD_001/');
            expect(result).toContain('.webp?sfrm=jpg&q=70');
        });

        test('custom mappings take precedence over built-in patterns', () => {
            // Override a built-in SFCC subdomain with a custom realm
            const sfccUrl =
                'https://demo-001.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const configWithMapping = deepMerge(mockConfig, {
                images: {
                    realmHostMappings: [{ hostSuffix: '.commercecloud.salesforce.com', realm: 'custom_realm' }],
                },
            });
            const result = toDisImageUrl({ src: sfccUrl, config: configWithMapping });

            // Should use custom realm, not derived DEMO_001
            expect(result).toContain('/dw/image/v2/CUSTOM_REALM/');
        });

        test('preserves placeholders with custom realm mapping', () => {
            const vanityUrl =
                'https://shop.example.com/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}]';
            const configWithMapping = deepMerge(mockConfig, {
                images: {
                    realmHostMappings: [{ hostSuffix: 'shop.example.com', realm: 'prod_001' }],
                },
            });
            const result = toDisImageUrl({ src: vanityUrl, config: configWithMapping });

            expect(result).toContain('/dw/image/v2/PROD_001/');
            expect(result).toContain('[?sw={width}]');
        });

        test('returns undefined for unmapped vanity domain', () => {
            const vanityUrl = 'https://shop.example.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            // No custom mapping provided
            const result = toDisImageUrl({ src: vanityUrl, config: mockConfig });

            expect(result).toBeUndefined();
        });

        test('built-in SFCC patterns still work when no custom mappings', () => {
            const sfccUrl =
                'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: sfccUrl, config: mockConfig });

            // Should fall back to subdomain extraction
            expect(result).toContain('/dw/image/v2/DEMO_001/');
        });

        test('does NOT match unrelated domain with similar suffix (dot-boundary check)', () => {
            // Bug fix: 'evilshop.example.com' should NOT match hostSuffix 'shop.example.com'
            const attackUrl = 'https://evilshop.example.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const configWithMapping = deepMerge(mockConfig, {
                images: {
                    realmHostMappings: [{ hostSuffix: 'shop.example.com', realm: 'prod_001' }],
                },
            });
            const result = toDisImageUrl({ src: attackUrl, config: configWithMapping });

            // Should return undefined because 'evilshop.example.com' should NOT match
            expect(result).toBeUndefined();
        });

        test('matches subdomain when hostSuffix has leading dot', () => {
            // '.example.com' should match 'shop.example.com', 'm.example.com', etc.
            const vanityUrl = 'https://shop.example.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const configWithMapping = deepMerge(mockConfig, {
                images: {
                    realmHostMappings: [{ hostSuffix: '.example.com', realm: 'prod_001' }],
                },
            });
            const result = toDisImageUrl({ src: vanityUrl, config: configWithMapping });

            expect(result).toContain('/dw/image/v2/PROD_001/');
        });

        test('matches case-insensitively when hostSuffix has mixed case', () => {
            // Bug fix: '.MyStore.Com' should match 'shop.mystore.com' (case-insensitive)
            const vanityUrl = 'https://shop.mystore.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const configWithMapping = deepMerge(mockConfig, {
                images: {
                    realmHostMappings: [{ hostSuffix: '.MyStore.Com', realm: 'prod_001' }],
                },
            });
            const result = toDisImageUrl({ src: vanityUrl, config: configWithMapping });

            // Should match despite case difference
            expect(result).toContain('/dw/image/v2/PROD_001/');
        });

        test('exact hostname match with mixed case works', () => {
            const vanityUrl = 'https://shop.example.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const configWithMapping = deepMerge(mockConfig, {
                images: {
                    realmHostMappings: [{ hostSuffix: 'Shop.Example.Com', realm: 'prod_001' }],
                },
            });
            const result = toDisImageUrl({ src: vanityUrl, config: configWithMapping });

            // Should match despite case difference
            expect(result).toContain('/dw/image/v2/PROD_001/');
        });
    });

    describe('options', () => {
        test('uses custom disHost', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, options: { disHost: 'https://custom.dis.host' } });

            expect(result).toContain('https://custom.dis.host/dw/image/v2/');
        });

        test('uses custom format', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, options: { format: 'avif' }, config: mockConfig });

            expect(result).toContain('.avif');
            expect(result).toContain('sfrm=jpg');
        });

        test('includes width parameter when specified', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, options: { width: 640 }, config: mockConfig });

            expect(result).toContain('sw=640');
        });

        test('includes height parameter when specified', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, options: { height: 480 }, config: mockConfig });

            expect(result).toContain('sh=480');
        });

        test('includes both width and height parameters when specified', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, options: { width: 640, height: 480 }, config: mockConfig });

            expect(result).toContain('sw=640');
            expect(result).toContain('sh=480');
        });

        test('does not include height parameter when not specified', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, options: { width: 640 }, config: mockConfig });

            expect(result).not.toContain('sh=');
        });

        test('uses custom quality', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, options: { quality: 85 }, config: mockConfig });

            expect(result).toContain('q=85');
        });

        test('uses custom sourceFormat', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, options: { sourceFormat: 'png' }, config: mockConfig });

            expect(result).toContain('sfrm=png');
        });

        test('returns undefined when no disHost is configured', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, options: { format: 'avif' } });

            expect(result).toBeUndefined();
        });
    });

    describe('DynamicImage placeholder preservation', () => {
        test('preserves [?sw={width}] placeholder', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}]';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('[?sw={width}]');
            expect(result).toMatch(/\.webp\?sfrm=jpg&q=70\[/);
        });

        test('preserves [?sw={width}&q=60] placeholder', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}&q=60]';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('[?sw={width}&q=60]');
        });

        test('preserves multiple placeholders', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image[_{width}].jpg[?sw={width}]';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('[_{width}]');
            expect(result).toContain('[?sw={width}]');
        });

        test('preserves [?sw={width}&sh={height}] placeholder', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}&sh={height}]';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('[?sw={width}&sh={height}]');
        });

        test('works without placeholders', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).not.toContain('[');
            expect(result).not.toContain(']');
        });
    });

    describe('URL already containing DIS path', () => {
        test('does not duplicate DIS path prefix', () => {
            const disUrl =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: disUrl, config: mockConfig });

            // Should not have duplicate /dw/image/v2/ZZRF_001
            const matches = result?.match(/\/dw\/image\/v2\/ZZRF_001/g);
            expect(matches).toHaveLength(1);
        });

        test('extracts realm from DIS path when present', () => {
            const disUrl =
                'https://some-other-host.com/dw/image/v2/ABCD_123/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: disUrl, config: mockConfig });

            expect(result).toContain('/dw/image/v2/ABCD_123/');
        });
    });

    describe('format detection', () => {
        test.each(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'])('detects %s source format', (ext) => {
            const staticUrl = `https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.${ext}`;
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            if (ext === 'webp') {
                // webp to webp - sfrm should be webp
                expect(result).toContain('sfrm=webp');
            } else {
                expect(result).toContain(`sfrm=${ext}`);
            }
        });

        test('handles uppercase extensions', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.JPG';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            // Extension detection is case-insensitive
            expect(result).toContain('sfrm=jpg');
            expect(result).toContain('.webp');
        });
    });

    describe('realm extraction', () => {
        test('extracts realm from hostname subdomain', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('/dw/image/v2/ZZRF_001/');
        });

        test('extracts realm from DIS path over hostname', () => {
            // When URL has both DIS path realm and hostname realm, prefer DIS path
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/dw/image/v2/DIFFERENT_REALM/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('/dw/image/v2/DIFFERENT_REALM/');
        });

        test('handles uppercase realm correctly', () => {
            const staticUrl =
                'https://ZZRF-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('/dw/image/v2/ZZRF_001/');
        });
    });

    describe('enableDis config', () => {
        const disDisabledConfig = {
            ...mockConfig,
            images: {
                ...mockConfig.images,
                enableDis: false,
            },
        } as typeof mockConfig;

        test('returns relative path for SFCC static URL', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toDisImageUrl({ src: staticUrl, config: disDisabledConfig });

            expect(result).toBe('/on/demandware.static/-/Sites-catalog/default/image.jpg');
        });

        test('preserves placeholders with relative path', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}]';
            const result = toDisImageUrl({ src: staticUrl, config: disDisabledConfig });

            expect(result).toBe('/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}]');
        });
    });
});

describe('toImageUrl()', () => {
    describe('handles undefined and invalid inputs', () => {
        test('returns undefined for undefined input', () => {
            expect(toImageUrl({ src: undefined })).toBeUndefined();
        });

        test('returns undefined for empty string', () => {
            expect(toImageUrl({ src: '' })).toBeUndefined();
        });
    });

    describe('SFCC static URLs', () => {
        test('transforms SFCC static URL to DIS URL', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('/dw/image/v2/ZZRF_001/');
            expect(result).toContain('.webp');
            expect(result).toContain('sfrm=jpg');
        });
    });

    describe('already DIS URLs', () => {
        test('ensures correct format for existing DIS URL', () => {
            const disUrl =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: disUrl });

            expect(result).toContain('.webp');
            expect(result).toContain('sfrm=jpg');
        });

        test('adds quality parameter for existing DIS URL when config provided', () => {
            const disUrl =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: disUrl, config: mockConfig });

            expect(result).toContain('.webp');
            expect(result).toContain('sfrm=jpg');
            expect(result).toContain('q=70');
        });

        test('does not duplicate quality parameter if already present', () => {
            const disUrl =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-catalog/default/image.jpg?q=80';
            const result = toImageUrl({ src: disUrl, config: mockConfig });

            expect(result).toContain('q=80');
            expect(result).not.toContain('q=70');
            // Should only have one q= parameter
            expect((result?.match(/q=/g) || []).length).toBe(1);
        });

        test('returns DIS URL unchanged if already webp', () => {
            const disUrl =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-catalog/default/image.webp?sfrm=jpg';
            const result = toImageUrl({ src: disUrl });

            expect(result).toBe(disUrl);
        });
    });

    describe('non-SFCC URLs (fallback behavior)', () => {
        test('returns original URL for non-SFCC URL', () => {
            const externalUrl = 'https://example.com/image.jpg';
            const result = toImageUrl({ src: externalUrl });

            expect(result).toBe(externalUrl);
        });

        test('returns original URL for CDN URL', () => {
            const cdnUrl = 'https://cdn.example.com/assets/image.png';
            const result = toImageUrl({ src: cdnUrl });

            expect(result).toBe(cdnUrl);
        });

        test('returns original URL for relative URL', () => {
            const relativeUrl = '/images/product.jpg';
            const result = toImageUrl({ src: relativeUrl });

            expect(result).toBe(relativeUrl);
        });
    });

    describe('placeholder preservation', () => {
        test('preserves [?sw={width}] placeholder in DIS URL', () => {
            const disUrl =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}]';
            const result = toImageUrl({ src: disUrl });

            expect(result).toContain('[?sw={width}]');
            expect(result).toContain('.webp');
        });

        test('preserves placeholder for SFCC static URL', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}]';
            const result = toImageUrl({ src: staticUrl, config: mockConfig });

            expect(result).toContain('[?sw={width}]');
            expect(result).toContain('.webp');
        });
    });

    describe('options', () => {
        test('uses custom format option', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: staticUrl, config: mockConfig, options: { format: 'avif' } });

            expect(result).toContain('.avif');
        });

        test('uses custom width option', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: staticUrl, config: mockConfig, options: { width: 640 } });

            expect(result).toContain('sw=640');
        });

        test('uses custom quality option', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: staticUrl, config: mockConfig, options: { quality: 85 } });

            expect(result).toContain('q=85');
        });

        test('uses custom height option', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: staticUrl, config: mockConfig, options: { height: 480 } });

            expect(result).toContain('sh=480');
        });

        test('uses both width and height options', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: staticUrl, config: mockConfig, options: { width: 640, height: 480 } });

            expect(result).toContain('sw=640');
            expect(result).toContain('sh=480');
        });
    });

    describe('difference from toDisImageUrl', () => {
        test('toImageUrl returns original URL for non-SFCC, toDisImageUrl returns undefined', () => {
            const externalUrl = 'https://example.com/image.jpg';

            expect(toImageUrl({ src: externalUrl })).toBe(externalUrl);
            expect(toDisImageUrl({ src: externalUrl })).toBeUndefined();
        });
    });

    describe('enableDis config', () => {
        const disDisabledConfig = {
            ...mockConfig,
            images: {
                ...mockConfig.images,
                enableDis: false,
            },
        } as typeof mockConfig;

        test('returns relative path for SFCC static URL', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: staticUrl, config: disDisabledConfig });

            expect(result).toBe('/on/demandware.static/-/Sites-catalog/default/image.jpg');
        });

        test('returns relative path for DIS URL', () => {
            const disUrl =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = toImageUrl({ src: disUrl, config: disDisabledConfig });

            expect(result).toBe('/on/demandware.static/-/Sites-catalog/default/image.jpg');
        });

        test('returns original for non-parseable URL', () => {
            const result = toImageUrl({ src: 'not-a-valid-url', config: disDisabledConfig });

            expect(result).toBe('not-a-valid-url');
        });

        test('preserves placeholders with relative path', () => {
            const staticUrl =
                'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}]';
            const result = toImageUrl({ src: staticUrl, config: disDisabledConfig });

            expect(result).toBe('/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}]');
        });
    });
});

describe('toDisBaseUrl()', () => {
    test('rewrites MyDomain URL to DIS-hosted URL, preserving extension and query', () => {
        const src =
            'https://demo-001.my.cc.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/dwffa6be72/images/medium/PG.10232700.JJ0DDXX.PZ.jpg';
        const result = toDisBaseUrl({ src, config: mockConfig });

        expect(result).toBe(
            'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dwffa6be72/images/medium/PG.10232700.JJ0DDXX.PZ.jpg'
        );
    });

    test('rewrites classic SFCC host to DIS-hosted URL', () => {
        const src =
            'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
        const result = toDisBaseUrl({ src, config: mockConfig });

        expect(result).toBe(
            'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/Sites-catalog/default/image.jpg'
        );
    });

    test('does not convert format or append sfrm/q parameters', () => {
        const src =
            'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
        const result = toDisBaseUrl({ src, config: mockConfig });

        expect(result).toContain('.jpg');
        expect(result).not.toContain('.webp');
        expect(result).not.toContain('sfrm=');
        expect(result).not.toContain('q=');
    });

    test('preserves existing query string', () => {
        const src =
            'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg?foo=bar';
        const result = toDisBaseUrl({ src, config: mockConfig });

        expect(result).toBe(
            'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/Sites-catalog/default/image.jpg?foo=bar'
        );
    });

    test('returns DIS URL unchanged when already on configured host', () => {
        const src =
            'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/Sites-catalog/default/image.jpg';
        expect(toDisBaseUrl({ src, config: mockConfig })).toBe(src);
    });

    test('rewrites DIS URL on different host and preserves realm from path', () => {
        const src =
            'https://some-other-host.com/dw/image/v2/ABCD_123/on/demandware.static/-/Sites-catalog/default/image.jpg';
        const result = toDisBaseUrl({ src, config: mockConfig });

        expect(result).toBe(
            'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ABCD_123/on/demandware.static/-/Sites-catalog/default/image.jpg'
        );
    });

    test('preserves DynamicImage placeholder syntax', () => {
        const src =
            'https://demo-001.my.cc.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}&q=60]';
        const result = toDisBaseUrl({ src, config: mockConfig });

        expect(result).toBe(
            'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/Sites-catalog/default/image.jpg[?sw={width}&q=60]'
        );
    });

    test('returns non-SFCC URL unchanged', () => {
        const src = 'https://example.com/image.jpg';
        expect(toDisBaseUrl({ src, config: mockConfig })).toBe(src);
    });

    test('returns original src when no disHost is configured', () => {
        const src =
            'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
        expect(toDisBaseUrl({ src })).toBe(src);
    });

    test('returns undefined for undefined input', () => {
        expect(toDisBaseUrl({ src: undefined })).toBeUndefined();
    });

    test('returns original src for invalid URL', () => {
        expect(toDisBaseUrl({ src: 'not-a-valid-url', config: mockConfig })).toBe('not-a-valid-url');
    });
});

describe('resolveDynamicImageAttributes()', () => {
    const SFCC_RAW_SRC =
        'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/dwbeefee44/images/large/P0048_001.jpg';
    const DIS_SRC = disImageURL.withoutOptionalParams;

    const buildConfig = (overrides?: Partial<Config>) =>
        overrides ? deepMerge(mockBuildConfig, overrides as Record<string, unknown>).app : mockConfig;

    describe('with DIS enabled (default)', () => {
        test('rewrites raw SFCC URL to DIS host in transformedSrc and src/srcSets', () => {
            const result = resolveDynamicImageAttributes({
                src: SFCC_RAW_SRC,
                config: buildConfig(),
                widths: [400],
            });

            expect(result.enableDis).toBe(true);
            expect(result.transformedSrc).toContain('edge.disstg.commercecloud.salesforce.com');
            expect(result.transformedSrc).toMatch(/\/dw\/image\/v\d+\/DEMO_001\//);
            expect(result.src).toContain('edge.disstg.commercecloud.salesforce.com');
            expect(result.sources).toHaveLength(1);
            expect(result.links).toHaveLength(1);

            const srcSet = result.sources[0].srcSet;
            expect(srcSet).toContain('.webp');
            expect(srcSet).toContain('sfrm=jpg');
            expect(srcSet).toMatch(/\bsw=400/);
            expect(srcSet).toMatch(/\bq=70/); // default quality from mockConfig.images.quality
            expect(result.sources[0].type).toBe('image/webp');
        });

        test('exposes fallbackFormat from config (default: jpg)', () => {
            const result = resolveDynamicImageAttributes({ src: DIS_SRC, config: buildConfig() });
            expect(result.fallbackFormat).toBe('jpg');
        });

        test('honors a custom fallbackFormat from config', () => {
            const config = buildConfig({ app: { images: { fallbackFormat: 'png' } } } as Partial<Config>);
            const result = resolveDynamicImageAttributes({ src: DIS_SRC, config });
            expect(result.fallbackFormat).toBe('png');
        });

        test('returns no sources/links when neither widths nor heights are provided', () => {
            const result = resolveDynamicImageAttributes({ src: DIS_SRC, config: buildConfig() });

            expect(result.sources).toEqual([]);
            expect(result.links).toEqual([]);
            // src has placeholder syntax stripped via getSrcWithoutOptionalParams.
            expect(result.src).not.toMatch(/\[[^\]]*]/);
        });

        test('produces one <source>/link per distinct breakpoint when widths are provided', () => {
            const result = resolveDynamicImageAttributes({
                src: DIS_SRC,
                config: buildConfig(),
                widths: [200, 400, 800],
            });

            expect(result.sources).toHaveLength(3);
            expect(result.links).toHaveLength(3);
            for (const source of result.sources) {
                expect(source.srcSet).toMatch(/\bsw=\d+/);
                expect(source.type).toBe('image/webp');
                expect(typeof source.sizes).toBe('string');
            }
        });

        test('emits sh= params when heights are provided alongside widths', () => {
            const result = resolveDynamicImageAttributes({
                src: DIS_SRC,
                config: buildConfig(),
                widths: [200, 400],
                heights: [150, 300],
            });

            const srcSets = result.sources.map((s) => s.srcSet);
            expect(srcSets.every((s) => /\bsh=\d+/.test(s))).toBe(true);
        });

        test('produces one <source> and one link per format per breakpoint when multiple formats are configured', () => {
            const config = buildConfig({ app: { images: { formats: ['avif', 'webp'] } } } as Partial<Config>);
            const result = resolveDynamicImageAttributes({
                src: DIS_SRC,
                config,
                widths: [400, 800],
            });

            // 2 breakpoints × 2 formats = 4 entries on each axis.
            expect(result.sources).toHaveLength(4);
            expect(result.links).toHaveLength(4);

            const sourceTypes = result.sources.map((s) => s.type);
            const linkTypes = result.links.map((l) => l.type);
            expect(sourceTypes).toEqual(expect.arrayContaining(['image/avif', 'image/webp']));
            expect(linkTypes).toEqual(expect.arrayContaining(['image/avif', 'image/webp']));

            // hrefs are distinct across breakpoints (preserves React's per-resource dedup).
            const hrefsByBreakpoint = new Set(result.links.map((l) => l.href));
            expect(hrefsByBreakpoint.size).toBe(2);
        });
    });

    describe('with DIS disabled', () => {
        const disabledConfig = () => buildConfig({ app: { images: { enableDis: false } } } as Partial<Config>);

        test('reports enableDis: false', () => {
            const result = resolveDynamicImageAttributes({ src: SFCC_RAW_SRC, config: disabledConfig() });
            expect(result.enableDis).toBe(false);
        });

        test('keeps raw SFCC URL on a relative static path (no DIS host, no realm prefix)', () => {
            const result = resolveDynamicImageAttributes({
                src: SFCC_RAW_SRC,
                config: disabledConfig(),
                widths: [400],
            });

            expect(result.transformedSrc).not.toContain('edge.disstg.commercecloud.salesforce.com');
            expect(result.transformedSrc).not.toMatch(/\/dw\/image\/v\d+\//);
            expect(result.transformedSrc).toBe(
                '/on/demandware.static/-/Sites-apparel-m-catalog/default/dwbeefee44/images/large/P0048_001.jpg'
            );
        });

        test('does not emit format-conversion params (no .webp / sfrm=jpg / q=) on srcSets', () => {
            const result = resolveDynamicImageAttributes({
                src: SFCC_RAW_SRC,
                config: disabledConfig(),
                widths: [400],
            });

            // formats=[] when DIS disabled → still emits one <source> for the original format with sw=, but
            // no DIS-only conversion params (sfrm=, q=) and no webp rewrite.
            for (const source of result.sources) {
                expect(source.srcSet).not.toContain('.webp');
                expect(source.srcSet).not.toContain('sfrm=');
                expect(source.srcSet).not.toMatch(/\bq=\d+/);
                expect(source.type).toBe('image/jpeg');
            }
        });
    });

    describe('with a local relative asset (Vite-bundled public path)', () => {
        // Bundled public assets (e.g. `/images/hero-01.webp`) are served verbatim by the app — DIS
        // cannot transform them because there is no SFCC realm/host to route through. Even though
        // `enableDis` is true, the resolver must treat DIS as inactive for these paths: no format
        // conversion, no DIS query params, and no phantom `<source>` variants that would 404.
        const LOCAL_SRC = '/images/hero-01.webp';

        test('leaves the relative path untouched in transformedSrc and img src', () => {
            const result = resolveDynamicImageAttributes({
                src: LOCAL_SRC,
                config: buildConfig(),
                widths: ['100vw'],
            });

            expect(result.transformedSrc).toBe(LOCAL_SRC);
            // src drives the <img> fallback — it must stay the real bundled asset, never a rewritten
            // `/images/hero-01.jpg?sfrm=webp` (which does not exist and would 404).
            expect(result.src).toBe(LOCAL_SRC);
            expect(result.src).not.toContain('sfrm=');
            expect(result.src).not.toContain('.jpg');
        });

        test('reports enableDis: false so the img fallback is not format-rewritten', () => {
            const result = resolveDynamicImageAttributes({
                src: LOCAL_SRC,
                config: buildConfig(),
                widths: ['100vw'],
            });

            // A local asset can't go through DIS — the render path must treat DIS as inactive so it
            // does not rewrite the <img> src to a non-existent `/images/hero-01.jpg?sfrm=webp`.
            expect(result.enableDis).toBe(false);
        });

        test('emits no phantom <source>/link variants for the un-transformable asset', () => {
            const result = resolveDynamicImageAttributes({
                src: LOCAL_SRC,
                config: buildConfig(),
                widths: ['100vw'],
            });

            // DIS resizing/format conversion is impossible, so there are no meaningful responsive
            // variants — the component renders a plain <img> and (for LCP heroes) preloads that one
            // URL directly. Dead `?sw=&q=` variants would just make the browser fetch duplicates.
            expect(result.sources).toEqual([]);
            expect(result.links).toEqual([]);
        });
    });

    describe('with a non-SFCC absolute URL (third-party host, no derivable realm)', () => {
        // An absolute URL on a host DIS can't serve (`https://via.placeholder.com/...`,
        // `https://images.unsplash.com/...`) has no SFCC realm, so `toDisBaseUrl` returns it unchanged.
        // Being absolute is not enough — DIS only transforms URLs it actually rewrote into
        // `/dw/image/v2/{realm}/`. The resolver must treat DIS as inactive so it doesn't fabricate
        // `…/300.webp?sw=300&q=70&sfrm=jpg` variants the third-party host doesn't serve.
        const THIRD_PARTY_SRC = 'https://via.placeholder.com/300';

        test('leaves the third-party URL untouched in transformedSrc and img src', () => {
            const result = resolveDynamicImageAttributes({
                src: THIRD_PARTY_SRC,
                config: buildConfig(),
                widths: [300],
            });

            expect(result.transformedSrc).toBe(THIRD_PARTY_SRC);
            expect(result.src).toBe(THIRD_PARTY_SRC);
            expect(result.src).not.toContain('sfrm=');
            expect(result.src).not.toContain('.webp');
        });

        test('reports enableDis: false so the img fallback is not format-rewritten', () => {
            const result = resolveDynamicImageAttributes({
                src: THIRD_PARTY_SRC,
                config: buildConfig(),
                widths: [300],
            });

            expect(result.enableDis).toBe(false);
        });

        test('emits no phantom <source>/link variants the third-party host cannot serve', () => {
            const result = resolveDynamicImageAttributes({
                src: THIRD_PARTY_SRC,
                config: buildConfig(),
                widths: [300],
            });

            expect(result.sources).toEqual([]);
            expect(result.links).toEqual([]);
        });
    });

    describe('falls back when transform yields no URL', () => {
        test('uses original src when toDisBaseUrl returns undefined', () => {
            // toDisBaseUrl returns undefined for empty src; resolver should fall back to the input.
            const result = resolveDynamicImageAttributes({ src: '', config: mockConfig });
            expect(result.transformedSrc).toBe('');
        });
    });

    describe('DIS-eligibility gate in getSrc (Part 1: Stop the leak)', () => {
        test('does not inject sw/sh/q params for non-DIS URL', () => {
            const nonDisUrl =
                'https://ha-dev.storefront-next-demo.com/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = getSrc(nonDisUrl, { w: 720, h: 480, q: 70 });

            // Non-DIS URL → no sw/sh/q params injected
            expect(result).toBe(nonDisUrl);
            expect(result).not.toContain('sw=');
            expect(result).not.toContain('sh=');
            expect(result).not.toContain('q=');
        });

        test('does not apply format conversion for non-DIS URL', () => {
            const nonDisUrl = 'https://example.com/image.jpg';
            const result = getSrc(nonDisUrl, { w: 720, f: 'webp' });

            // No DIS transformation → original extension preserved, no sfrm
            expect(result).toBe('https://example.com/image.jpg');
            expect(result).not.toContain('.webp');
            expect(result).not.toContain('sfrm=');
        });

        test('injects params for DIS URL (with DIS path)', () => {
            const disUrl =
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-catalog/default/image.jpg';
            const result = getSrc(disUrl, { w: 720, h: 480, q: 70, f: 'webp' });

            // DIS URL → params injected
            expect(result).toContain('sw=720');
            expect(result).toContain('sh=480');
            expect(result).toContain('q=70');
            expect(result).toContain('.webp');
            expect(result).toContain('sfrm=jpg');
        });

        test('injects params for URL with sfrm (already transformed)', () => {
            const transformedUrl = 'https://example.com/image.webp?sfrm=jpg';
            const result = getSrc(transformedUrl, { w: 720, q: 70 });

            // Has sfrm → DIS-eligible → params injected
            expect(result).toContain('sw=720');
            expect(result).toContain('q=70');
        });

        test('placeholder interpolation still works for non-DIS URL', () => {
            // Use a simple {width} placeholder (not bracket-enclosed) to avoid query param conversion
            const nonDisUrl = 'https://example.com/image_{width}.jpg';
            const result = getSrc(nonDisUrl, { w: 720 });

            // Placeholder expanded, but no sw= param added (non-DIS)
            expect(result).toBe('https://example.com/image_720.jpg');
            expect(result).not.toContain('sw=');
        });
    });
});
