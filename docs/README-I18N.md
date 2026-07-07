# Internationalization (i18n)

This project uses `i18next` with `remix-i18next` for internationalization. The implementation follows a dual-instance architecture with server-side and client-side i18next instances.

## Quick Start

**For React Components:**

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
    const { t } = useTranslation('product');
    return <h1>{t('title')}</h1>;
}
```

**For Everything Else (loaders, actions, utilities, helpers, tests):**

```typescript
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// Client-side or non-component code
const { t } = getTranslation();
const message = t('product:title');

// Server-side (loaders/actions) - pass the context
export function loader(args: LoaderFunctionArgs) {
    const { t } = getTranslation(args.context);
    return { title: t('product:title') };
}
```

## Architecture Overview

The i18n layer is split between the **SDK** and the **template**:

- **SDK (`@salesforce/storefront-next-runtime/i18n`)** — generic infrastructure: middleware factory, context, shared interpolation config
- **SDK (`@salesforce/storefront-next-runtime/i18n/client`)** — browser-only client initialization
- **Template** — translations (`src/locales/`), configuration, type augmentation, root.tsx wiring

We maintain 2 separate instances of i18next:

1. **Server-side instance**: Has access to _all_ translations for the entire site
2. **Client-side instance**: Dynamically imports translations as static JavaScript chunks

Both instances support **dynamic language switching** at runtime without page reloads.

### Server-side and Client-side Flow

1. Server-side middleware detects the user locale and initializes i18next
2. Server has access to all translations from all locales and renders SSR content with translations
3. Client-side initializes its own i18next instance, reading the language from the HTML `lang` attribute to prevent hydration mismatches
    - The `initI18next()` function in `root.tsx` accepts an optional `{ language }` parameter to ensure consistency between server and client
4. When a translation is first requested, the client dynamically imports ALL translations for the current language
    - This triggers an HTTP request for a JavaScript chunk (e.g., `/assets/locales-en-[hash].js`)
    - The chunk is served as a **static asset** (pre-built, minified, and cached with long-term headers)
    - Much more efficient than an API endpoint: no server processing, CDN-friendly, immutable caching
5. All namespaces for that language are loaded and cached in memory
6. Subsequent translation requests use the cached data (no additional requests)
7. When users switch languages, the client loads the new language's translations dynamically (if not already cached) and updates the UI immediately

## Configuration

### Supported Languages and Currencies

Languages and currencies are configured in multiple places that must be kept in sync:

**1. `config.server.ts`** - Application-level configuration:

```typescript
site: {
    locale: 'en-GB',
    currency: 'GBP',
    supportedLocales: [
        {
            id: 'en-GB',
            preferredCurrency: 'GBP',
        },
        {
            id: 'es-MX',
            preferredCurrency: 'MXN',
        },
        // Add more locales here...
    ],
    // Currencies that users can manually select
    supportedCurrencies: ['MXN', 'GBP'],
},
i18n: {
    fallbackLng: 'en-GB',
    supportedLngs: ['es-MX', 'en-GB'], // Your supported languages
}
```

**2. `src/middlewares/i18next.server.ts`** reads `supportedLngs` and `fallbackLng` from config automatically — no additional middleware configuration is needed.

> **⚠️ IMPORTANT**: These configurations must be kept in sync:
>
> - The locales in `i18n.supportedLngs` should match the `id` values in `site.supportedLocales`
> - Each locale in `site.supportedLocales` should have a `preferredCurrency` that matches one of the `site.supportedCurrencies`
> - If you add a new language, update both places

**Currency System:**

The application supports independent locale and currency switching:

1. **Locale-based currency**: Each locale in `supportedLocales` has a `preferredCurrency` that's used by default
2. **Manual currency selection**: Users can manually select any currency from `supportedCurrencies`, which takes precedence over the locale's preferred currency
3. **Currency priority**: User's manual selection (cookie) → Locale's preferred currency → Default site currency

See the Currency Switcher component in `src/components/currency-switcher/` for the implementation.

### Locale Detection

The middleware automatically detects the user's locale from:

1. The `lng` cookie (if previously set)
2. The `Accept-Language` HTTP header
3. Falls back to the configured `fallbackLng`

### Switching Languages and Currencies at Runtime

#### Language Switching

Users can switch languages dynamically without reloading the page using the `LocaleSwitcher` component. The language change happens in two steps:

1. **Client-side update**: Immediately changes the displayed language using i18next's `changeLanguage()` method
2. **Server-side persistence**: Submits to a server action that sets the `lng` cookie to persist the preference across page reloads

**Using the LocaleSwitcher Component:**

The project includes a pre-built `LocaleSwitcher` component that you can drop into your UI:

```typescript
import LocaleSwitcher from '@/components/locale-switcher';

