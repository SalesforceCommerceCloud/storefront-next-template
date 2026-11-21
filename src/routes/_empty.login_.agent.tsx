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
import type { Route } from './+types/_empty.login_.agent';
import AgentEntryForm from '@/components/trusted-agent/entry-form';
import { loadTrustedAgentEntry, submitTrustedAgentEntry } from '@/lib/auth/trusted-agent/flow.server';

export const meta: Route.MetaFunction = () => [
    { title: 'Agent authorization' },
    { name: 'robots', content: 'noindex, nofollow' },
];
export const loader = ({ request, context }: Route.LoaderArgs) => loadTrustedAgentEntry(request, context);
export const action = ({ request, context }: Route.ActionArgs) => submitTrustedAgentEntry(request, context);

export default function AgentEntry({ loaderData, actionData }: Route.ComponentProps) {
    return <AgentEntryForm {...loaderData} error={actionData?.error} />;
}
