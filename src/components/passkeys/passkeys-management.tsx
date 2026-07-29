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
import { type ReactElement, Suspense, useState, useEffect, useRef } from 'react';
import { Await, useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { action as passkeyDeleteCredentialAction } from '@/routes/action.passkey-delete-credential';
import { PasskeyCard, type PasskeyCredential } from './passkey-card';
import { DeletePasskeyDialog } from './delete-passkey-dialog';
import { PasskeysLoadError } from './passkeys-load-error';
import { useToast } from '@/components/toast';
import { usePasskeyRegistrationContext } from '@/providers/passkey-registration';
import { useAuth } from '@/providers/auth';
import { resourceRoutes } from '@/route-paths';
import { isPasskeyRegistrationSupported } from '@/lib/auth/webauthn';
import { UITarget } from '@/targets/ui-target';

export interface PasskeysManagementProps {
    /**
     * Deferred list of the shopper's registered passkeys. Accepted as an unresolved promise
     * (not an array) so the page chrome — heading, section shell, and "Add Passkey" button —
     * renders synchronously while only the list body suspends. If the promise rejects (e.g. the
     * SLAS passkey-user lookup errors on staging), the `<Await errorElement>` shows an inline
     * load-error in place of the list, rather than blanking the whole page via the route
     * ErrorBoundary. A resolved array is also accepted (React Router's `<Await>` renders a
     * non-promise value synchronously), which keeps tests and stories simple.
     */
    credentials: Promise<PasskeyCredential[]> | PasskeyCredential[];
}

type Intent = 'delete';

/** Two-row placeholder for the passkey list while the deferred credentials promise resolves. */
function PasskeyListSkeleton(): ReactElement {
    return (
        <div className="pt-2 space-y-6">
            {[1, 2].map((i) => (
                <Card key={i} className="p-6">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-8 w-8" />
                    </div>
                </Card>
            ))}
        </div>
    );
}

/**
 * The list-consuming half of the passkeys page: renders one card per credential (or the empty
 * state), owns the delete-one flow (confirmation dialog + fetcher), and tracks passkeys added
 * during this session so the "New" badge shows until reload. Rendered inside the `<Await>` so it
 * only mounts once the credentials promise resolves.
 */
function PasskeysList({ credentials }: { credentials: PasskeyCredential[] }): ReactElement {
    const { t } = useTranslation('account');
    const { addToast } = useToast();

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedCredential, setSelectedCredential] = useState<PasskeyCredential | null>(null);

    // Credential IDs registered during this session, so the "New" badge disappears on reload
    // (this state resets when the component remounts) instead of persisting via server data.
    const [newCredentialIds, setNewCredentialIds] = useState<Set<string>>(new Set());
    const seenCredentialIdsRef = useRef<Set<string> | null>(null);

    useEffect(() => {
        const currentIds = new Set(
            credentials.map((credential) => credential.credentialId).filter((id): id is string => !!id)
        );
        const seenIds = seenCredentialIdsRef.current;
        if (seenIds) {
            const addedIds = [...currentIds].filter((id) => !seenIds.has(id));
            if (addedIds.length > 0) {
                setNewCredentialIds((prev) => new Set([...prev, ...addedIds]));
            }
        }
        seenCredentialIdsRef.current = currentIds;
    }, [credentials]);

    const passkeyFetcher = useFetcher<typeof passkeyDeleteCredentialAction>();
    const currentIntentRef = useRef<Intent | null>(null);

    const hasPasskeys = credentials.length > 0;

    const handleDeleteClick = (credential: PasskeyCredential) => {
        setSelectedCredential(credential);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteDialogClose = () => {
        setIsDeleteDialogOpen(false);
        setSelectedCredential(null);
    };

    const handleDeleteConfirm = (credentialId: string) => {
        currentIntentRef.current = 'delete';
        const formData = new FormData();
        formData.append('credentialId', credentialId);
        void passkeyFetcher.submit(formData, { method: 'POST', action: resourceRoutes.passkeyDeleteCredential });
    };

    useEffect(() => {
        // Guarded by currentIntentRef alone (cleared at the end), not a state-transition diff —
        // in a production build React can batch submitting->idle into a single commit for a
        // synchronous action, so a previous-vs-current ref comparison can miss the transition.
        const intent = currentIntentRef.current;
        if (intent && passkeyFetcher.state === 'idle' && passkeyFetcher.data) {
            const { success } = passkeyFetcher.data;

            const intentHandlers: Record<Intent, () => void> = {
                delete: () => {
                    setIsDeleteDialogOpen(false);
                    setSelectedCredential(null);
                    addToast(t(`passkeys.delete${success ? 'Success' : 'Error'}`), success ? 'success' : 'error');
                },
            };

            intentHandlers[intent]();
            // No explicit revalidate() here: fetcher.submit() already triggers React Router's
            // default action revalidation, which refreshes this route's passkeys loader. A manual
            // revalidate() would kick off a second, redundant reload of the passkey and account loaders.

            currentIntentRef.current = null;
        }
    }, [passkeyFetcher.state, passkeyFetcher.data, addToast, t]);

    const isDeleting =
        (passkeyFetcher.state === 'submitting' || passkeyFetcher.state === 'loading') &&
        currentIntentRef.current === 'delete';

    return (
        <>
            <div className="pt-2">
                {!hasPasskeys ? (
                    <div className="py-8 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="text-muted-foreground">
                                <p className="text-sm font-medium">{t('passkeys.empty')}</p>
                                <p className="text-sm mt-1">{t('passkeys.emptyHint')}</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {credentials.map((credential) => (
                            <PasskeyCard
                                key={credential.credentialId}
                                credential={credential}
                                onRemove={() => handleDeleteClick(credential)}
                                isNew={!!credential.credentialId && newCredentialIds.has(credential.credentialId)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <DeletePasskeyDialog
                open={isDeleteDialogOpen}
                onOpenChange={handleDeleteDialogClose}
                credential={selectedCredential}
                onConfirm={handleDeleteConfirm}
                isLoading={isDeleting}
            />
        </>
    );
}

/**
 * Account passkeys management page content. The chrome (page heading, section shell, and the
 * "Add Passkey" entry point into the shared registration modal) renders synchronously; the
 * credential list is deferred behind `<Suspense>/<Await>` so a slow or failing list load never
 * blocks the page from rendering. See `PasskeysManagementProps.credentials` for why the prop is
 * a promise.
 */
export function PasskeysManagement({ credentials }: PasskeysManagementProps): ReactElement {
    const { t } = useTranslation('account');
    const { addToast } = useToast();
    const { openModal } = usePasskeyRegistrationContext();
    const auth = useAuth();

    const handleAddClick = () => {
        // Guard the two ways this entry point can silently dead-end: a browser that can't run the
        // registration ceremony (the modal would advance to OTP and then fail at credentials.create),
        // and a missing encUserId (the modal's send-OTP effect early-returns on !userId, so it would
        // sit on OTP with no code ever sent). Surface an error instead of opening a modal that can't finish.
        if (!isPasskeyRegistrationSupported()) {
            addToast(t('passkeys.unsupportedBrowser'), 'error');
            return;
        }
        if (!auth?.encUserId) {
            addToast(t('passkeys.addError'), 'error');
            return;
        }
        openModal(auth.encUserId, { suppressSuccessToast: true });
    };

    return (
        <div className="space-y-5">
            <Card className="bg-card border-border">
                <CardContent className="px-6 py-3">
                    <h1 className="text-2xl font-semibold text-foreground mb-1">{t('passkeys.pageTitle')}</h1>
                    <p className="text-sm text-muted-foreground">{t('passkeys.pageSubtitle')}</p>
                </CardContent>
            </Card>

            <UITarget targetId="sfcc.accountPasskeys.manage">
                <Card className="p-6">
                    <div className="flex items-center justify-between pb-6 border-b">
                        <div>
                            <h2 className="text-base font-semibold text-foreground mb-1">
                                {t('passkeys.sectionTitle')}
                            </h2>
                            <p className="text-sm text-muted-foreground">{t('passkeys.sectionSubtitle')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={handleAddClick}>
                                {t('passkeys.addPasskey')}
                            </Button>
                        </div>
                    </div>

                    <Suspense fallback={<PasskeyListSkeleton />}>
                        <Await resolve={credentials} errorElement={<PasskeysLoadError />}>
                            {(resolvedCredentials: PasskeyCredential[]) => (
                                <PasskeysList credentials={resolvedCredentials} />
                            )}
                        </Await>
                    </Suspense>
                </Card>
            </UITarget>
        </div>
    );
}