export function Footer() {
    return (
        <footer>
            {/* Other footer content */}
            <LocaleSwitcher />
        </footer>
    );
}
```

#### Currency Switching

Users can manually select a currency independent of their locale using the `CurrencySwitcher` component. When a new currency is switched:

1. Server will submit an server action
2. Middlewares (client and server) will run to update latest currency into context
3. `updateBasket` is called to SCAPI to update currency accordingly
4. Loader func will revalidate and update the UI to reflect the selected currency

**Using the CurrencySwitcher Component:**

```typescript
import CurrencySwitcher from '@/components/currency-switcher';
import LocaleSwitcher from '@/components/locale-switcher';

export function Footer() {
    return (
        <footer>
            <div>
                <h3>Language</h3>
                <LocaleSwitcher />
            </div>
            <div>
                <h3>Currency</h3>
                <CurrencySwitcher />
            </div>
        </footer>
    );
}
```

**Key Points:**

- Currency selection is **independent** of locale
- Manual currency selection **takes precedence** over locale's preferred currency
- The preference persists across locale changes
- Falls back to locale's preferred currency if no manual selection is made

**Building Your Own Language Switcher:**

If you need a custom implementation, here's how to implement language switching:

```typescript
'use client';

import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';

export function MyLanguageSwitcher() {
    const { i18n } = useTranslation();
    const fetcher = useFetcher();

    const handleLanguageChange = async (newLocale: string) => {
        // Step 1: Change language client-side for immediate UX
        await i18n.changeLanguage(newLocale);

        // Step 2: Persist to server cookie for page reloads
        const formData = new FormData();
        formData.append('locale', newLocale);
        void fetcher.submit(formData, {
            method: 'POST',
            action: '/action/set-locale',
        });
    };

    return (
        <select
            value={i18n.language}
            onChange={(e) => void handleLanguageChange(e.target.value)}
        >
            <option value="en">English</option>
            <option value="es">Spanish</option>
        </select>
    );
}
```

**How It Works:**

The `/action/set-locale` server action (located at `src/routes/action.set-locale.ts`) receives the POST request and sets the `lng` cookie using the same cookie object that the middleware uses for detection:

```typescript
import { data, type ActionFunction } from 'react-router';
import { localeCookie } from '@/middlewares/i18next.server';

export const action: ActionFunction = async ({ request }) => {
    const formData = await request.formData();
    const locale = formData.get('locale') as string;

    if (!locale) {
        throw new Response('Locale is required', { status: 400 });
    }

    const cookieHeader = await localeCookie.serialize(locale);

    return data(
        { success: true },
        {
            headers: {
                'Set-Cookie': cookieHeader,
            },
        }
    );
};
```

**Key Points:**

- Language changes are immediate (no page reload required)
- The preference persists across sessions via the `lng` cookie
- All client-side translations are loaded as static assets (one JavaScript chunk per language)
- Switching languages triggers the dynamic import of the new language's translations if not already loaded

## File Structure

```
src/locales/
├── index.ts                # Exports all language resources
├── en-GB/
│   ├── index.ts            # Exports English translations
│   └── translations.json   # All English translations (namespaced)
└── es-MX/
    ├── index.ts            # Exports Spanish translations
    └── translations.json   # All Spanish translations (namespaced)

src/extensions/
├── my-extension/
│   └── locales/
│       ├── en/
│       │   └── translations.json   # Extension translations (English)
│       └── es/
│           └── translations.json   # Extension translations (Spanish)
└── locales/                # Auto-generated (do not edit manually)
    ├── en/
    │   └── index.ts        # Aggregated extension translations
    └── es/
        └── index.ts        # Aggregated extension translations

