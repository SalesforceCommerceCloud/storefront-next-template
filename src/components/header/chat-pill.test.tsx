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
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChatPill from './chat-pill';

const openAgentWidget = vi.fn();
vi.mock('@/components/cimulate', () => ({ openAgentWidget: () => openAgentWidget() }));

describe('ChatPill', () => {
    it('shows the agent name next to the sparkle and opens the agent on click', () => {
        render(<ChatPill label="beauty advisor" />);
        const pill = screen.getByRole('button', { name: 'beauty advisor' });
        expect(pill).toHaveTextContent('beauty advisor');
        expect(pill.querySelector('svg')).not.toBeNull();
        fireEvent.click(pill);
        expect(openAgentWidget).toHaveBeenCalledTimes(1);
    });

    it('falls back to the "Open chat" string without a label', () => {
        render(<ChatPill />);
        expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument();
    });
});
