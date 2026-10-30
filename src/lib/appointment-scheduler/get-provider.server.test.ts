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
import { describe, it, expect, vi } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { getAppointmentProvider } from './get-provider.server';
import type { Config } from '@/types/config';

vi.mock('./bff-provider.server', () => ({
    createBffAppointmentProvider: vi.fn(() => ({ name: 'bff' })),
}));

vi.mock('./scapi-provider.server', () => ({
    createScapiAppointmentProvider: vi.fn(() => ({ name: 'scapi' })),
}));

const mockContext = {} as RouterContextProvider;

describe('getAppointmentProvider', () => {
    it('returns BFF provider when config.features.appointment.provider is "bff"', () => {
        const config: Config['app'] = {
            features: {
                appointment: {
                    enabled: true,
                    provider: 'bff',
                },
            },
        } as Config['app'];

        const provider = getAppointmentProvider(config, mockContext);
        expect(provider.name).toBe('bff');
    });

    it('returns SCAPI provider when config.features.appointment.provider is "scapi"', () => {
        const config: Config['app'] = {
            features: {
                appointment: {
                    enabled: true,
                    provider: 'scapi',
                },
            },
        } as Config['app'];

        const provider = getAppointmentProvider(config, mockContext);
        expect(provider.name).toBe('scapi');
    });

    it('returns SCAPI provider by default when provider is not specified', () => {
        const config: Config['app'] = {
            features: {
                appointment: {
                    enabled: true,
                    provider: 'scapi',
                },
            },
        } as Config['app'];

        const provider = getAppointmentProvider(config, mockContext);
        expect(provider.name).toBe('scapi');
    });
});