src/components/
└── locale-switcher/
    └── index.tsx           # Client component for switching languages

src/middlewares/
└── i18next.server.ts       # Thin wrapper around SDK's createI18nMiddleware()

src/routes/
└── action.set-locale.ts    # Server action to persist locale preference
```

The i18n utilities (`getTranslation`, `getLocale`, `mockI18nContext`, `createI18nMiddleware`, `initI18next`) are provided by the SDK and split across two subpaths:

- `@salesforce/storefront-next-runtime/i18n` — server-capable APIs (`getTranslation`, `getLocale`, `mockI18nContext`, `createI18nMiddleware`). Safe to import from server modules, route modules, and components.
- `@salesforce/storefront-next-runtime/i18n/client` — **browser-only** APIs (`initI18next`). This entry pulls in `i18next-browser-languagedetector`, which has no Node support, so it must only be imported from client-side code (e.g. inside `useEffect` in `root.tsx`). Importing it from a `*.server.ts` file will fail to bundle and is blocked by ESLint.

They do not live in `src/lib/` anymore.

## Usage Examples

### In React Components

Use the [`useTranslation`](https://react.i18next.com/latest/usetranslation-hook) hook from `react-i18next`:

```typescript
import { useTranslation } from 'react-i18next';

function ProductInfo() {
    // Specify the namespace to load
    const { t } = useTranslation('product');
    // NOTE: without passing in a namespace, the above hook would use `translation` namespace by default.
    // Since we don't have such namespace in our translations, the `t('namespace:key')` would still work,
    // but its autocomplete would no longer work in your IDE.

    return (
        <div>
            <h1>{t('title')}</h1>
            <p>{t('description')}</p>
            <button>{t('addToCart')}</button>
        </div>
    );
}
```

**With multiple namespaces:**

```typescript
import { useTranslation } from 'react-i18next';

function ProductPage() {
    // Load multiple namespaces at once
    const { t } = useTranslation(['home', 'product']);

    return (
        <div>
            <h1>{t('home:title')}</h1>
            <p>{t('product:description')}</p>
            <button>{t('product:addToCart')}</button>
        </div>
    );
}
```

**With interpolation:**

```typescript
const { t } = useTranslation('cart');
const message = t('itemCount.other', { count: 5 }); // "Cart (5 items)"
```

**With pluralization:**

```typescript
const { t } = useTranslation('cart');
const text = t('summary.itemsInCart', { count: 1 }); // "1 item in cart"
const text2 = t('summary.itemsInCart', { count: 3 }); // "3 items in cart"
```

### In Non-Component Code

Use the `getTranslation` utility for tests, utilities, or any non-React code:

```typescript
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// In tests
describe('ActionCard', () => {
    const { t } = getTranslation();

    test('shows edit button', () => {
        render(<ActionCard onEdit={vi.fn()} />);
        const button = screen.getByRole('button', { name: t('actionCard:edit') });
        expect(button).toBeInTheDocument();
    });
});

// In utility functions
export function getCountryName(countryCode: string): string {
    const { t } = getTranslation();
    return t(`countries:${countryCode}.name`, { defaultValue: countryCode });
}

// In form schemas (for Zod error messages)
const schema = z.object({
    email: z.string().email(t('error:validation.invalidEmail')),
});
```

### In Route Loaders and Actions (Server-side)

Use `getTranslation` with the context parameter for server-side translations:

```typescript
import { getTranslation, i18nextContext } from '@salesforce/storefront-next-runtime/i18n';
import type { LoaderFunctionArgs } from 'react-router';

export function loader(args: LoaderFunctionArgs) {
    // Get translations by passing the context
    const { t } = getTranslation(args.context);
    const translatedTitle = t('product:title');

    // Get the current locale for formatting (if needed)
    const i18nextData = args.context.get(i18nextContext);
    const locale = i18nextData?.getLocale() ?? 'en-GB';
    const date = new Date().toLocaleDateString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    return { translatedTitle, date };
}
```

**In actions with error handling:**

```typescript
import type { ActionFunctionArgs } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

