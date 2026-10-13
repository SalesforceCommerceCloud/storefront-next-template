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
import { type PropsWithChildren, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import StoreLocator from '@/extensions/store-locator/components/store-locator';
import { StoreLocatorLayoutProvider } from '@/extensions/store-locator/context/layout';

interface StoreLocatorSheetProps extends PropsWithChildren {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * StoreLocatorSheet
 *
 * Controlled sheet container that hosts the store locator experience.
 * Parent component must manage the open state.
 *
 * @param children - Optional trigger element rendered with `SheetTrigger asChild`. Omit it when the sheet is
 *   opened programmatically (controlled via `open`) so no empty, non-interactive trigger is rendered.
 * @param open - Controlled open state (required)
 * @param onOpenChange - Callback when open state changes (required)
 * @returns ReactElement
 *
 * @example
 * const [isOpen, setIsOpen] = useState(false);
 *
 * <StoreLocatorSheet open={isOpen} onOpenChange={setIsOpen}>
 *   <Button variant="ghost">Open Store Locator</Button>
 * </StoreLocatorSheet>
 *
 * @example
 * // Programmatic open with no trigger child
 * <StoreLocatorSheet open={isOpen} onOpenChange={setIsOpen} />
 */
export default function StoreLocatorSheet({ children, open, onOpenChange }: StoreLocatorSheetProps): ReactElement {
    const { t } = useTranslation('extStoreLocator');

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            {children ? <SheetTrigger asChild>{children}</SheetTrigger> : null}
            <SheetContent className="md:w-1/3 md:max-w-1/3 p-0">
                <SheetHeader>
                    <SheetTitle>{t('storeLocator.title')}</SheetTitle>
                    <SheetDescription>{t('storeLocator.description')}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                    <StoreLocatorLayoutProvider forceMobile>
                        <StoreLocator />
                    </StoreLocatorLayoutProvider>
                </div>
            </SheetContent>
        </Sheet>
    );
}
