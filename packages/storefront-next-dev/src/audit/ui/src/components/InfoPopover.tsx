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
import { Button, Popover } from '../lib/slds';

/**
 * A Lightning info button-icon that opens an explanatory popover. SLDS
 * Popover owns focus management, Escape and outside-click dismissal; the
 * heading doubles as the dialog's accessible name.
 */
export function InfoPopover({
    label,
    heading,
    align = 'bottom right',
    fit = false,
    children,
}: {
    /** Accessible name for the trigger, e.g. "How the budget is scored". */
    label: string;
    heading: string;
    align?: 'bottom left' | 'bottom right';
    /** Size the bubble to its widest unwrappable content (e.g. a table) instead of the fixed SLDS width. */
    fit?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Popover
            align={align}
            heading={heading}
            body={children}
            classNameBody={fit ? 'audit-popover__body_fit' : undefined}>
            <Button
                assistiveText={{ icon: label }}
                iconCategory="utility"
                iconName="info"
                iconVariant="bare"
                variant="icon"
                title={label}
            />
        </Popover>
    );
}