export async function action(args: ActionFunctionArgs) {
    const { t } = getTranslation(args.context);

    try {
        // ... perform action
        return { success: true, message: t('product:addedToCart', { productName: 'Widget' }) };
    } catch (error) {
        return { success: false, message: t('error:api.unexpectedError') };
    }
}
```

## Adding New Translations

### Approach: Single JSON File Per Language

All translations are stored in a **single JSON file per language** with namespace-based organization.

#### Understanding Namespaces

i18next uses the concept of **namespaces** to organize translations into logical groups. In our implementation, namespaces are simply the **top-level keys** in each `translations.json` file. For example, `"common"`, `"product"`, `"checkout"`, and `"myNewFeature"` are all namespaces that help organize translations by feature or domain.

**src/locales/en/translations.json:**

```json
{
    "common": {
        "loading": "Loading",
        "product": "the product"
    },
    "product": {
        "title": "Product Details",
        "addToCart": "Add to Cart",
        "greeting": "Hello, {{name}}!",
        "itemCount": {
            "zero": "No items",
            "one": "{{count}} item",
            "other": "{{count}} items"
        }
    },
    "myNewFeature": {
        "welcome": "Welcome to the new feature"
    }
}
```

**src/locales/es/translations.json:**

```json
{
    "common": {
        "loading": "Cargando",
        "product": "el producto"
    },
    "product": {
        "title": "Detalles del Producto",
        "addToCart": "Agregar al Carrito",
        "greeting": "¡Hola, {{name}}!",
        "itemCount": {
            "zero": "Sin artículos",
            "one": "{{count}} artículo",
            "other": "{{count}} artículos"
        }
    },
    "myNewFeature": {
        "welcome": "Bienvenido a la nueva función"
    }
}
```

### Using Your New Translations

```typescript
// In React components
const { t } = useTranslation('myNewFeature');
<p>{t('welcome')}</p>

// In non-component code
const { t } = getTranslation();
const message = t('myNewFeature:welcome');

// Simple translation
<p>{t('title')}</p>

// With interpolation
<p>{t('greeting', { name: 'John' })}</p>

// With pluralization
<p>{t('itemCount', { count: items.length })}</p>
```

## Extension Translations

Extensions can have their own translation files that are automatically discovered and integrated into the i18n system. This allows extension authors to keep translations co-located with their extension code.

### File Structure for Extensions

Create translation files within your extension directory following this structure:

```
src/extensions/
├── my-extension/
│   ├── components/
│   ├── locales/
│   │   ├── en/
│   │   │   └── translations.json
│   │   └── es/
│   │       └── translations.json
│   └── index.ts
```

### Namespace Convention

Extension translations automatically use the `extPascalCase` naming convention based on the extension folder name:

- `store-locator` → `extStoreLocator`
- `bopis` → `extBopis`
- `my-extension` → `extMyExtension`

This convention prevents namespace collisions between extensions and core application translations.

### How Locale Discovery Works

**Important**: The locale aggregation command (`sfnext locales aggregate-extensions`) is specifically for **extension translations only**. Main app translations in `/src/locales/` are NOT aggregated by this command—they are imported directly.

The command scans **two locations** to discover all supported locales:

1. **Main app locales**: `/src/locales/{locale}/`
2. **Extension locales**: `/src/extensions/{extension-name}/locales/{locale}/`

The command merges locales from both sources and generates **extension-only** aggregation files under `/src/extensions/locales/` for each discovered locale. This means:

- If your main app supports Spanish (`es-MX`) but none of your extensions have Spanish translations, an empty aggregation file is still generated for `es-MX`
- If an extension provides translations for a locale not in the main app, those translations are still aggregated (though the main app won't use them unless configured)
- Extensions without a `locales` folder are automatically skipped - no error is thrown

**Example scenario:**

- Main app: `en-GB`, `es-MX`, `fr-FR` translations
- Extension A: `en-GB`, `es-MX` translations
- Extension B: `en-GB` translations only
- Extension C: No `locales` folder

**Result:** Extension aggregation files generated in `/src/extensions/locales/` for `en-GB`, `es-MX`, and `fr-FR`:

- `en-GB/index.ts`: Contains Extension A + Extension B translations only
- `es-MX/index.ts`: Contains Extension A translations only
- `fr-FR/index.ts`: Empty (no extensions have it)

**Note:** Main app translations remain in `/src/locales/` and are not affected by this aggregation process.

### Adding Translations to an Extension

**1. Create the translation files:**

Create `locales/{lang}/translations.json` within your extension directory for each supported language.

**Example: `src/extensions/bopis/locales/en/translations.json`**

```json
{
    "deliveryOptions": {
        "title": "Delivery:",
        "pickupOrDelivery": {
            "shipToAddress": "Ship to Address",
            "pickUpInStore": "Pick Up in Store"
        }
    },
    "storePickup": {
        "title": "Store Pickup Location",
        "viewButton": "View",
        "closeButton": "Close"
    }
}
```

**2. Translations are automatically aggregated:**

When you run `pnpm dev` or `pnpm build`, the system automatically:

- Discovers all extension translation files
- Aggregates them with the appropriate namespace
- Makes them available to your extension code

No manual configuration is required.

### Using Extension Translations

**In React Components:**

```typescript
import { useTranslation } from 'react-i18next';

