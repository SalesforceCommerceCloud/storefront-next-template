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

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDeploymentEnvironment } from './resolve-deployment-environment.mjs';

test('resolves case-insensitive logical labels to configured GitHub Environment names', () => {
    assert.equal(
        resolveDeploymentEnvironment('{"Test":" sandbox_target ","Development":"dev_target"}', 'test'),
        'sandbox_target'
    );
    assert.equal(
        resolveDeploymentEnvironment('{"Test":"sandbox_target","Development":"dev_target"}', 'development'),
        'dev_target'
    );
});

test('rejects malformed, missing, empty, duplicate, and unsupported mappings', () => {
    assert.throws(
        () => resolveDeploymentEnvironment('{invalid', 'test'),
        (error) => error instanceof Error && /JSON object/.test(error.message) && error.cause instanceof SyntaxError
    );
    assert.throws(() => resolveDeploymentEnvironment(undefined, 'test'), /JSON object/);
    assert.throws(() => resolveDeploymentEnvironment('[]', 'test'), /JSON object/);
    assert.throws(() => resolveDeploymentEnvironment('{"Test":""}', 'test'), /non-empty test mapping/);
    assert.throws(() => resolveDeploymentEnvironment('{"Test":"one","test":"two"}', 'test'), /duplicate mappings/);
    assert.throws(() => resolveDeploymentEnvironment('{"Test":"one"}', 'production'), /Unsupported deployment target/);
});
