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
import { Badge, Icon } from '../lib/slds';
import { cn } from '../lib/cn';

/**
 * The AI-provenance marker placed beside anything advisory (ranked fixes,
 * per-finding review notes, the overview summary), so every AI surface reads
 * the same: sparkles glyph + brand-tinted badge.
 */
export function AiBadge({ children = 'AI analysis', className }: { children?: React.ReactNode; className?: string }) {
    return (
        <Badge
            className={cn('audit-badge audit-badge_ai', className)}
            iconAlignment="left"
            icon={<Icon category="utility" name="sparkles" size="xx-small" className="audit-badge__icon" />}
            content={children}
        />
    );
}