export function DeliveryOptions() {
    // Use your extension's namespace
    const { t } = useTranslation('extBopis');

    return (
        <div>
            <h3>{t('deliveryOptions.title')}</h3>
            <button>{t('deliveryOptions.pickupOrDelivery.pickUpInStore')}</button>
        </div>
    );
}
```

**In Non-Component Code:**

```typescript
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

export function getDeliveryMessage() {
    const { t } = getTranslation();
    // Use namespace prefix with colon
    return t('extBopis:deliveryOptions.title');
}
```

**In Route Loaders/Actions:**

```typescript
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { LoaderFunctionArgs } from 'react-router';

export function loader(args: LoaderFunctionArgs) {
    const { t } = getTranslation(args.context);
    return {
        message: t('extBopis:storePickup.title'),
    };
}
```

## Using a Different i18n Library

The SDK's i18n support (`@salesforce/storefront-next-runtime/i18n`) is built on i18next. If you prefer a different library (e.g., `next-intl`, `formatjs`, `lingui`), you can replace the i18n layer entirely:

1. **Skip the SDK's i18n subpath** — do not import from `@salesforce/storefront-next-runtime/i18n` or `@salesforce/storefront-next-runtime/i18n/client`
2. **Locale resolution still works** — the site-context system (`createSiteContextMiddleware`, locale detection from URL/cookie/header, `SiteProvider`) is i18n-library-agnostic and handles determining the active locale
3. **Write your own middleware** — replace `src/middlewares/i18next.server.ts` with a middleware that initializes your chosen library, reading the resolved locale from `requestToLocaleMap` (exported from `@salesforce/storefront-next-runtime/site-context`)
4. **Write your own client init** — replace the `initI18next()` call in `root.tsx` with your library's initialization
5. **Bridge to SiteProvider** — pass the current language string to `SiteProvider`'s `language` prop (it accepts a plain `string`, no i18next dependency)
6. **Chunk splitting still works** — the Vite `i18nPlugin` splits any files matching `/src/locales/([^/]+)/` into per-language chunks, regardless of i18n library

The SDK separates **locale resolution** (which locale is active) from **translation** (turning keys into strings). Only the translation layer is i18next-specific.

## Best Practices

1. **Namespace by Route/Feature**: Organize translations by feature area (e.g., `product`, `checkout`, `account`)
2. **Use the Right Tool**:
    - **React components**: Use `useTranslation()` hook
    - **Everything else**: Use `getTranslation()` function
        - Non-component code (tests, utilities, schemas): `getTranslation()`
        - Server-side loaders/actions: `getTranslation(context)`
3. **Use TypeScript**: The project includes type-safe translations based on the English locale
4. **Interpolation**: Use `{{variable}}` syntax in translation strings (not `{variable}`)
5. **Pluralization**: Use nested objects with `zero`, `one`, `other` keys for count-based translations
6. **Lazy Loading**: Client-side translations are loaded on-demand when first requested
7. **Fallback Chain**: Missing translations fall back to the configured `fallbackLng` (English)

## Type Safety

The project is configured for type-safe translations. TypeScript will autocomplete available keys and warn about missing translations:

```typescript
// ✅ TypeScript knows these keys exist
const { t } = useTranslation('product');
t('title');
t('addToCart');

