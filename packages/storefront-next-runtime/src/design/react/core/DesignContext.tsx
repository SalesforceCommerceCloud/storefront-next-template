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
import { type ClientApi, type ClientAcknowledgedEvent, type EventPayload } from '../../messaging-api';
import type { ShopperExperience } from '@/scapi-client/types';
import type { PageUpdateMode } from '../core/component.types';

/**
 * Type definition for the Design Context
 * Extends DesignState with additional design-time properties
 */
export interface DesignContextType {
    /** Whether design mode is currently active */
    isDesignMode: boolean;
    /** Client API for host communication */
    clientApi?: ClientApi;
    /** Whether the client is connected to the host */
    isConnected: boolean;
    /** The page designer config */
    pageDesignerConfig: EventPayload<ClientAcknowledgedEvent> | null;
    /** Page data that the client has retrieved */
    clientPage: ShopperExperience.schemas['Page'] | null;
    /** Sets the client page data */
    setClientPage: (page: ShopperExperience.schemas['Page']) => void;
    /** How the client applies page updates from the design layer. */
    pageUpdateMode: PageUpdateMode;
}

export const DesignContext = React.createContext<DesignContextType | null>(null);
export const useDesignContext = () => React.useContext(DesignContext);
