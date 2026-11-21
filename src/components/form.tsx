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
import { forwardRef, type ComponentProps } from 'react';
import { Form as RouterForm, useFormAction } from 'react-router';
import { useAuth } from '@/providers/auth';
import { bindAuthContext } from '@/lib/auth/context-binding';

const BoundForm = forwardRef<HTMLFormElement, ComponentProps<typeof RouterForm> & { version: string }>(
    ({ version, ...props }, ref) => {
        const action = useFormAction(props.action, { relative: props.relative });
        return <RouterForm {...props} ref={ref} action={bindAuthContext(action, version)} />;
    }
);
BoundForm.displayName = 'AuthBoundForm';

/** SSR-compatible context binding for navigating forms, including submissions without JavaScript. */
export const Form = forwardRef<HTMLFormElement, ComponentProps<typeof RouterForm>>((props, ref) => {
    const version = useAuth()?.authContextVersion;
    const mutation = props.method && props.method.toUpperCase() !== 'GET';
    return mutation && version ? (
        <BoundForm {...props} ref={ref} version={version} />
    ) : (
        <RouterForm {...props} ref={ref} />
    );
});
Form.displayName = 'Form';
