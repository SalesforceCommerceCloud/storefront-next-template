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

// Brand logo. Renders the `/images/logo.svg` raster asset. A brand can ship a
// bespoke (e.g. inline-SVG) logo by overriding this whole component at
// `@/components/logo`. Keeping the logo behind a component (instead of a
// hardcoded `<img>`) lets the error page and any other consumer pick up the
// active brand's logo.
import logo from '/images/logo.svg';
import type { ComponentProps } from 'react';

type LogoProps = Pick<ComponentProps<'img'>, 'className' | 'alt' | 'width' | 'height'>;

export default function Logo({ className, alt = 'Logo', width, height }: LogoProps) {
    return <img src={logo} alt={alt} className={className} width={width} height={height} />;
}
