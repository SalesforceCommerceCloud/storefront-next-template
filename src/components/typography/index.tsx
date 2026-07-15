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
import { type ComponentProps, forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const typographyVariants = cva('', {
    variants: {
        variant: {
            h1: 'text-4xl font-bold tracking-tight',
            h2: 'text-3xl font-semibold tracking-tight',
            h3: 'text-2xl font-semibold tracking-tight',
            h4: 'text-2xl font-semibold tracking-tight',
            h5: 'text-sm font-semibold tracking-tight',
            h6: 'text-base font-semibold tracking-tight',
            p: 'leading-7 [&:not(:first-child)]:mt-6',
            // Sized body copy. `p` is prose-rhythm only (line-height + top margin); `body` is the
            // sized sibling used where a self-contained paragraph needs an explicit size/weight
            // (e.g. Hero's "Paragraph" preset).
            body: 'text-base font-normal leading-7',
            blockquote: 'mt-6 border-l-2 pl-6 italic',
            'inline-code': 'relative rounded-ui bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-medium',
            lead: 'text-2xl text-muted-foreground',
            large: 'text-sm font-semibold',
            small: 'text-sm font-medium leading-none',
            muted: 'text-sm text-muted-foreground',
            // Product-specific variants
            'product-title': 'text-sm font-medium text-foreground leading-tight',
            'product-price': 'text-base font-semibold text-foreground',
            'product-description': 'text-sm text-muted-foreground leading-relaxed',
            'recommendation-title': 'self-stretch text-foreground text-3xl font-bold leading-none tracking-tight',
        },
        align: {
            left: 'text-left',
            center: 'text-center',
            right: 'text-right',
        },
    },
    defaultVariants: {
        variant: 'p',
        align: 'left',
    },
});

interface TypographyProps extends ComponentProps<'div'>, VariantProps<typeof typographyVariants> {
    asChild?: boolean;
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div' | 'blockquote' | 'code';
}

const Typography = forwardRef<HTMLDivElement, TypographyProps>(
    ({ className, variant, align, asChild = false, as, children, ...props }, ref) => {
        const Comp = asChild ? Slot : as || getDefaultElement(variant);

        return (
            <Comp className={cn(typographyVariants({ variant, align }), className)} ref={ref} {...props}>
                {children}
            </Comp>
        );
    }
);

Typography.displayName = 'Typography';

// Helper function to get default element based on variant
function getDefaultElement(variant: TypographyProps['variant']): string {
    switch (variant) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
            return variant;
        case 'blockquote':
            return 'blockquote';
        case 'inline-code':
            return 'code';
        case 'product-title':
            return 'h3';
        case 'product-price':
        case 'product-description':
        case 'p':
        case 'body':
        case 'lead':
        case 'large':
        case 'small':
        case 'muted':
        default:
            return 'p';
    }
}

// eslint-disable-next-line react-refresh/only-export-components
export { Typography, typographyVariants };
export type { TypographyProps };
