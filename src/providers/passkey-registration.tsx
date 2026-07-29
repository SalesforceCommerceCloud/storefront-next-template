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
import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from 'react';

const PasskeyRegistrationModal = lazy(() =>
    import('@/components/passkeys/passkey-registration-modal').then((m) => ({ default: m.PasskeyRegistrationModal }))
);

interface PasskeyRegistrationContextValue {
    isOpen: boolean;
    openModal: (userId: string, options?: { suppressSuccessToast?: boolean }) => void;
    closeModal: () => void;
}

const PasskeyRegistrationContext = createContext<PasskeyRegistrationContextValue | null>(null);

// oxlint-disable-next-line react-refresh/only-export-components
export function usePasskeyRegistrationContext(): PasskeyRegistrationContextValue {
    const ctx = useContext(PasskeyRegistrationContext);
    if (!ctx) throw new Error('usePasskeyRegistrationContext must be used within PasskeyRegistrationProvider');
    return ctx;
}

export function PasskeyRegistrationProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [userId, setUserId] = useState('');
    const [mountModal, setMountModal] = useState(false);
    const [suppressSuccessToast, setSuppressSuccessToast] = useState(false);

    const openModal = useCallback((uid: string, options?: { suppressSuccessToast?: boolean }) => {
        setUserId(uid);
        setSuppressSuccessToast(options?.suppressSuccessToast ?? false);
        setMountModal(true);
        setIsOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setIsOpen(false);
    }, []);

    return (
        <PasskeyRegistrationContext.Provider value={{ isOpen, openModal, closeModal }}>
            {children}
            {mountModal && (
                <Suspense fallback={null}>
                    <PasskeyRegistrationModal
                        open={isOpen}
                        userId={userId}
                        onClose={closeModal}
                        suppressSuccessToast={suppressSuccessToast}
                    />
                </Suspense>
            )}
        </PasskeyRegistrationContext.Provider>
    );
}
