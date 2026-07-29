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
import { type ReactElement, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Pencil, Trash2, InfoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { accountDestructiveButtonClasses, accountDestructiveIconHoverClasses } from '@/lib/account-action-styles';

const AUTHORIZED_PERSON_FORM_NS = 'account' as const;
const MODAL_VALIDATION_PREFIX = 'storePreferences.authorizedPickupPeople.modal' as const;

function createAuthorizedPersonSchema(t: (key: string) => string) {
    return z.object({
        firstName: z
            .string()
            .trim()
            .min(1, t(`${MODAL_VALIDATION_PREFIX}.firstNameRequired`))
            .max(50, t(`${MODAL_VALIDATION_PREFIX}.firstNameMax`)),
        lastName: z
            .string()
            .trim()
            .min(1, t(`${MODAL_VALIDATION_PREFIX}.lastNameRequired`))
            .max(50, t(`${MODAL_VALIDATION_PREFIX}.lastNameMax`)),
        email: z
            .string()
            .trim()
            .min(1, t(`${MODAL_VALIDATION_PREFIX}.emailRequired`))
            .email(t(`${MODAL_VALIDATION_PREFIX}.emailInvalid`))
            .max(100, t(`${MODAL_VALIDATION_PREFIX}.emailMax`)),
        relationship: z
            .string()
            .trim()
            .min(1, t(`${MODAL_VALIDATION_PREFIX}.relationshipRequired`)),
    });
}

type AuthorizedPersonFormValues = z.infer<ReturnType<typeof createAuthorizedPersonSchema>>;

const STORAGE_KEY = 'store-preferences-authorized-pickup';

const RELATIONSHIP_KEYS = ['spouse', 'familyMember', 'friend', 'other'] as const;

export type AuthorizedPickupPerson = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    relationship: string;
};

function loadFromStorage(): AuthorizedPickupPerson[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (p): p is AuthorizedPickupPerson =>
                typeof p === 'object' &&
                p !== null &&
                typeof (p as AuthorizedPickupPerson).id === 'string' &&
                typeof (p as AuthorizedPickupPerson).firstName === 'string' &&
                typeof (p as AuthorizedPickupPerson).lastName === 'string' &&
                typeof (p as AuthorizedPickupPerson).email === 'string' &&
                typeof (p as AuthorizedPickupPerson).relationship === 'string'
        );
    } catch {
        return [];
    }
}

function saveToStorage(people: AuthorizedPickupPerson[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
    } catch {
        // ignore
    }
}

/**
 * Authorized Pickup People section. Displays a list of people authorized to pick up
 * orders on the customer's behalf, with add/edit/delete (client-side only until APIs exist).
 */
const defaultFormValues: AuthorizedPersonFormValues = {
    firstName: '',
    lastName: '',
    email: '',
    relationship: '',
};

