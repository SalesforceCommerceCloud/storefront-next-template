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
import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { createShopperContext, getShopperContextHelpers } from './shopper-context.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { createTestContext } from '@/lib/test-utils';
import config from '@/config/server';

// Mock dependencies
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual || {}),
        getConfig: vi.fn(),
    };
});

const expectedSiteId = config.app.commerce.sites[0].id;

describe('shopper-context API', () => {
    let mockContext: Readonly<RouterContextProvider>;
    let mockShopperContextClient: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = createTestContext();
        mockShopperContextClient = {
            createShopperContext: vi.fn().mockResolvedValue(undefined),
            updateShopperContext: vi.fn().mockResolvedValue({ data: { sourceCode: 'current-session' } }),
        };

        vi.mocked(getConfig).mockReturnValue({
            commerce: {
                api: {
                    organizationId: 'test-org-id',
                },
            },
        } as any);

        vi.mocked(createApiClients).mockReturnValue({
            shopperContext: mockShopperContextClient,
        } as any);
    });

    describe('getShopperContextHelpers', () => {
        test('shares the helper and resolved snapshot for an unchanged USID within one request', async () => {
            const first = getShopperContextHelpers(mockContext, 'session-a');
            const second = getShopperContextHelpers(mockContext, 'session-a');

            expect(second).toBe(first);
            await first.resolve();
            await second.resolve();
            expect(mockShopperContextClient.updateShopperContext).toHaveBeenCalledOnce();
        });

        test('discards the old snapshot and targets the new USID after a session change', async () => {
            mockShopperContextClient.updateShopperContext
                .mockResolvedValueOnce({ data: { sourceCode: 'session-a' } })
                .mockResolvedValueOnce({ data: { sourceCode: 'session-b' } });
            const first = getShopperContextHelpers(mockContext, 'session-a');
            expect(await first.resolve()).toEqual({ sourceCode: 'session-a' });

            const second = getShopperContextHelpers(mockContext, 'session-b');
            expect(second).not.toBe(first);
            expect(await second.resolve()).toEqual({ sourceCode: 'session-b' });
            await second.update({ sourceCode: 'email' });
            expect(mockShopperContextClient.updateShopperContext).toHaveBeenLastCalledWith({
                params: { path: { usid: 'session-b' } },
                body: { sourceCode: 'email' },
            });

            // Returning to an earlier identity must not resurrect its pre-transition snapshot.
            const third = getShopperContextHelpers(mockContext, 'session-a');
            expect(third).not.toBe(first);
            expect(third).not.toBe(second);
            await third.resolve();
            expect(mockShopperContextClient.updateShopperContext).toHaveBeenCalledTimes(4);
        });

        test('does not share helpers or snapshots between requests with the same USID', async () => {
            const first = getShopperContextHelpers(mockContext, 'session-a');
            const second = getShopperContextHelpers(createTestContext(), 'session-a');

            expect(second).not.toBe(first);
            await first.resolve();
            await second.resolve();
            expect(mockShopperContextClient.updateShopperContext).toHaveBeenCalledTimes(2);
        });
    });

    describe('createShopperContext', () => {
        test('should call API with correct parameters', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };

            await createShopperContext(mockContext, usid, body);

            expect(createApiClients).toHaveBeenCalledWith(mockContext);
            expect(mockShopperContextClient.createShopperContext).toHaveBeenCalledWith({
                params: {
                    path: {
                        organizationId: 'test-org-id',
                        usid,
                    },
                    query: {
                        siteId: expectedSiteId,
                    },
                },
                body: expect.objectContaining({ sourceCode: 'email' }),
            });
        });

        test('should throw error when context is null', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };

            await expect(createShopperContext(null as any, usid, body)).rejects.toThrow('Context is required');

            // Should not call API when context is invalid
            expect(createApiClients).not.toHaveBeenCalled();
        });

        test('should throw error when context is undefined', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };

            await expect(createShopperContext(undefined as any, usid, body)).rejects.toThrow('Context is required');

            // Should not call API when context is invalid
            expect(createApiClients).not.toHaveBeenCalled();
        });

        test('should throw error when usid is empty string', async () => {
            const usid = '';
            const body = { sourceCode: 'email' };

            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'USID is required and must be a non-empty string'
            );

            // Should not call API when usid is invalid
            expect(mockShopperContextClient.createShopperContext).not.toHaveBeenCalled();
        });

        test('should throw error when usid is whitespace only', async () => {
            const usid = '   ';
            const body = { sourceCode: 'email' };

            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'USID is required and must be a non-empty string'
            );

            // Should not call API when usid is invalid
            expect(mockShopperContextClient.createShopperContext).not.toHaveBeenCalled();
        });

        test('should throw error when usid is not a string', async () => {
            const usid = 123 as any;
            const body = { sourceCode: 'email' };

            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'USID is required and must be a non-empty string'
            );

            // Should not call API when usid is invalid
            expect(mockShopperContextClient.createShopperContext).not.toHaveBeenCalled();
        });

        test('should throw error when usid is null', async () => {
            const usid = null as any;
            const body = { sourceCode: 'email' };

            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'USID is required and must be a non-empty string'
            );

            // Should not call API when usid is invalid
            expect(mockShopperContextClient.createShopperContext).not.toHaveBeenCalled();
        });

        test('should throw error when body is null', async () => {
            const usid = 'test-usid';
            const body = null as any;

            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'Body is required and must be a plain object'
            );

            // Should not call API when body is invalid
            expect(mockShopperContextClient.createShopperContext).not.toHaveBeenCalled();
        });

        test('should throw error when body is undefined', async () => {
            const usid = 'test-usid';
            const body = undefined as any;

            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'Body is required and must be a plain object'
            );

            // Should not call API when body is invalid
            expect(mockShopperContextClient.createShopperContext).not.toHaveBeenCalled();
        });

        test('should handle body that is not an object (string)', async () => {
            const usid = 'test-usid';
            const body = 'not-an-object' as any;

            // When body is a string, Object.keys() returns indices, so it passes validation
            // and the API is called. This is a limitation of the current implementation.
            await createShopperContext(mockContext, usid, body);

            // API is called because Object.keys('not-an-object') returns ['0', '1', ...]
            expect(mockShopperContextClient.createShopperContext).toHaveBeenCalled();
        });

        test('should throw error when body is empty object', async () => {
            const usid = 'test-usid';
            const body = {};

            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'Body must contain at least one field'
            );

            // Should not call API when body is empty
            expect(mockShopperContextClient.createShopperContext).not.toHaveBeenCalled();
        });

        test('should handle API errors and throw generic error with original message', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };
            const apiError = new Error('API Error');
            mockShopperContextClient.createShopperContext.mockRejectedValue(apiError);

            // API errors are caught and rethrown as generic error with original message
            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'An unexpected error occurred in createShopperContext: API Error'
            );
        });

        test('should handle network errors and throw generic error with original message', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };
            const networkError = new TypeError('Failed to fetch');
            mockShopperContextClient.createShopperContext.mockRejectedValue(networkError);

            // Network errors are caught and rethrown as generic error with original message
            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'An unexpected error occurred in createShopperContext: Failed to fetch'
            );
        });

        test('should handle non-Error exceptions and throw generic error with stringified value', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };
            // Simulate a non-Error exception (e.g., string thrown)
            mockShopperContextClient.createShopperContext.mockRejectedValue('String error');

            // Non-Error exceptions are caught and rethrown as generic error with stringified value
            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'An unexpected error occurred in createShopperContext: String error'
            );
        });

        test('should handle errors with empty message', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };
            const errorWithEmptyMessage = new Error('');
            mockShopperContextClient.createShopperContext.mockRejectedValue(errorWithEmptyMessage);

            // Errors with empty messages should still include the error prefix
            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'An unexpected error occurred in createShopperContext:'
            );
        });

        test('should handle getConfig errors', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };
            const configError = new Error('Config error');
            vi.mocked(getConfig).mockImplementation(() => {
                throw configError;
            });

            // Errors from getConfig should be caught and rethrown
            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'An unexpected error occurred in createShopperContext: Config error'
            );
        });

        test('should handle createApiClients errors', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };
            const clientsError = new Error('Failed to create clients');
            vi.mocked(createApiClients).mockImplementation(() => {
                throw clientsError;
            });

            // Errors from createApiClients should be caught and rethrown
            await expect(createShopperContext(mockContext, usid, body)).rejects.toThrow(
                'An unexpected error occurred in createShopperContext: Failed to create clients'
            );
        });

        test('should handle body with multiple qualifiers', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email', otherKey: 'value' };

            await createShopperContext(mockContext, usid, body);

            expect(mockShopperContextClient.createShopperContext).toHaveBeenCalledWith({
                params: {
                    path: {
                        organizationId: 'test-org-id',
                        usid,
                    },
                    query: {
                        siteId: expectedSiteId,
                    },
                },
                body: expect.objectContaining(body),
            });
        });

        test('should handle body with customQualifiers', async () => {
            const usid = 'test-usid';
            const body = {
                customQualifiers: {
                    deviceType: 'mobile',
                },
            };

            await createShopperContext(mockContext, usid, body);

            expect(mockShopperContextClient.createShopperContext).toHaveBeenCalledWith({
                params: {
                    path: {
                        organizationId: 'test-org-id',
                        usid,
                    },
                    query: {
                        siteId: expectedSiteId,
                    },
                },
                body: expect.objectContaining(body),
            });
        });

        test('should handle body with assignmentQualifiers', async () => {
            const usid = 'test-usid';
            const body = {
                assignmentQualifiers: {
                    store: 'store123',
                },
            };

            await createShopperContext(mockContext, usid, body);

            expect(mockShopperContextClient.createShopperContext).toHaveBeenCalledWith({
                params: {
                    path: {
                        organizationId: 'test-org-id',
                        usid,
                    },
                    query: {
                        siteId: expectedSiteId,
                    },
                },
                body: expect.objectContaining(body),
            });
        });

        test('should handle body with couponCodes', async () => {
            const usid = 'test-usid';
            const body = {
                couponCodes: ['code1', 'code2', 'code3'],
            };

            await createShopperContext(mockContext, usid, body);

            expect(mockShopperContextClient.createShopperContext).toHaveBeenCalledWith({
                params: {
                    path: {
                        organizationId: 'test-org-id',
                        usid,
                    },
                    query: {
                        siteId: expectedSiteId,
                    },
                },
                body: expect.objectContaining(body),
            });
        });

        test('should handle body with null couponCodes', async () => {
            const usid = 'test-usid';
            const body = {
                couponCodes: undefined,
                sourceCode: 'email',
            };

            await createShopperContext(mockContext, usid, body);

            expect(mockShopperContextClient.createShopperContext).toHaveBeenCalledWith({
                params: {
                    path: {
                        organizationId: 'test-org-id',
                        usid,
                    },
                    query: {
                        siteId: expectedSiteId,
                    },
                },
                body: expect.objectContaining(body),
            });
        });

        test('should handle body with all qualifier types', async () => {
            const usid = 'test-usid';
            const body = {
                sourceCode: 'email',
                customQualifiers: {
                    deviceType: 'mobile',
                },
                assignmentQualifiers: {
                    store: 'store123',
                },
                couponCodes: ['code1', 'code2'],
            };

            await createShopperContext(mockContext, usid, body);

            expect(mockShopperContextClient.createShopperContext).toHaveBeenCalledWith({
                params: {
                    path: {
                        organizationId: 'test-org-id',
                        usid,
                    },
                    query: {
                        siteId: expectedSiteId,
                    },
                },
                body: expect.objectContaining(body),
            });
        });

        test('should use correct organizationId and siteId from config', async () => {
            const usid = 'test-usid';
            const body = { sourceCode: 'email' };

            await createShopperContext(mockContext, usid, body);

            expect(mockShopperContextClient.createShopperContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({
                        path: expect.objectContaining({
                            organizationId: 'test-org-id',
                            usid: 'test-usid',
                        }),
                        query: expect.objectContaining({
                            siteId: expectedSiteId,
                        }),
                    }),
                })
            );
        });
    });
});
