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
import { Icon, ScopedNotification } from '../lib/slds';

/** Inline caveat — signals a gap in what was measured, never a pass. */
export function Notice({ children }: { children: React.ReactNode }) {
    return (
        <ScopedNotification
            theme="light"
            icon={
                <Icon
                    category="utility"
                    name="warning"
                    colorVariant="warning"
                    size="small"
                    assistiveText={{ label: 'Caveat' }}
                />
            }>
            {children}
        </ScopedNotification>
    );
}
