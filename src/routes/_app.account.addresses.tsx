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
import { type ReactElement, Suspense, useState, useEffect, useMemo } from 'react';
import { useOutletContext, Await, useRevalidator } from 'react-router';

// Third-party libraries
import { Plus } from 'lucide-react';
import type { ShopperCustomers } from '@/scapi';

// UI components
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import AddressCard from '@/components/address-card';
import { AccountAddressesSkeleton } from '@/components/account-addresses-skeleton';
import { SeoMeta } from '@/components/seo-meta';
import { CustomerAddressForm, type CustomerAddressFormData } from '@/components/customer-address-form';
import { RemoveAddressConfirmationDialog } from '@/components/remove-address-confirmation-dialog';
import { useToast } from '@/components/toast';

// Hooks
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { useScapiFetcherEffect } from '@/hooks/use-scapi-fetcher-effect';

// Providers
import { useAuth } from '@/providers/auth';
import { UITarget } from '@/targets/ui-target';

type AccountLayoutContext = {
    customer: Promise<ShopperCustomers.schemas['Customer'] | null>;
};

type EditingAddressId = string | null;
const NEW_ADDRESS_ID = 'new' as const;

/**
 * Account addresses content component that renders when customer data is loaded.
 * This component receives the resolved customer data and displays all addresses.
 */
