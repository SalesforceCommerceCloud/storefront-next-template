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
import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';
import { CHECKOUT_STEPS, type CheckoutStep } from './utils/checkout-context-types';

interface TimelineStep {
    id: CheckoutStep;
    title: string;
    description: string;
}

const TIMELINE_STEPS: TimelineStep[] = [
    {
        id: CHECKOUT_STEPS.CONTACT_INFO,
        title: 'Contact Info',
        description: 'Email address',
    },
    {
        id: CHECKOUT_STEPS.PICKUP,
        title: 'Pickup',
        description: 'Store pickup',
    },
    {
        id: CHECKOUT_STEPS.SHIPPING_ADDRESS,
        title: 'Shipping',
        description: 'Delivery address',
    },
    {
        id: CHECKOUT_STEPS.SHIPPING_OPTIONS,
        title: 'Delivery',
        description: 'Shipping method',
    },
    {
        id: CHECKOUT_STEPS.PAYMENT,
        title: 'Payment',
        description: 'Payment method',
    },
    {
        id: CHECKOUT_STEPS.PLACE_ORDER,
        title: 'Place Order',
        description: 'Place order',
    },
];

interface CheckoutProgressProps {
    currentStep: CheckoutStep;
    completedSteps?: CheckoutStep[];
    className?: string;
}

type StepStatus = 'completed' | 'current' | 'pending';

function getStepStatus(
    stepId: CheckoutStep,
    currentStep: CheckoutStep,
    completedSteps: CheckoutStep[] = []
): StepStatus {
    if (completedSteps.includes(stepId)) {
        return 'completed';
    }
    if (stepId === currentStep) {
        return 'current';
    }
    return 'pending';
}

// Reusable style configurations
const STEP_CIRCLE_STYLES = {
    completed: 'bg-primary text-primary-foreground',
    current: 'bg-primary/90 text-primary-foreground animate-pulse',
    pending: 'border-2 border-border text-muted-foreground',
} as const;

const STEP_TITLE_STYLES = {
    mobile: {
        completed: 'text-primary',
        current: 'text-primary',
        pending: 'text-muted-foreground',
    },
    desktop: {
        completed: 'text-primary',
        current: 'text-primary',
        pending: 'text-foreground',
    },
} as const;

const STEP_DESCRIPTION_STYLES = {
    completed: 'text-primary',
    current: 'text-primary',
    pending: 'text-muted-foreground',
} as const;

const CONNECTOR_STYLES = {
    completed: 'bg-primary',
    current: 'bg-border',
    pending: 'bg-border',
} as const;

// Reusable components
function StepCircle({ status, index }: { status: StepStatus; index: number }) {
    return (
        <div
            className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                STEP_CIRCLE_STYLES[status]
            )}>
            {status === 'completed' ? <CheckIcon className="w-4 h-4" /> : <span>{index + 1}</span>}
        </div>
    );
}

export function CheckoutProgress({ currentStep, completedSteps = [], className }: CheckoutProgressProps) {
    return (
        <nav aria-label="Checkout progress" className={cn('w-full', className)}>
            {/* Mobile Timeline - Horizontal */}
            <ol className="flex items-center justify-between mb-4 md:hidden">
                {TIMELINE_STEPS.map((step, index) => {
                    const status = getStepStatus(step.id, currentStep, completedSteps);
                    const isLast = index === TIMELINE_STEPS.length - 1;

                    return (
                        <li
                            key={step.id}
                            className="flex items-center flex-1"
                            aria-current={status === 'current' ? 'step' : undefined}>
                            {/* Step Circle */}
                            <div className="flex flex-col items-center">
                                <StepCircle status={status} index={index} />

                                {/* Step Title - Mobile */}
                                <div className="text-xs text-center mt-1 max-w-16">
                                    <div className={cn('font-medium truncate', STEP_TITLE_STYLES.mobile[status])}>
                                        {step.title}
                                    </div>
                                </div>
                            </div>

                            {/* Connector Line */}
                            {!isLast && (
                                <div className="flex-1 mx-2">
                                    <div className={cn('h-0.5 transition-colors', CONNECTOR_STYLES[status])} />
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>

            {/* Desktop Timeline - Vertical */}
            <ol className="hidden space-y-6 md:block">
                {TIMELINE_STEPS.map((step, index) => {
                    const status = getStepStatus(step.id, currentStep, completedSteps);
                    const isLast = index === TIMELINE_STEPS.length - 1;

                    return (
                        <li
                            key={step.id}
                            className="relative flex items-start"
                            aria-current={status === 'current' ? 'step' : undefined}>
                            {/* Connector Line */}
                            {!isLast && <div className="absolute left-4 top-10 w-0.5 h-6 bg-border" />}

                            {/* Step Circle */}
                            <div className="mr-4">
                                <StepCircle status={status} index={index} />
                            </div>

                            {/* Step Content */}
                            <div className="flex-1 min-w-0">
                                <div className={cn('text-sm font-medium', STEP_TITLE_STYLES.desktop[status])}>
                                    {step.title}
                                </div>
                                <div className={cn('text-xs mt-1', STEP_DESCRIPTION_STYLES[status])}>
                                    {step.description}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
