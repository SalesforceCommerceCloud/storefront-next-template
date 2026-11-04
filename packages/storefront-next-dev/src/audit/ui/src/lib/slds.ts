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
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import RawBadge from '@salesforce/design-system-react/components/badge';
import RawPageHeaderControl from '@salesforce/design-system-react/components/page-header/control';
import RawIconSettings from '@salesforce/design-system-react/components/icon-settings';
import RawScopedNotification from '@salesforce/design-system-react/components/scoped-notification';

export { default as Alert } from '@salesforce/design-system-react/components/alert';
export { default as Button } from '@salesforce/design-system-react/components/button';
export { default as Card } from '@salesforce/design-system-react/components/card';
export { default as Combobox } from '@salesforce/design-system-react/components/combobox/combobox';
export { default as GlobalNavigationBar } from '@salesforce/design-system-react/components/global-navigation-bar';
export { default as GlobalNavigationBarLink } from '@salesforce/design-system-react/components/global-navigation-bar/link';
export { default as GlobalNavigationBarRegion } from '@salesforce/design-system-react/components/global-navigation-bar/region';
export { default as Icon } from '@salesforce/design-system-react/components/icon';
export { default as PageHeader } from '@salesforce/design-system-react/components/page-header';
export { default as Popover } from '@salesforce/design-system-react/components/popover/popover';
export { default as ProgressBar } from '@salesforce/design-system-react/components/progress-bar';
export { default as Spinner } from '@salesforce/design-system-react/components/spinner';
export { default as Tabs } from '@salesforce/design-system-react/components/tabs';
export { default as TabsPanel } from '@salesforce/design-system-react/components/tabs/panel';

export const IconSettings = RawIconSettings as ComponentType<
    Omit<ComponentProps<typeof RawIconSettings>, 'children'> & { children: ReactNode }
>;

export const Badge = RawBadge as ComponentType<ComponentProps<typeof RawBadge> & { icon?: ReactNode }>;

export const ScopedNotification = RawScopedNotification as ComponentType<
    ComponentProps<typeof RawScopedNotification> & { children: ReactNode }
>;

/** PageHeader keeps only actions wrapped in this control and drops the rest. */
export const PageHeaderControl = RawPageHeaderControl as ComponentType<
    ComponentProps<typeof RawPageHeaderControl> & { children: ReactNode }
>;
