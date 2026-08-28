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
import React from 'react';
import type { DesignStore } from './designStore';
import type { DesignState } from './DesignStateContext';

/**
 * Carries the external design-state store to consumers via `useDesignSelector`.
 * Runs alongside `DesignStateContext`, which remains the write-side source of
 * truth that the store mirrors.
 */
export const DesignStoreContext = React.createContext<DesignStore<DesignState> | null>(null);
