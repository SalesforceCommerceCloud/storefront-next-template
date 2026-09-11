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
import { getCardIcon } from './card-icon-utils';

describe('getCardIcon', () => {
    test('returns wrapper components for known card types', () => {
        const VisaWrapper = getCardIcon('Visa');
        const MastercardWrapper = getCardIcon('Mastercard');
        const AmexWrapper = getCardIcon('American Express');
        const DiscoverWrapper = getCardIcon('Discover');

        expect(typeof VisaWrapper).toBe('function');
        expect(typeof MastercardWrapper).toBe('function');
        expect(typeof AmexWrapper).toBe('function');
        expect(typeof DiscoverWrapper).toBe('function');

        expect(VisaWrapper).not.toBe(MastercardWrapper);
        expect(VisaWrapper).not.toBe(AmexWrapper);
        expect(MastercardWrapper).not.toBe(DiscoverWrapper);
    });

    test('accepts BM MasterCard id and spaced Master Card for the same icon', () => {
        const fromBm = getCardIcon('MasterCard');
        const fromSpaced = getCardIcon('Master Card');
        const fromDisplay = getCardIcon('Mastercard');
        const generic = getCardIcon('Unknown');

        expect(fromBm).toBe(fromSpaced);
        expect(fromBm).toBe(fromDisplay);
        expect(fromBm).not.toBe(generic);
    });

    test('returns GenericCardIcon for unknown card types', () => {
        const UnknownIcon = getCardIcon('Unknown');
        const RandomIcon = getCardIcon('Some Random Card');
        const EmptyIcon = getCardIcon('');
        const DinersIcon = getCardIcon('Diners Club');
        const JCBIcon = getCardIcon('JCB');

        expect(UnknownIcon).toBe(RandomIcon);
        expect(UnknownIcon).toBe(EmptyIcon);
        expect(UnknownIcon).toBe(DinersIcon);
        expect(UnknownIcon).toBe(JCBIcon);
        expect(typeof UnknownIcon).toBe('function');
    });

    test('matches card brands case-insensitively for icons only', () => {
        const GenericIcon = getCardIcon('Unknown');

        expect(getCardIcon('visa')).not.toBe(GenericIcon);
        expect(getCardIcon('VISA')).not.toBe(GenericIcon);
        expect(getCardIcon('Visa')).not.toBe(GenericIcon);
        expect(getCardIcon('amex')).not.toBe(GenericIcon);
    });
});
