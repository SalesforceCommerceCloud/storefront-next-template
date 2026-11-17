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
import { expect, it, vi } from 'vitest';
import { containMutationTransport } from './mutation-transport';

it.each([
    new TypeError('Failed to fetch'),
    new TypeError('NetworkError when attempting to fetch resource.'),
    new TypeError('Load failed'),
    new Error('Unable to decode turbo-stream response'),
])('contains recognized transport failure without replay: %s', async (error) => {
    const serverAction = vi.fn().mockRejectedValue(error);
    const result = await containMutationTransport(serverAction);
    expect(serverAction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ data: { success: false, outcome: 'unknown' }, init: { status: 503 } });
    expect(JSON.stringify(result)).not.toContain(error.message);
});

it.each([
    new TypeError('Cannot read properties of undefined'),
    new Error('Server defect'),
    new DOMException('Aborted', 'AbortError'),
    new Response('Unauthorized', { status: 401 }),
    { status: 500, statusText: 'Server error', data: 'route error', internal: true },
])('rethrows unrelated failures unchanged: %s', async (error) => {
    await expect(containMutationTransport(vi.fn().mockRejectedValue(error))).rejects.toBe(error);
});

it('preserves native action results without wrapping or replay', async () => {
    const result = { success: true };
    const serverAction = vi.fn().mockResolvedValue(result);
    expect(await containMutationTransport(serverAction)).toBe(result);
    expect(serverAction).toHaveBeenCalledTimes(1);
});
