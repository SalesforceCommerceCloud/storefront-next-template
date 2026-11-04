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
import { Badge } from '../lib/slds';
import { toneClass, type Tone } from '../lib/tone';
import { cn } from '../lib/cn';

// One chip, one look per severity. The tone→color mapping lives in tokens.css
// and nowhere else, so a "high" finding can never render two different ways.
export function SeverityBadge({
    severity,
    children,
    className,
}: {
    severity: Tone;
    children: React.ReactNode;
    className?: string;
}) {
    return <Badge className={cn('audit-badge', toneClass(severity), className)} content={children} />;
}
