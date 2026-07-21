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
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useFormField } from '@/components/ui/form';

/**
 * Form-aware field components that wire accessibility props directly from form context,
 * bypassing FormControl's Slot which overrides data-slot and prevents the design system's
 * square-corner rule from applying.
 *
 * Only sets aria-describedby when a validation message exists, avoiding references
 * to non-existent FormDescription elements in strict a11y checks. If the consumer passes
 * an aria-describedby prop, it will be composed with the form message ID.
 */
export function FormInput({ 'aria-describedby': consumerDescribedBy, ...props }: React.ComponentProps<typeof Input>) {
    const { formItemId, formMessageId, error } = useFormField();

    // Compose aria-describedby from consumer-provided IDs and form message (if error).
    const describedBy = [consumerDescribedBy, error ? formMessageId : null].filter(Boolean).join(' ') || undefined;

    return <Input id={formItemId} aria-describedby={describedBy} aria-invalid={!!error} {...props} />;
}

export function FormNativeSelect(props: React.ComponentProps<typeof NativeSelect>) {
    const { formItemId, formMessageId, error } = useFormField();

    return (
        <NativeSelect
            id={formItemId}
            aria-describedby={error ? formMessageId : undefined}
            aria-invalid={!!error}
            {...props}
        />
    );
}
