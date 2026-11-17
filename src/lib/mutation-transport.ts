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
import { data } from 'react-router';
export type UnknownPreferenceOutcome = {
    success: false;
    outcome: 'unknown';
    error: 'outcome_unknown';
};

/** Native serverAction runs once. Lost transport is not evidence that a write failed. */
export async function containMutationTransport<T>(serverAction: () => Promise<T>) {
    try {
        return await serverAction();
    } catch (error) {
        const fetchFailure =
            error instanceof TypeError &&
            ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'].includes(
                error.message
            );
        // React Router 7.18.2's single-fetch decoder emits this exact error.
        const decodeFailure =
            error instanceof Error &&
            error.name === 'Error' &&
            error.message === 'Unable to decode turbo-stream response';
        if (!fetchFailure && !decodeFailure) throw error;
        return data<UnknownPreferenceOutcome>(
            { success: false, outcome: 'unknown', error: 'outcome_unknown' },
            { status: 503 }
        );
    }
}
