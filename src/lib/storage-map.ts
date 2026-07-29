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

/* oxlint-disable @typescript-eslint/no-explicit-any */
export type StorageMetaData = { isUpdated?: boolean; isDestroyed?: boolean };
export type StorageErrorData = { error?: string };

// The keys within a middleware storage container that are related to storing metadata
export const storageMetaKeys = Object.freeze(['isUpdated', 'isDestroyed', 'error']);

/**
 * Unpacks the public portion of stored data from a given metadata-aware storage
 * container.
 */
export const unpackStorage = <T extends Record<string, any>>(
    storage: Map<
        keyof (T & StorageMetaData & StorageErrorData),
        (T & StorageMetaData & StorageErrorData)[keyof (T & StorageMetaData & StorageErrorData)]
    >
): T & StorageErrorData => {
    const isDestroyed = storage.has('isDestroyed');
    const hasError = storage.has('error');
    const error = storage.get('error');
    if (isDestroyed || hasError) {
        return {
            ...(typeof error === 'string' && error.length && { error }),
        };
    }

    // oxlint-disable-next-line @typescript-eslint/no-unused-vars
    const { isUpdated, ...rest } = Object.fromEntries(storage) satisfies T;
    return rest;
};

/**
 * Clear the given metadata-aware storage container. If `includeMeta` is set to `false`, the metadata keys
 * will not be cleared.
 */
export const clearStorage = <T extends Record<string, any>>(
    storage: Map<
        keyof (T & StorageMetaData & StorageErrorData),
        (T & StorageMetaData & StorageErrorData)[keyof (T & StorageMetaData & StorageErrorData)]
    >,
    includeMeta = true
): void => {
    for (const [key] of storage) {
        if (includeMeta || !storageMetaKeys.includes(key as string)) {
            storage.delete(key);
        }
    }
};

export const updateStorage = <T extends Record<string, any>>(
    storage: Map<
        keyof (T & StorageMetaData & StorageErrorData),
        (T & StorageMetaData & StorageErrorData)[keyof (T & StorageMetaData & StorageErrorData)]
    >,
    updater: (obj: (T & StorageErrorData) | undefined) => (T & StorageErrorData) | undefined
) => {
    // Extract/store current storage data
    const publicData = unpackStorage(storage);

    // Unset current storage data
    clearStorage(storage, false);

    // Retrieve updated data
    const updated = updater(publicData);

    // Update storage data using an updater method
    if (typeof updated === 'object' && updated !== null) {
        updateStorageObject(storage, updated);
    } else {
        // Mark storage as updated
        storage.set(
            'isUpdated',
            true as (T & StorageMetaData & StorageErrorData)[keyof (T & StorageMetaData & StorageErrorData)]
        );
    }
};

export const updateStorageObject = <T extends Record<string, any>>(
    storage: Map<
        keyof (T & StorageMetaData & StorageErrorData),
        (T & StorageMetaData & StorageErrorData)[keyof (T & StorageMetaData & StorageErrorData)]
    >,
    obj: T & StorageErrorData
) => {
    for (const [key, value] of Object.entries(obj) as [
        keyof (T & StorageErrorData),
        (T & StorageErrorData)[keyof (T & StorageErrorData)],
    ][]) {
        if (!storageMetaKeys.includes(key as string)) {
            storage.set(key, value);
        }
    }

    storage.set(
        'isUpdated',
        true as (T & StorageMetaData & StorageErrorData)[keyof (T & StorageMetaData & StorageErrorData)]
    );
};
