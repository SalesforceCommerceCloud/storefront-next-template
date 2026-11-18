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

/** Theme recipes supported by Commerce Client widget 1.57.0+. Resolution belongs to the widget. */
export interface CommerceClientTheme {
    preset?: 'legacy' | 'commerce';
    density?: 'compact' | 'comfortable';
    shape?: 'sharp' | 'soft' | 'round';
    elevation?: 'flat' | 'raised';
    tokens?: Partial<Record<CommerceClientThemeToken, string | 0>>;
    /** Host-only launcher label. Blank keeps a static icon with the widget's accessible name. */
    fabIconLabel?: string;
    // Existing flat theme fields remain supported by the widget.
    primaryColor?: string;
    secondaryColor?: string;
    fontColor?: string;
    fontFamily?: string;
    backgroundColor?: string;
    borderColor?: string;
    inputBorderColor?: string;
    borderRadius?: string | 0;
}

export type CommerceClientThemeToken =
    | 'primary'
    | 'secondary'
    | 'text'
    | 'fontFamily'
    | 'surface'
    | 'border'
    | 'inputBorder'
    | 'canvas'
    | 'muted'
    | 'subtle'
    | 'outline'
    | 'foreground'
    | 'onPrimary'
    | 'focus'
    | 'variantSelection'
    | 'variantSelectionHover'
    | 'variantSelectionText'
    | 'variantSelectionBorder'
    | 'variantSelectionHoverBorder'
    | 'loaderStart'
    | 'loaderEnd'
    | 'sendIdleBackground'
    | 'sendIdleForeground'
    | 'sendBackground'
    | 'sendHoverBackground'
    | 'productFontFamily'
    | 'cardRadius'
    | 'controlRadius'
    | 'composerRadius'
    | 'chipRadius'
    | 'mediaRadius'
    | 'transcriptPadding'
    | 'mobileTranscriptPadding'
    | 'cardPadding'
    | 'transcriptGap'
    | 'carouselGap'
    | 'headerHeight'
    | 'controlSize'
    | 'cardShadow'
    | 'headerShadow'
    | 'launcherShadow'
    | 'launcherAnimation'
    | 'headerBackground'
    | 'headerText'
    | 'headerFontSize'
    | 'headerFontWeight'
    | 'headerFontFamily';

/** Default new integrations to Commerce without changing existing flat theme objects. */
export function resolveWidgetTheme(theme?: CommerceClientTheme): CommerceClientTheme {
    return theme && typeof theme === 'object' && !Array.isArray(theme) ? theme : { preset: 'commerce' };
}
