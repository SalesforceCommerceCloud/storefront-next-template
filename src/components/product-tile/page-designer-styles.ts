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

export interface PageDesignerStyleProps {
    objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    borderRadius?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
    boxShadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    padding?: '0' | '2' | '4' | '6' | '8';
    margin?: '0' | '2' | '4' | '6' | '8';
    fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
    letterSpacing?: 'tighter' | 'tight' | 'normal' | 'wide' | 'wider';
    hoverEffect?: 'default' | 'scale' | 'shadow' | 'lift';
}

export const getPageDesignerStyleClasses = ({
    objectFit,
    borderRadius,
    boxShadow,
    padding,
    margin,
    fontWeight,
    letterSpacing,
    hoverEffect,
}: Partial<PageDesignerStyleProps>) => {
    const classes: string[] = [];

    if (objectFit) {
        const fitMap = {
            contain: '[&_img]:!object-contain',
            cover: '[&_img]:!object-cover',
            fill: '[&_img]:!object-fill',
            none: '[&_img]:!object-none',
            'scale-down': '[&_img]:!object-scale-down',
        };
        classes.push(fitMap[objectFit]);
    }

    if (borderRadius) {
        const radiusMap: Record<string, string> = {
            none: '!rounded-none',
            xs: '!rounded-xs',
            sm: '!rounded-sm',
            md: '!rounded-md',
            lg: '!rounded-lg',
            xl: '!rounded-xl',
            '2xl': '!rounded-2xl',
            '3xl': '!rounded-3xl',
            '4xl': '!rounded-4xl',
            full: '!rounded-full',
        };
        classes.push(radiusMap[borderRadius] || '!rounded-none');
    }

    if (boxShadow === 'none') {
        classes.push('!shadow-none hover:!shadow-none');
    } else if (boxShadow) {
        const shadowMap = {
            sm: '!shadow-sm hover:!shadow-sm',
            md: '!shadow-md hover:!shadow-md',
            lg: '!shadow-lg hover:!shadow-lg',
            xl: '!shadow-xl hover:!shadow-xl',
            '2xl': '!shadow-2xl hover:!shadow-2xl',
        };
        classes.push(shadowMap[boxShadow]);
    }

    if (padding && padding !== '0') {
        const paddingMap: Record<string, string> = {
            '2': 'p-2',
            '4': 'p-4',
            '6': 'p-6',
            '8': 'p-8',
        };
        classes.push(paddingMap[padding]);
    }

    if (margin && margin !== '0') {
        const marginMap: Record<string, string> = {
            '2': 'm-2',
            '4': 'm-4',
            '6': 'm-6',
            '8': 'm-8',
        };
        classes.push(marginMap[margin]);
    }

    if (fontWeight) {
        const weightMap = {
            normal: '[&_a]:!font-normal',
            medium: '[&_a]:!font-medium',
            semibold: '[&_a]:!font-semibold',
            bold: '[&_a]:!font-bold',
        };
        classes.push(weightMap[fontWeight]);
    }

    if (letterSpacing) {
        const spacingMap = {
            tighter: '[&_a]:!tracking-tighter',
            tight: '[&_a]:!tracking-tight',
            normal: '[&_a]:!tracking-normal',
            wide: '[&_a]:!tracking-wide',
            wider: '[&_a]:!tracking-wider',
        };
        classes.push(spacingMap[letterSpacing]);
    }

    if (hoverEffect && hoverEffect !== 'default') {
        const hoverMap = {
            scale: 'hover:!scale-105 !transition-transform !duration-200 hover:!shadow-md',
            shadow: 'hover:!shadow-xl !transition-shadow !duration-200',
            lift: 'hover:!-translate-y-1 hover:!shadow-lg !transition-all !duration-200',
        };
        classes.push(hoverMap[hoverEffect]);
    }

    return classes.join(' ');
};
