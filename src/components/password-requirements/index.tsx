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
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Props for the PasswordRequirement component
 */
export interface PasswordRequirementProps {
    /** The password string to validate against requirements */
    password: string;
    /** Optional CSS class name for custom styling */
    className?: string;
}

/**
 * Internal interface for defining password requirements
 */
interface Requirement {
    /** Unique identifier for the requirement */
    id: string;
    /** Translation key for the requirement text */
    textKey: string;
    /** Function that validates if the password meets this requirement */
    validator: (password: string) => boolean;
}

/**
 * PasswordRequirement component that displays real-time password validation requirements.
 *
 * This component shows a checklist of password requirements with visual indicators
 * (check marks for met requirements, X marks for unmet requirements) that update
 * in real-time as the user types their password.
 *
 * @param props - The component props
 * @param props.password - The password string to validate against requirements
 * @param props.className - Optional CSS class name for custom styling
 *
 * @returns JSX element containing the password requirements checklist
 *
 * @example
 * ```tsx
 * import { PasswordRequirement } from '@/components/password-requirements';
 * import { useWatch } from 'react-hook-form';
 *
 * function PasswordForm() {
 *   const password = useWatch({ control, name: 'password' });
 *
 *   return (
 *     <div>
 *       <input type="password" {...register('password')} />
 *       <PasswordRequirement password={password} />
 *     </div>
 *   );
 * }
 * ```
 */
export function PasswordRequirement({ password, className }: PasswordRequirementProps) {
    const { t } = useTranslation('account');

    /**
     * Array of password requirements to validate against
     */
    const requirements: Requirement[] = [
        {
            id: 'length',
            textKey: 'password.requirements.minLength',
            validator: (pwd) => pwd.length >= 8,
        },
        {
            id: 'uppercase',
            textKey: 'password.requirements.hasUppercase',
            validator: (pwd) => /[A-Z]/.test(pwd),
        },
        {
            id: 'lowercase',
            textKey: 'password.requirements.hasLowercase',
            validator: (pwd) => /[a-z]/.test(pwd),
        },
        {
            id: 'number',
            textKey: 'password.requirements.hasNumber',
            validator: (pwd) => /\d/.test(pwd),
        },
        {
            id: 'special',
            textKey: 'password.requirements.hasSpecial',
            validator: (pwd) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd),
        },
    ];

    return (
        <div className={cn('space-y-2', className)}>
            <p role="heading" aria-level={4} className="text-sm font-medium text-foreground">
                {t('password.requirements.title')}
            </p>
            <ul role="list" className="space-y-1.5">
                {requirements.map((requirement) => {
                    const isValid = requirement.validator(password);
                    return (
                        <li
                            key={requirement.id}
                            className={cn(
                                'flex items-center gap-2 text-sm transition-colors',
                                isValid ? 'text-primary' : 'text-muted-foreground'
                            )}>
                            {isValid ? (
                                <Check className="h-4 w-4 text-primary" data-testid="check-icon" />
                            ) : (
                                <X className="h-4 w-4 text-muted-foreground" data-testid="x-icon" />
                            )}
                            <span>{t(requirement.textKey as never)}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default PasswordRequirement;