export default function AuthorizedPickupPeople(): ReactElement {
    const { t } = useTranslation(AUTHORIZED_PERSON_FORM_NS);
    const [people, setPeople] = useState<AuthorizedPickupPerson[]>([]);
    const [hydrated, setHydrated] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [personToDelete, setPersonToDelete] = useState<AuthorizedPickupPerson | null>(null);
    const addButtonRef = useRef<HTMLButtonElement | null>(null);

    const schema = useMemo(() => createAuthorizedPersonSchema((key: string) => (t as (k: string) => string)(key)), [t]);
    const form = useForm<AuthorizedPersonFormValues>({
        resolver: zodResolver(
            schema as unknown as Parameters<typeof zodResolver>[0]
        ) as unknown as Resolver<AuthorizedPersonFormValues>,
        defaultValues: defaultFormValues,
    });

    useEffect(() => {
        setPeople(loadFromStorage());
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        saveToStorage(people);
    }, [hydrated, people]);

    const openAdd = useCallback(() => {
        setEditingId(null);
        form.reset(defaultFormValues);
        setModalOpen(true);
    }, [form]);

    const openEdit = useCallback(
        (person: AuthorizedPickupPerson) => {
            setEditingId(person.id);
            form.reset({
                firstName: person.firstName,
                lastName: person.lastName,
                email: person.email,
                relationship: person.relationship,
            });
            setModalOpen(true);
        },
        [form]
    );

    const closeModal = useCallback(() => {
        setModalOpen(false);
        setEditingId(null);
    }, []);

    const handleSave = useCallback(
        (data: AuthorizedPersonFormValues) => {
            const trimmed = {
                ...data,
                relationship: data.relationship.trim(),
            };
            if (editingId) {
                setPeople((prev) => prev.map((p) => (p.id === editingId ? { ...p, ...trimmed } : p)));
            } else {
                setPeople((prev) => [
                    ...prev,
                    {
                        ...trimmed,
                        id: crypto.randomUUID(),
                    },
                ]);
            }
            closeModal();
        },
        [editingId, closeModal]
    );

    const handleDeleteConfirm = useCallback(() => {
        if (personToDelete) {
            setPeople((prev) => prev.filter((p) => p.id !== personToDelete.id));
            setPersonToDelete(null);
            requestAnimationFrame(() => addButtonRef.current?.focus());
        }
    }, [personToDelete]);

    const handleDeleteClick = useCallback((person: AuthorizedPickupPerson) => {
        setPersonToDelete(person);
    }, []);

    const isEditing = editingId !== null;
    const modalTitle = isEditing
        ? t('storePreferences.authorizedPickupPeople.modal.editTitle')
        : t('storePreferences.authorizedPickupPeople.modal.addTitle');

    return (
        <>
            <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle as="h2" className="text-lg">
                            {t('storePreferences.authorizedPickupPeople.heading')}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {t('storePreferences.authorizedPickupPeople.description')}
                        </CardDescription>
                    </div>
                    <CardAction>
                        <Button ref={addButtonRef} type="button" onClick={openAdd}>
                            <Plus className="size-4" aria-hidden />
                            {t('storePreferences.authorizedPickupPeople.addPerson')}
                        </Button>
                    </CardAction>
                </CardHeader>
                <CardContent className="space-y-4">
                    {people.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            {t('storePreferences.authorizedPickupPeople.emptyState')}
                        </p>
                    ) : (
                        <ul className="space-y-3" role="list">
                            {people.map((person) => (
                                <li
                                    key={person.id}
                                    className="flex flex-col gap-2 rounded-ui border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-medium text-foreground">
                                                {person.firstName} {person.lastName}
                                            </span>
                                            <Badge className="rounded-ui border-0 bg-active-bg px-2 py-0.5 text-xs font-medium text-active-foreground">
                                                {t('storePreferences.authorizedPickupPeople.statusActive')}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1">{person.email}</p>
                                        {person.relationship && (
                                            <p className="text-xs text-muted-foreground">
                                                {t('storePreferences.authorizedPickupPeople.relationshipLabel', {
                                                    relationship: RELATIONSHIP_KEYS.includes(
                                                        person.relationship as (typeof RELATIONSHIP_KEYS)[number]
                                                    )
                                                        ? (t as (k: string) => string)(
                                                              `storePreferences.authorizedPickupPeople.relationships.${person.relationship}`
                                                          )
                                                        : person.relationship,
                                                })}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="cursor-pointer hover:bg-muted/80"
                                            onClick={() => openEdit(person)}
                                            aria-label={t('storePreferences.authorizedPickupPeople.edit')}>
                                            <Pencil className="size-4" aria-hidden />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => handleDeleteClick(person)}
                                            aria-label={t('storePreferences.authorizedPickupPeople.delete')}
                                            className={accountDestructiveIconHoverClasses}>
                                            <Trash2 className="size-4" aria-hidden />
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <Alert className="border-border bg-muted/60 [&>svg]:text-primary" variant="default">
                        <InfoIcon className="size-4" aria-hidden />
                        <AlertDescription className="text-xs">
                            {t('storePreferences.authorizedPickupPeople.idNote')}
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>

            <AlertDialog open={personToDelete !== null} onOpenChange={(open) => !open && setPersonToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('storePreferences.authorizedPickupPeople.deleteConfirmTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {personToDelete &&
                                t('storePreferences.authorizedPickupPeople.deleteConfirmDescription', {
                                    name: `${personToDelete.firstName} ${personToDelete.lastName}`,
                                })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t('storePreferences.authorizedPickupPeople.deleteConfirmCancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm} className={accountDestructiveButtonClasses}>
                            {t('storePreferences.authorizedPickupPeople.deleteConfirmRemove')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog
                open={modalOpen}
                onOpenChange={(open) => {
                    setModalOpen(open);
                    if (!open) closeModal();
                }}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg">{modalTitle}</DialogTitle>
                    </DialogHeader>

                    <Form {...form}>
                        <form onSubmit={(e) => void form.handleSubmit(handleSave)(e)} className="grid gap-4 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                <FormField
                                    control={form.control}
                                    name="firstName"
                                    render={({ field }) => (
                                        <FormItem className="min-h-[5.5rem]">
                                            <FormLabel>
                                                {t('storePreferences.authorizedPickupPeople.modal.firstName')}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder={t(
                                                        'storePreferences.authorizedPickupPeople.modal.firstNamePlaceholder'
                                                    )}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage className="text-account-action-destructive" />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="lastName"
                                    render={({ field }) => (
                                        <FormItem className="min-h-[5.5rem]">
                                            <FormLabel>
                                                {t('storePreferences.authorizedPickupPeople.modal.lastName')}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder={t(
                                                        'storePreferences.authorizedPickupPeople.modal.lastNamePlaceholder'
                                                    )}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage className="text-account-action-destructive" />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {t('storePreferences.authorizedPickupPeople.modal.email')}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="email"
                                                placeholder={t(
                                                    'storePreferences.authorizedPickupPeople.modal.emailPlaceholder'
                                                )}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-account-action-destructive" />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="relationship"
                                render={({ field }) => (
                                    <FormItem className="w-full">
                                        <FormLabel>
                                            {t('storePreferences.authorizedPickupPeople.modal.relationship')}
                                        </FormLabel>
                                        <FormControl>
                                            <div className="w-full [&_[data-slot=native-select-wrapper]]:w-full">
                                                <NativeSelect
                                                    aria-label={t(
                                                        'storePreferences.authorizedPickupPeople.modal.relationship'
                                                    )}
                                                    value={field.value}
                                                    onChange={(e) => field.onChange(e.target.value)}
                                                    onBlur={field.onBlur}
                                                    ref={field.ref}>
                                                    <NativeSelectOption value="">
                                                        {t(
                                                            'storePreferences.authorizedPickupPeople.modal.relationshipPlaceholder'
                                                        )}
                                                    </NativeSelectOption>
                                                    {RELATIONSHIP_KEYS.map((key) => (
                                                        <NativeSelectOption key={key} value={key}>
                                                            {t(
                                                                `storePreferences.authorizedPickupPeople.relationships.${key}` as 'storePreferences.authorizedPickupPeople.relationships.spouse'
                                                            )}
                                                        </NativeSelectOption>
                                                    ))}
                                                </NativeSelect>
                                            </div>
                                        </FormControl>
                                        <FormMessage className="text-account-action-destructive" />
                                    </FormItem>
                                )}
                            />

                            <Alert className="border-border bg-muted/60 [&>svg]:text-primary" variant="default">
                                <InfoIcon className="size-4" aria-hidden />
                                <AlertDescription className="text-xs">
                                    {t('storePreferences.authorizedPickupPeople.modal.modalNote')}
                                </AlertDescription>
                            </Alert>

                            <DialogFooter className="border-t border-border pt-4">
                                <Button type="button" variant="outline" onClick={closeModal}>
                                    {t('storePreferences.authorizedPickupPeople.modal.cancel')}
                                </Button>
                                <Button type="submit">{t('storePreferences.authorizedPickupPeople.modal.save')}</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </>
    );
}
