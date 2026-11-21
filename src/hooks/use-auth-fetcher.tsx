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
import { forwardRef, useCallback, useMemo, type ComponentProps } from 'react';
import { useFetcher as useRouterFetcher, useFormAction, type SubmitTarget } from 'react-router';
import { useAuth } from '@/providers/auth';
import { bindAuthContext } from '@/lib/auth/context-binding';

function targetAction(target: SubmitTarget): string | undefined {
    if (typeof HTMLFormElement !== 'undefined' && target instanceof HTMLFormElement)
        return target.getAttribute('action') ?? undefined;
    if (
        (typeof HTMLButtonElement !== 'undefined' && target instanceof HTMLButtonElement) ||
        (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement)
    )
        return target.getAttribute('formaction') ?? target.form?.getAttribute('action') ?? undefined;
    return undefined;
}

/** Bind submission to the context that rendered it; do not reinterpret stale work under newer cookies. */
// oxlint-disable-next-line typescript/no-explicit-any -- Preserve React Router's default for existing untyped fetchers.
export function useAuthFetcher<T = any>(options?: Parameters<typeof useRouterFetcher>[0]) {
    const fetcher = useRouterFetcher<T>(options);
    const { submit: routerSubmit, load: routerLoad, Form: RouterForm } = fetcher;
    const defaultAction = useFormAction();
    const version = useAuth()?.authContextVersion;
    const submit = useCallback<typeof fetcher.submit>(
        (target, opts) => {
            if (!version) return routerSubmit(target, opts);
            return routerSubmit(target, {
                ...opts,
                action: bindAuthContext(opts?.action ?? targetAction(target) ?? defaultAction, version),
            });
        },
        [routerSubmit, defaultAction, version]
    );
    const load = useCallback<typeof fetcher.load>(
        (href, opts) => routerLoad(bindAuthContext(href, version), opts),
        [routerLoad, version]
    );
    const Form = useMemo(() => {
        if (!version) return RouterForm;
        const BoundForm = forwardRef<HTMLFormElement, ComponentProps<typeof RouterForm>>((props, ref) => {
            const action = useFormAction(props.action, { relative: props.relative });
            return <RouterForm {...props} ref={ref} action={bindAuthContext(action, version)} />;
        });
        BoundForm.displayName = 'AuthFetcherForm';
        return BoundForm;
    }, [RouterForm, version]);
    return version ? { ...fetcher, submit, load, Form } : fetcher;
}