function AccountAddressesContent({
    customer,
}: {
    customer: ShopperCustomers.schemas['Customer'] | null;
}): ReactElement {
    const { t } = useTranslation('account');
    const revalidator = useRevalidator();

    // Sort addresses by addressId to maintain consistent order regardless of preferred status
    const addresses = useMemo(() => {
        const addressList = customer?.addresses || [];
        return [...addressList].sort((a, b) => (a.addressId || '').localeCompare(b.addressId || ''));
    }, [customer?.addresses]);
    const { addToast } = useToast();
    const auth = useAuth();
    const customerId = auth?.customerId;
    const [addressToRemove, setAddressToRemove] = useState<ShopperCustomers.schemas['CustomerAddress'] | null>(null);
    const [editingAddressId, setEditingAddressId] = useState<EditingAddressId>(null);
    const [settingDefaultAddress, setSettingDefaultAddress] = useState<
        ShopperCustomers.schemas['CustomerAddress'] | null
    >(null);

    // Create fetcher for creating customer address
    const createAddressFetcher = useScapiFetcher('shopperCustomers', 'createCustomerAddress', {
        params: {
            path: {
                customerId: customerId || '',
            },
        },
        body: {} as ShopperCustomers.schemas['CustomerAddress'],
    });

    // Create fetcher for updating customer address
    // We'll dynamically update the parameters when editing as you cannot update the addressName
    // at the time of the submit call.
    // NOTE: When updating the addressName, the API response will be a 301 redirect which causes the browser
    // to make an additional PATCH request to the new resource which will always fail. I believe this is a bug in the API
    // and that the 301 was incorrectly returned.
    const [updateAddressName, setUpdateAddressName] = useState<string>('');
    const updateAddressFetcher = useScapiFetcher('shopperCustomers', 'updateCustomerAddress', {
        params: {
            path: {
                customerId: customerId || '',
                addressName: updateAddressName,
            },
        },
        body: {} as ShopperCustomers.schemas['CustomerAddress'],
    });

    // Create fetcher for setting default address
    const setDefaultAddressFetcher = useScapiFetcher('shopperCustomers', 'updateCustomerAddress', {
        params: {
            path: {
                customerId: customerId || '',
                addressName: settingDefaultAddress?.addressId || '',
            },
        },
        body: {} as ShopperCustomers.schemas['CustomerAddress'],
    });

    const handleAdd = () => {
        // Clear any existing editing state and switch to "Add Address" mode
        setEditingAddressId(NEW_ADDRESS_ID);
    };

    const handleEdit = (addressId?: string) => {
        if (!addressId) return;
        setEditingAddressId(addressId);
        setUpdateAddressName(addressId);
    };

    const handleCancel = () => {
        setEditingAddressId(null);
        setUpdateAddressName('');
    };

    const handleRemove = (address: ShopperCustomers.schemas['CustomerAddress']) => {
        if (address?.addressId) {
            setAddressToRemove(address);
        }
    };

    const handleSetDefault = (address: ShopperCustomers.schemas['CustomerAddress']) => {
        if (!address.addressId) return;
        setSettingDefaultAddress(address);
    };

    // Effect to trigger set default API call when address is selected
    useEffect(() => {
        if (settingDefaultAddress?.addressId) {
            // Submit the update request to set preferred to true
            void setDefaultAddressFetcher.submit({
                ...settingDefaultAddress,
                preferred: true,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settingDefaultAddress]);

    // Handle successful address creation
    useScapiFetcherEffect(createAddressFetcher, {
        onSuccess: () => {
            addToast(t('addresses.addSuccess'), 'success');
            setEditingAddressId(null);
            void revalidator.revalidate();
        },
        onError: (errors) => {
            const errorMessage = errors?.length > 0 ? errors.join(', ') : t('addresses.addError');
            addToast(errorMessage, 'error');
        },
    });

    // Handle successful address update
    useScapiFetcherEffect(updateAddressFetcher, {
        onSuccess: () => {
            addToast(t('addresses.updateSuccess'), 'success');
            setEditingAddressId(null);
            setUpdateAddressName('');
            void revalidator.revalidate();
        },
        onError: (errors) => {
            const errorMessage = errors?.length > 0 ? errors.join(', ') : t('addresses.updateError');
            addToast(errorMessage, 'error');
        },
    });

    // Handle successful set default
    useScapiFetcherEffect(setDefaultAddressFetcher, {
        onSuccess: () => {
            addToast(t('addresses.setDefaultSuccess'), 'success');
            setSettingDefaultAddress(null);
            void revalidator.revalidate();
        },
        onError: (errors) => {
            const errorMessage = errors?.length > 0 ? errors.join(', ') : t('addresses.setDefaultError');
            addToast(errorMessage, 'error');
            setSettingDefaultAddress(null);
        },
    });

    // Get the address being edited
    const editingAddress =
        editingAddressId && editingAddressId !== NEW_ADDRESS_ID
            ? addresses.find((addr) => addr.addressId === editingAddressId)
            : null;

    const hasAddresses = addresses.length > 0;

    return (
        <div className="space-y-5">
            {/* Page Header */}
            <Card className="bg-card border-border">
                <CardContent className="px-6 py-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-foreground mb-1">{t('navigation.addresses')}</h1>
                            <p className="text-sm text-muted-foreground">{t('addresses.subtitle')}</p>
                        </div>
                        <Button onClick={handleAdd} className="">
                            <Plus className="w-4 h-4" />
                            {t('addresses.addNewAddress')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Empty State */}
            {!hasAddresses && (
                <Card className="p-8 text-center">
                    <div className="flex flex-col items-center gap-4">
                        <div className="text-muted-foreground">
                            <p className="text-sm font-medium">{t('addresses.noSavedAddresses')}</p>
                            <p className="text-sm mt-1">{t('addresses.empty')}</p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Addresses Content */}
            {hasAddresses && (
                <div className="flex flex-col gap-4">
                    {/* Existing Address Cards */}
                    {addresses.map((address) => (
                        <AddressCard
                            key={address.addressId}
                            address={address}
                            onEdit={() => handleEdit(address.addressId)}
                            onRemove={() => handleRemove(address)}
                            onSetDefault={() => handleSetDefault(address)}
                            isPreferred={address.preferred || false}
                            isSettingDefault={settingDefaultAddress?.addressId === address.addressId}
                        />
                    ))}
                </div>
            )}

            {/* Add New Address Dialog */}
            <Dialog
                open={editingAddressId === NEW_ADDRESS_ID}
                onOpenChange={(open) => {
                    if (!open) {
                        handleCancel();
                    }
                }}>
                {editingAddressId === NEW_ADDRESS_ID && (
                    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{t('addresses.addNewAddress')}</DialogTitle>
                        </DialogHeader>
                        <UITarget targetId="sfcc.myAccount.address.autocomplete">
                            <CustomerAddressForm
                                key={NEW_ADDRESS_ID}
                                initialData={undefined}
                                updateFetcher={createAddressFetcher}
                                isFirstAddress={addresses.length === 0}
                                onSuccess={(_formData: CustomerAddressFormData) => {
                                    // Success is handled by useScapiFetcherEffect
                                }}
                                onError={(_error: string) => {
                                    // Error is handled by useScapiFetcherEffect
                                }}
                                onCancel={handleCancel}
                            />
                        </UITarget>
                    </DialogContent>
                )}
            </Dialog>

            {/* Edit Address Dialog */}
            <Dialog
                open={editingAddressId !== null && editingAddressId !== NEW_ADDRESS_ID}
                onOpenChange={(open) => {
                    if (!open) {
                        handleCancel();
                    }
                }}>
                {editingAddressId !== null && editingAddressId !== NEW_ADDRESS_ID && (
                    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{t('addresses.editAddress')}</DialogTitle>
                        </DialogHeader>
                        <UITarget targetId="sfcc.myAccount.address.autocomplete">
                            {editingAddress && (
                                <CustomerAddressForm
                                    key={editingAddress.addressId}
                                    initialData={{
                                        addressId: editingAddress.addressId,
                                        firstName: editingAddress.firstName || '',
                                        lastName: editingAddress.lastName || '',
                                        phone: editingAddress.phone || '',
                                        countryCode: (editingAddress.countryCode as 'US' | 'CA') || 'US',
                                        address1: editingAddress.address1 || '',
                                        address2: editingAddress.address2 || '',
                                        city: editingAddress.city || '',
                                        stateCode: editingAddress.stateCode || '',
                                        postalCode: editingAddress.postalCode || '',
                                        preferred: editingAddress.preferred || false,
                                    }}
                                    updateFetcher={updateAddressFetcher}
                                    onSuccess={(_formData: CustomerAddressFormData) => {
                                        // Success is handled by useScapiFetcherEffect
                                    }}
                                    onError={(_error: string) => {
                                        // Error is handled by useScapiFetcherEffect
                                    }}
                                    onCancel={handleCancel}
                                />
                            )}
                        </UITarget>
                    </DialogContent>
                )}
            </Dialog>
            <UITarget targetId="sfcc.myAccount.address.validation" />

            {/* Remove Confirmation Dialog */}
            {addressToRemove && (
                <RemoveAddressConfirmationDialog
                    open={!!addressToRemove}
                    onOpenChange={(open) => {
                        if (!open) {
                            setAddressToRemove(null);
                        }
                    }}
                    address={addressToRemove}
                    customerId={customerId || ''}
                    onSuccess={() => {
                        // After removal, check if only one address remains
                        const remainingAddresses = addresses.filter(
                            (addr) => addr.addressId !== addressToRemove.addressId
                        );
                        // If only one address remains and it's not already default, set it as default
                        if (remainingAddresses.length === 1 && !remainingAddresses[0].preferred) {
                            setSettingDefaultAddress(remainingAddresses[0]);
                        }
                        setAddressToRemove(null);
                    }}
                />
            )}
        </div>
    );
}

/**
 * Account addresses page component that uses Await to handle customer data loading.
 * Shows a skeleton while the customer data is being loaded.
 */
export default function AccountAddresses(): ReactElement {
    const { t } = useTranslation('account');
    // Get customer data from parent layout context
    const { customer: customerPromise } = useOutletContext<AccountLayoutContext>();

    return (
        <>
            <SeoMeta title={t('meta.addressesTitle', { defaultValue: 'Addresses' })} noIndex />
            <Suspense fallback={<AccountAddressesSkeleton />}>
                <Await resolve={customerPromise}>
                    {(customer: ShopperCustomers.schemas['Customer'] | null) => (
                        <AccountAddressesContent customer={customer} />
                    )}
                </Await>
            </Suspense>
        </>
    );
}
