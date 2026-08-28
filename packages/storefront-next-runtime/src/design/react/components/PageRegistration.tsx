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
import { useEffect } from 'react';
import { useDesignContext } from '../context/DesignContext';
import { usePageDesignerMode } from '../core/PageDesignerProvider';
import type { ShopperExperience } from '@/scapi-client/types';

/**
 * Wraps page designer page content and communicates page data back up to the host Page Designer.
 * @param props.page - The page data to communicate back to the host Page Designer.
 */
export function PageRegistration({
    page,
    children,
}: React.PropsWithChildren<{ page: ShopperExperience.schemas['Page'] }>) {
    const { setClientPage } = useDesignContext() ?? {};
    const { isDesignMode } = usePageDesignerMode();

    useEffect(() => {
        if (isDesignMode) {
            setClientPage?.(page);
        }
    }, [page, isDesignMode, setClientPage]);

    return <>{children}</>;
}