// With namespace prefix in non-component code
const { t } = getTranslation();
t('product:title');
t('cart:empty.title');

// ❌ TypeScript will warn about this
t('nonexistent.key');
```

Type definitions are generated from the English locale (`resources['en-GB']`) in `src/middlewares/i18next.server.ts`:

```typescript
declare module 'i18next' {
    interface CustomTypeOptions {
        resources: (typeof resources)['en-GB']; // Use `en-GB` as source of truth for the types
    }
}
```

---

# Migration Gotchas

During the migration to i18next translations in PR [#447](https://github.com/SalesforceCommerceCloud/storefront-next/pull/447), a lot of the necessary changes have been done for you. There were some migration gotchas, and here are the important ones that you need to be aware of.

## 1. Validation Schema Factories

### Problem: Race Conditions with Module-Level Schemas

**Symptom**: Validation messages show as keys (e.g., `checkout:contactInfo.emailRequired`) instead of translated text.

**Root Cause**: Zod schemas created at module load time execute before i18next initializes in server-rendered apps, where client-side i18next initialization is separate from server-side.

### Solution: Factory Pattern

Convert module-level schema exports to factory functions that accept `t`:

**Before:**

```typescript
import uiStrings from '@/temp-ui-string';

export const contactInfoSchema = z.object({
    email: z
        .string()
        .min(1, uiStrings.checkout.contactInfo.emailRequired)
        .email(uiStrings.checkout.contactInfo.emailInvalid),
});
```

**After:**

```typescript
import type { TFunction } from 'i18next';

export const createContactInfoSchema = (t: TFunction) => {
    return z.object({
        email: z.string().min(1, t('checkout:contactInfo.emailRequired')).email(t('checkout:contactInfo.emailInvalid')),
    });
};
```

**Usage in Components:**

```typescript
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createContactInfoSchema } from '@/lib/checkout/schemas';

function ContactForm() {
    const { t } = useTranslation();
    const schema = useMemo(() => createContactInfoSchema(t), [t]);

    const form = useForm({
        resolver: zodResolver(schema),
        // ...
    });
}
```

**Key Points:**

- Use `useMemo` to avoid recreating schema on every render
- Add `[t]` to dependency array
- Factory pattern ensures `t()` is called at runtime, not module load time

---

## 2. Mocking react-router for Test Environments

### Problem: Test setup fails when i18next middleware tries to use react-router's createCookie

**Symptom**: Tests or Storybook fail with this error:

```
Caused by: Error: [vitest] No "createCookie" export is defined on the "react-router" mock.
Did you forget to return it from "vi.mock"?
```

**Root Cause**: The i18next middleware depends on `createCookie` from `react-router`, but in test environments (Vitest, Storybook), react-router may not be fully available or needs to be mocked.

### Solution

Make sure your own mock of react-router includes `createCookie`. For example, in [this file](../src/components/reset-password-form/stories/index-snapshot.tsx):

```typescript
vi.mock('react-router', () => ({
    createCookie: (name: string) => ({
        name,
        parse: () => null,
        serialize: () => '',
    }),
    createContext: vi.fn().mockImplementation(() => ({})),
    ...
}))
```

---

## 3. Translation Key Format Changes

### Namespace Convention

**Before (flat structure):**

```typescript
uiStrings.checkout.shippingAddress.title;
```

**After (namespace:key):**

```typescript
const { t } = getTranslation();
t('checkout:shippingAddress.title');

// or with explicit namespace. You can pass in a namespace to the useTranslation hook.
const { t } = useTranslation('checkout');
t('shippingAddress.title');
```

**Namespace Guidelines:**

- Use colon separator: `namespace:key.path`
- Group related translations by feature/domain
- Common namespaces: `common`, `errors`, `validation`, `product`, `checkout`, `customer`, etc.
