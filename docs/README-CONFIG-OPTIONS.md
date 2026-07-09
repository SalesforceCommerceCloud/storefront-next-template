# Configuration Options Reference

This reference provides detailed documentation for all configuration options available in `config.server.ts`. You can override any configuration value using environment variables with the `PUBLIC__` prefix. See the [Configuration Guide](./README-CONFIG.md) for details on environment variables.

## Configuration Categories

- [metadata](#metadata) - Project identification and metadata
- [runtime](#runtime) - Runtime deployment settings for MRT
- [app](#app) - Application-specific configuration
  - [pages](#pages) - Page-specific settings
  - [commerce](#commerce) - B2C Commerce API details
  - [siteAliasMap](#sitealiasmap) - Site alias mapping configuration
  - [hybrid](#hybrid) - Hybrid mode configuration
  - [auth](#auth) - Authentication configuration shared across all auth features
  - [features](#features) - Feature flags
  - [i18n](#i18n) - Internationalization settings
  - [global](#global) - Global UI and component settings
  - [links](#links) - Link hints for browser resource loading
  - [images](#images) - Salesforce [Dynamic Imaging Service](https://help.salesforce.com/s/articleView?id=cc.b2c_image_transformation_service.htm&type=5) settings
  - [search](#search) - Search-specific settings
  - [performance](#performance) - Performance optimization settings
  - [engagement](#engagement) - Analytics and engagement adapters
  - [cimulateAgent](#cimulateagent) - Commerce Client (Cimulate) messaging widget
  - [development](#development) - Development tools and features

---

## metadata

Project identification and metadata used throughout the application.

### projectName

Type: `string` | Default: `'Storefront Next Retail App'`

The display name of your project. This value can be used in application headers, error messages, or anywhere you need to reference the project name.

Example:
```bash
PUBLIC__metadata__projectName="My Custom Store"
```

---

### projectSlug

Type: `string` | Default: `'storefront-next-retail-app'`

A URL-safe identifier for your project. This slug is typically used for the MRT project ID. It can be used anywhere where a normalized identifier is needed.

Example:
```bash
PUBLIC__metadata__projectSlug="my-custom-store"
```

---

## runtime

Runtime deployment settings for Managed Runtime (MRT). These settings are server-only and aren't exposed to the client.

### defaultMrtProject

Type: `string` Optional | Default: `''`

The default MRT project identifier. This value can be overridden by the `MRT_PROJECT` environment variable during deployment.

---

### defaultMrtTarget

Type: `string` Optional | Default: `''`

The default MRT target environment (e.g., 'production', 'staging'). This value can be overridden by the `MRT_TARGET` environment variable during deployment.

Note: This value is reserved for future use and currently has no effect on the application.

---

### ssrOnly

Type: `string[]` Optional | Default: `['loader.js', 'ssr.js', '!static/**/*']`

An array of glob patterns for files that are available exclusively to the server-side rendering system. Files matching these patterns won't be included in client-side bundles. Use the `!` prefix to exclude patterns.

---

### ssrShared

Type: `string[]` Optional | Default: `['static/**/*', '**/*.css', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.ico', '**/*.woff', '**/*.woff2', '**/*.ttf', '**/*.eot']`

An array of glob patterns for files that are available to the server-side rendering system and available through the `/mobify/bundle/` path. These typically include static assets, stylesheets, and fonts.

---

### ssrParameters

Type: `Record<string, string | number | boolean>` Optional | Default: `{ ssrFunctionNodeVersion: '24.x' }`

Additional parameters for SSR function configuration. The `ssrFunctionNodeVersion` property is a string that determines which version of Node.js to use for running the application server.

---

## app

The main application configuration section containing all public settings that control the storefront behavior.

---

### app.defaultSiteId

Type: `string` | Default: `'RefArchGlobal'`

The default site ID to use when no site can be determined from the request. This acts as a fallback when site detection fails or when running in a single-site configuration.

Example:
```bash
PUBLIC__app__defaultSiteId="RefArch"
```

---

## pages

Page-specific configuration options that control the behavior and appearance of different pages in the storefront.

### pages.navigation.rootCategoryId

Type: `string` | Default: `'root'`

The category ID to use as the root of the navigation menu tree. This determines which category's children are displayed in the main site navigation.

This setting is particularly useful for:
- **Multi-brand sites**: Different storefronts can use different category hierarchies
- **Custom category structures**: Use a specific category as the navigation root instead of the B2C Commerce default 'root' category
- **A/B testing**: Test different navigation structures by changing the root category

Example:
```bash
# Use a custom root category (e.g., for ASICS brand)
PUBLIC__app__pages__navigation__rootCategoryId=asics-root

# Use a specific season's collection as the root
PUBLIC__app__pages__navigation__rootCategoryId=spring-2026-collection
```

**Industry Context**: This mirrors Adobe Commerce (Magento)'s multi-store root category capability, where each store view can have its own category tree root.

**Troubleshooting**:
- If navigation fails to load, verify the category ID exists in Business Manager and is marked as "online"
- Ensure the root category has online subcategories
- Check browser console for API errors related to category fetching

---

### pages.navigation.maxDepth

Type: `number` | Default: `2`

The maximum number of category levels to fetch and display in the navigation menu. This controls how deep the category tree goes.

- `1` = Top-level categories only (no subcategories)
- `2` = Top-level categories with one level of subcategories (default)

**Important**: The current implementation is limited to `maxDepth` of 2. Setting values higher than 2 will not fetch additional levels. The SFCC API returns a maximum of 2 levels per request, and the template implementation fetches up to this limit. If you need deeper navigation (3+ levels), you must customize the loader in `src/routes/_app.tsx` to implement recursive category fetching.

Example:
```bash
# Show only top-level categories (flat navigation)
PUBLIC__app__pages__navigation__maxDepth=1

# Show two levels (default)
PUBLIC__app__pages__navigation__maxDepth=2
```

**Industry Context**: Adobe Commerce (Magento) provides a similar "Maximal Depth" setting. Shopify has a hard limit of 3 levels.

**Use Cases**:
- **Simple navigation**: Set to `1` for a minimal, flat navigation menu
- **Standard navigation**: Keep at `2` (default) for most e-commerce sites
- **Performance optimization**: Reduce depth if you have a very large category tree

**Note**: The SCAPI automatically filters out offline categories server-side. Only categories with online status will be returned. To control which categories appear in navigation, set their online/offline status in Business Manager under **Merchant Tools > Products and Catalogs > Categories**.

---

### pages.home.featuredProductsCount

Type: `number` | Default: `12`

The number of products to display in the "Featured Products" carousel on the homepage.

Example:
```bash
PUBLIC__app__pages__home__featuredProductsCount=16
```

**Troubleshooting:** If you're seeing performance issues on the homepage, consider reducing this number. Ensure your B2C Commerce API can handle the product request size.

---

### pages.cart.quantityUpdateDebounce

Type: `number` | Default: `750`

The delay in milliseconds before a cart quantity update is sent to the server after the user stops clicking the increment or decrement button. This prevents excessive API calls while the user is adjusting quantities.

Example:
```bash
PUBLIC__app__pages__cart__quantityUpdateDebounce=1000
```

When a user changes the quantity of an item in their cart, the application waits this many milliseconds after the last interaction before sending the update request to the B2C Commerce API.

---

### pages.cart.enableRemoveConfirmation

Type: `boolean` | Default: `true`

When enabled, shows a confirmation modal before removing an item from the cart. The confirmation modal prevents accidental deletions.

Example:
```bash
PUBLIC__app__pages__cart__enableRemoveConfirmation=false
```

---

### pages.cart.confirmDescription

Type: `string` Optional | Default: `undefined`

The custom message to display in the remove confirmation modal. If not set, a default message will be used.

Example:
```bash
PUBLIC__app__pages__cart__confirmDescription="Are you sure you want to remove this item?"
```

---

### pages.cart.maxQuantityPerItem

Type: `number` | Default: `999`

The maximum quantity allowed for a single cart item. This option prevents users from adding unrealistic quantities and helps manage inventory.

Example:
```bash
PUBLIC__app__pages__cart__maxQuantityPerItem=100
```

---

### pages.cart.enableSaveForLater

Type: `boolean` | Default: `false`

When enabled, enables users to move cart items to a "saved for later" list. This feature requires additional API support.

Example:
```bash
PUBLIC__app__pages__cart__enableSaveForLater=true
```

---

### pages.cart.removeAction

Type: `string` | Default: `'/action/cart-item-remove'`

The action endpoint URL for removing items from the cart. Use this path for form submissions and server actions.

---

### pages.cart.ruleBasedProductLimit

Type: `number` | Default: `50`

The maximum number of items allowed in the cart when rule-based product recommendations are enabled. This helps prevent performance issues with large carts.

Example:
```bash
PUBLIC__app__pages__cart__ruleBasedProductLimit=100
```

---

### pages.cart.showLineItemDescription

Type: `boolean` | Optional | Default: `false`

When `true`, each cart line item shows the product short description (plain text) when available, otherwise the long description (HTML via `HtmlFragment`). When `false` (default), descriptions are hidden so the cart stays compact.

Example:
```bash
PUBLIC__app__pages__cart__showLineItemDescription=true
```

---

### pages.cart.miniCart.enableViewCartButton

Type: `boolean` Optional | Default: `true`

When enabled, displays a "View Cart" button in the mini cart dropdown. The "View Cart" button provides a quick way for users to navigate to the full cart page.

Example:
```bash
PUBLIC__app__pages__cart__miniCart__enableViewCartButton=false
```

---

### pages.search.placeholder

Type: `string` | Default: `'Search'`

The placeholder text shown in the search input field. Customize this to provide context-specific guidance to users.

Example:
```bash
PUBLIC__app__pages__search__placeholder="Search products..."
```

---

### pages.search.enableSearchSuggestions

Type: `boolean` | Default: `true`

When enabled, shows product and category suggestions as the user types in the search box. This option improves search discoverability.

Example:
```bash
PUBLIC__app__pages__search__enableSearchSuggestions=false
```

---

### pages.search.maxSuggestions

Type: `number` | Default: `8`

The maximum number of search suggestions to display in the dropdown. This option includes both product and category suggestions.

Example:
```bash
PUBLIC__app__pages__search__maxSuggestions=10
```

---

### pages.search.enableRecentSearches

Type: `boolean` | Default: `true`

When enabled, stores and displays the user's recent searches. This option helps users repeat common searches quickly. The browser stores recent searches in local storage and displays them when the search input is focused.

Example:
```bash
PUBLIC__app__pages__search__enableRecentSearches=false
```

---

### pages.search.suggestionsDebounce

Type: `number` | Default: `100`

The delay in milliseconds before fetching search suggestions after the user stops typing. This option reduces the number of API calls while maintaining responsiveness.

Example:
```bash
PUBLIC__app__pages__search__suggestionsDebounce=200
```

---

### pages.maintenancePage.sharedMaintenancePage

Type: `boolean` | Default: `false`

When enabled, the maintenance page fetches HTML content from a shared service instead of displaying the local fallback maintenance page. It can be the default B2C maintenance page or a custom page uploaded through Business Manager.
Note that the same page is displayed for both system and site maintenance.

Example:
```bash
PUBLIC__app__pages__maintenancePage__sharedMaintenancePage=true
```

---

### pages.maintenancePage.cdnUrl

Type: `string` | Default: `'http://prd.cmp.cdn.commercecloud.salesforce.com'`

The URL of the shared maintenance page server. This is the endpoint where the maintenance page HTML is fetched from when `sharedMaintenancePage` is enabled. This is typically a Salesforce URL that should not be changed.

Example:
```bash
PUBLIC__app__pages__maintenancePage__cdnUrl="https://custom-cdn.example.com/maintenance"
```

---

### pages.maintenancePage.forwardedHost

Type: `string` | Default: `''` (empty string)

Optional domain name to send as the `x-dw-forwarded-host` header when fetching from the maintenance page service. See the Business Manager document for more information about 'system' maintenance pages and how to associate them with a domain.
By default, the domain is empty, meaning that it fetches the default Salesforce maintenance page.

Example:
```bash
PUBLIC__app__pages__maintenancePage__forwardedHost="mystore.example.com"
```


---

## commerce

B2C Commerce API configuration.

### commerce.api.clientId

Type: `string` Required | Default: `''`

Your API client ID (UUID) for API access used by the Shopper Login and API Access Service (SLAS). See [Shopper Login and API Access Service(SLAS) Overview](https://developer.salesforce.com/docs/commerce/commerce-api/guide/slas.html).

Example:
```bash
PUBLIC__app__commerce__api__clientId="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

**Troubleshooting:** If API requests fail with authentication errors, verify this client ID matches your SLAS configuration. Ensure the API client has the required roles and scopes.

---

### commerce.api.organizationId

Type: `string` Required | Default: `''`

Your organization ID, sometimes called the realm ID. You can find this ID on your Account Manager home page. See [Configuration Values](https://developer.salesforce.com/docs/commerce/commerce-api/guide/base-url.html#configuration-values) in the _B2C Commerce API Guide_.

Example:
```bash
PUBLIC__app__commerce__api__organizationId="f_ecom_aaaa_001"
```

---

### commerce.api.shortCode

Type: `string` Required | Default: `''`

The unique identifier for your B2C Commerce instance. This short code is part of your instance URL and API endpoints. See [Configuration Values](https://developer.salesforce.com/docs/commerce/commerce-api/guide/base-url.html#configuration-values) in the _B2C Commerce API Guide_.

Example:
```bash
PUBLIC__app__commerce__api__shortCode="kv7kzm78"
```

---

### commerce.api.proxy

Type: `string` Optional | Default: `'/mobify/proxy/api'`

The path for proxying API requests. Using a proxy helps avoid CORS issues and keeps your API credentials secure.

---

### commerce.api.callback

Type: `string` Optional | Default: `'/callback'`

The callback URL path for OAuth flows and authentication redirects.

---

### commerce.api.privateKeyEnabled

Type: `boolean` Optional | Default: `false`

Enable this setting to use a private client for SLAS authentication. When enabled, you must configure a private API client.

---

### commerce.api.registeredRefreshTokenExpirySeconds

Type: `number` Optional | Default: `undefined`

The number of seconds before refresh tokens expire for registered users. If you don't set this value, the default value from your configuration is used.

---

### commerce.api.guestRefreshTokenExpirySeconds

Type: `number` Optional | Default: `undefined`

The number of seconds before refresh tokens expire for guest users. If you don't set this value, the default value from your configuration is used.

---

### commerce.sites

Type: `Site[]` | Default: Array with one site configuration

Site configuration array. Each site can have its own locale, currency, cookies domain, and detection settings.

**Site Configuration Properties:**
- `cookies` - Cookie configuration for the site
  - `domain` (string | undefined) - Domain for cookies (e.g., '.example.com' for subdomain sharing)
- `id` (string) - Unique site identifier - ECOM site Id
- `defaultLocale` (string) - Default locale (e.g., 'en-US')
- `defaultCurrency` (string) - Default currency code (e.g., 'USD')
- `supportedLocales` (Locale[]) - Array of supported locales with preferred currencies
- `supportedCurrencies` (string[]) - Array of currency codes for the currency switcher
- `domain` (string, optional) - Domain name for site detection

**Example (single-line JSON):**
```bash
PUBLIC__app__commerce__sites='[{"cookies":{"domain":null},"defaultSiteId":"RefArchGlobal","defaultLocale":"en-GB","defaultCurrency":"USD","supportedLocales":[{"id":"en-GB","preferredCurrency":"USD"},{"id":"de-DE","preferredCurrency":"EUR"}],"supportedCurrencies":["EUR","USD"]}]'
```

**Example (multi-line JSON for readability):**
```bash
PUBLIC__app__commerce__sites='[
  {
    "cookies": {"domain": null},
    "id": "RefArchGlobal",
    "defaultLocale": "en-GB",
    "defaultCurrency": "USD",
    "supportedLocales": [
      {"id": "en-GB", "preferredCurrency": "USD"},
      {"id": "de-DE", "preferredCurrency": "EUR"},
      {"id": "fr-FR", "preferredCurrency": "EUR"}
    ],
    "supportedCurrencies": ["EUR", "USD"]
  }
]'
```

**Note:** Multi-line JSON is supported - the parser automatically normalizes whitespace. This makes complex configurations much easier to read and edit in .env files.

**Troubleshooting:**
- If a locale doesn't appear in the language selector, verify it's in both the site's `supportedLocales` and `i18n.supportedLngs`
- Ensure translation files exist for each supported locale
- If only one currency is in `supportedCurrencies`, the currency switcher won't be displayed

---

## hybrid

Hybrid mode configuration for integrating with legacy storefront pages.

### hybrid.enabled

Type: `boolean` | Default: `false`

Enables hybrid mode for integrating with legacy storefront pages. When enabled, specific routes can be redirected to a legacy system.

Example:
```bash
PUBLIC__app__hybrid__enabled=true
```

---

### hybrid.legacyRoutes

Type: `string[]` Optional | Default: `[]`

Array of route patterns that should be handled by the legacy system when hybrid mode is enabled. Patterns may be exact paths, single-segment named params (`:name`), or multi-segment wildcards (`*`).

Example:
```bash
PUBLIC__app__hybrid__legacyRoutes='["/account", "/checkout", "/product/:id", "/categoryLv1/*"]'
```

See the [Hybrid Proxy guide](./README-HYBRID-PROXY.md#public__app__hybrid__legacyroutes) for full pattern syntax (`:param`, `*`) and matching semantics.

---

## auth

Authentication configuration shared across all auth features. These settings apply to passwordless login, password reset, WebAuthn, passkey, and any other authentication methods that use OTP (One-Time Password) verification.

### auth.otpLength

Type: `number` | Default: `6`

The length of the OTP (One-Time Password) code used for authentication. This value is set by SLAS (Shopper Login and API Access Service) and is shared across all authentication features including passwordless login, password reset, WebAuthn, and passkey authentication.

**Important:** This is a global setting that affects all authentication flows. SLAS enforces a single OTP length for all auth features, so this value should remain consistent across your application.

`otpLength` sets the OTP modal's initial slot count, but it does not control the length SLAS actually delivers — keep it matched to your SLAS client. The modal tolerates a mismatch so a configuration drift never strands the shopper: pasting a code longer than `otpLength` expands the inputs to fit (up to the 8-digit maximum SLAS issues), and the modal accepts any 6-to-8-digit code. Match this value to your SLAS client anyway so the default slot count and the "we sent an N-digit code" copy are correct.

Example:
```bash
PUBLIC__app__auth__otpLength=6
```

**Usage:** When implementing new authentication features (e.g., passkey login), use `config.auth.otpLength` instead of defining a separate `otpLength` property in the feature configuration. This ensures consistency and prevents configuration drift.

---

## security

### `security.headers`

Default security response headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Empty `{}` uses SDK defaults. See [README-SECURITY-HEADERS.md](./README-SECURITY-HEADERS.md) for the defaults table and extension recipes.

---

## features

Site feature flags that enable or disable specific functionality.

### features.passwordlessLogin.mode

Type: `'email' | 'callback'` | Default: `'email'`

Determines how passwordless login links are delivered to users.

- **`'email'`** (default): The system sends the passwordless login link email directly to the user.
- **`'callback'`**: Uses a callback flow where the system calls your server's callback endpoint with the token and user information. This mode requires the `callbackUri` to be configured and registered for your SLAS client and is useful when using an external email or SMS provider.

Example:
```bash
PUBLIC__app__features__passwordlessLogin__mode="email"
```

---

### features.passwordlessLogin.callbackUri

Type: `string` Optional | Default: `'/passwordless-login-callback'`

The callback URI sent to SLAS when requesting a passwordless login. Required when mode is `callback`.

---

### features.passwordlessLogin.landingUri

Type: `string` Optional | Default: `'/login'`

The URI path of the magic link. A magic link is a single-use URL that contains the TOTP and that shoppers click to log into the storefront.

---

### features.otpRequest.mode

Type: `'email' | 'callback'` | Default: `'email'`

Determines how OTP codes are delivered for email verification (e.g., during registration).

- **`'email'`** (default): The system sends the OTP code email directly to the user.
- **`'callback'`**: Uses a callback flow where SLAS calls your server's callback endpoint with the OTP details. This mode requires the `callbackUri` to be configured and registered for your SLAS client and is useful when using an external email or SMS provider.

Example:
```bash
PUBLIC__app__features__otpRequest__mode="email"
```

---

### features.otpRequest.callbackUri

Type: `string` Optional | Default: `undefined`

The callback URI sent to SLAS when requesting an OTP code. Required when mode is `callback`. Must be an absolute URL pointing to an external service (e.g., `https://example.com/otp-callback`).

---

### features.resetPassword.mode

Type: `'email' | 'callback'` | Default: `'email'`

Determines how password reset tokens are delivered to users.

- **`'email'`** (default): SLAS sends the password reset link email directly to the user.
- **`'callback'`**: Uses a callback flow where SLAS calls your server's callback endpoint with the token and user information. This mode requires the `callbackUri` to be configured and registered for your SLAS client and is useful when using an external email or sms provider.

Example:
```bash
PUBLIC__app__features__resetPassword__mode="email"
```

---

### features.resetPassword.callbackUri

Type: `string` Optional | Default: `'/reset-password-callback'`

The callback URI sent to SLAS when requesting an password reset. Required when mode is `callback`.

---

### features.resetPassword.landingUri

Type: `string` Optional | Default: `'/reset-password'`

The URI path where users land to create a new password after requesting a reset.

---

### features.socialLogin.enabled

Type: `boolean` | Default: `false`

Enables social login functionality, allowing users to authenticate using third-party providers like Google or Apple. Requires OAuth configuration in Account Manager for each provider.

Example:
```bash
PUBLIC__app__features__socialLogin__enabled=true
```

---

### features.socialLogin.callbackUri

Type: `string` | Default: `'/social-callback'`

The URI path for handling OAuth callbacks from social login providers.

---

### features.socialLogin.providers

Type: `('Apple' | 'Google' | 'Facebook' | 'Twitter')[]` | Default: `['Apple', 'Google']`

Array of social login providers to enable. Each provider requires configuration in Account Manager.

Example:
```bash
PUBLIC__app__features__socialLogin__providers='["Apple","Google","Facebook"]'
```

---

### features.socialShare.enabled

Type: `boolean` | Default: `true`

Enables social sharing buttons on product pages, allowing users to share products on social media.

---

### features.socialShare.providers

Type: `('Twitter' | 'Facebook' | 'LinkedIn' | 'Email')[]` | Default: `['Twitter', 'Facebook', 'LinkedIn', 'Email']`

Array of social sharing options to display on product pages.

Example:
```bash
PUBLIC__app__features__socialShare__providers='["Twitter","Facebook","Email"]'
```

---

### features.guestCheckout

Type: `boolean` | Default: `true`

When enabled, allows users to complete purchases without creating an account. Disabling this option requires all users to register before checkout.

Example:
```bash
PUBLIC__app__features__guestCheckout=false
```

---

### features.shopperContext.enabled

Type: `boolean` | Default: `false`

Enables Shopper Context API integration for personalized experiences based on shopper segments and attributes.

---

### features.shopperContext.dwsourcecodeCookieSuffix

Type: `string` Optional | Default: `undefined`

The suffix for the DW source code cookie when using Shopper Context. This helps track campaign attribution.

---

## i18n

Configuration options for internationalization configuration using i18next.

### i18n.fallbackLng

Type: `string` | Default: `'en-US'`

The fallback language to use when a translation isn't available in the user's selected language. If a translation key is missing in the current locale, the application displays the text from this fallback locale.

Example:
```bash
PUBLIC__app__i18n__fallbackLng="en-GB"
```

---

### i18n.supportedLngs

Type: `string[]` | Default: `['it-IT', 'en-US']`

Array of language codes that have translation files available. The fallback language should be the last item in the array.

Example:
```bash
PUBLIC__app__i18n__supportedLngs='["en-GB","de-DE","fr-FR"]'
```

Each language in this array must have corresponding translation files in your project. Languages must also be included in your site's `supportedLocales` (configured in `commerce.sites`) for full support. The fallback language should be listed last. See `src/middlewares/i18next.ts` for middleware configuration.

---

## global

Global UI configuration and component settings that apply across the entire application.

### global.branding.name

Type: `string` | Default: `'Performer'`

The brand name displayed throughout the application, including headers and footers.

Example:
```bash
PUBLIC__app__global__branding__name="Acme Store"
```

---

### global.branding.logoAlt

Type: `string` | Default: `'Home'`

The alt text for the logo image. This is important for accessibility and SEO.

Example:
```bash
PUBLIC__app__global__branding__logoAlt="Acme Store Home"
```

---

### global.productListing.defaultProductTileImgAspectRatio

Type: `number` | Default: `1`

The aspect ratio for product tile images (width/height). A value of `1` means square images, `1.5` means 3:2 ratio.

Example:
```bash
PUBLIC__app__global__productListing__defaultProductTileImgAspectRatio=1.33
```

---

### global.carousel.defaultItemCount

Type: `number` | Default: `4`

The default number of items to show in carousels across the site. Page Designer components may override this value with their own configuration.

Example:
```bash
PUBLIC__app__global__carousel__defaultItemCount=5
```

---

### global.badges

Type: `BadgeDetail[]` | Default: Array of 7 badge configurations for New, Sale, Limited, Exclusive, Trending, Best Seller, and Out of Stock

Configuration for product badges. Each badge includes a property name (custom attribute), label (display text), color, and priority (for display order).

**Badge Object Properties:**
- `propertyName` (string) - The product attribute name (e.g., 'c_isNew')
- `label` (string) - Display text for the badge
- `color` ('green' | 'yellow' | 'orange' | 'purple' | 'red' | 'blue' | 'pink') - Badge color variant
- `priority` (number) - Display priority when multiple badges apply (lower = higher priority)

Example:
```bash
PUBLIC__app__global__badges='[{"propertyName":"c_isNew","label":"New Arrival","color":"green","priority":1}]'
```

When a product has multiple badge properties set to `true`, only the badge with the lowest priority number is displayed.

---

### global.skeleton.thumbnails

Type: `number` | Default: `4`

Number of thumbnail skeletons to show while product images are loading.

---

### global.skeleton.colorVariants

Type: `number` | Default: `4`

Number of color variant skeletons to show while loading product variants.

---

### global.skeleton.sizeVariants

Type: `number` | Default: `3`

Number of size variant skeletons to show while loading product variants.

---

### global.skeleton.accordionSections

Type: `number` | Default: `3`

Number of accordion section skeletons to show while loading expandable content.

---

### global.skeleton.defaultItemCount

Type: `number` | Default: `4`

Default number of item skeletons to show in lists and grids while loading.

---

### global.recommendations.search_limit.youMightLike

Type: `number` | Default: `8`

Maximum number of "You Might Like" recommendations to request from the API.

---

### global.recommendations.search_limit.completeLook

Type: `number` | Default: `12`

Maximum number of "Complete the Look" recommendations to request from the API.

---

### global.recommendations.search_limit.recentlyViewed

Type: `number` | Default: `6`

Maximum number of "Recently Viewed" products to display.

---

### global.recommendations.types

Type: `Record<string, RecommendationType>`

Configuration for each recommendation type. Each type includes:
- `enabled` (boolean) - Whether this recommendation type is active
- `priority` (number) - Display order when multiple types are shown
- `sort` (string) - Sort method for recommendations
- `titleKey` (string) - Translation key for the section title

**Available Types:**
- `you-may-also-like` - Products similar to the current product
- `complete-the-look` - Products that complement the current product
- `recently-viewed` - Products the user has viewed recently

Example:
```bash
PUBLIC__app__global__recommendations__types='{"you-may-also-like":{"enabled":true,"priority":1,"sort":"best-matches","titleKey":"product.recommendations.youMightAlsoLike"}}'
```

---

## links

Link hints for browser resource loading. These hints help the browser optimize resource loading by establishing early connections or prefetching resources before they're needed.

### links.preconnect

Type: `string[]` Optional | Default: `['https://edge.disstg.commercecloud.salesforce.com']`

An array of origin URLs to preconnect to. The browser establishes early connections (DNS lookup, TCP handshake, TLS negotiation) to these origins before they're needed, reducing latency when fetching resources.

**Available DIS Hosts:**

| Environment | Host URL |
|-------------|----------|
| **Staging** | `https://edge.disstg.commercecloud.salesforce.com` |
| **Production** | `https://edge.dis.commercecloud.salesforce.com` |

Example for staging (default):
```bash
PUBLIC__app__links__preconnect='["https://edge.disstg.commercecloud.salesforce.com"]'
```

Example for production:
```bash
PUBLIC__app__links__preconnect='["https://edge.dis.commercecloud.salesforce.com"]'
```

**Important:** The default value uses the staging DIS (Dynamic Image Service) origin. For production deployments, update this to the production DIS origin. This should match your `images.host` configuration.

**Note:** Only provide origin URLs (scheme + host + port), not full paths. Any path in the URL will be ignored by the browser.

**Best Practice:** Limit to 4 or fewer preconnect origins. Too many preconnect hints can compete for bandwidth and CPU during page load, potentially hurting performance instead of helping it.

---

### links.prefetch

Type: `string[]` Optional | Default: `undefined`

An array of URLs for resources to prefetch. Prefetched resources are downloaded and cached for future use, improving load times when the user navigates to pages that need them.

Example:
```bash
PUBLIC__app__links__prefetch='["/static/fonts/custom-font.woff2", "/api/products/featured"]'
```

**Use cases:**
- Fonts that will be used on subsequent pages
- API responses that are likely to be needed soon
- JavaScript bundles for routes the user is likely to visit

**Note:** Prefetch has low priority and won't compete with critical resources. The browser may ignore prefetch hints under memory pressure or slow connections.

---

### links.prefetchDns

Type: `string[]` Optional | Default: `undefined`

An array of origin URLs for DNS prefetching. The browser performs DNS lookups for these origins in advance, reducing latency when resources from these origins are later requested. The property name aligns with React's built-in [`prefetchDNS`](https://react.dev/reference/react-dom/prefetchDNS) utility.

Example:
```bash
PUBLIC__app__links__prefetchDns='["https://analytics.example.com", "https://cdn.example.com"]'
```

**When to use prefetchDns vs preconnect:**
- Use `prefetchDns` for third-party origins where you only need the DNS lookup (lighter weight)
- Use `preconnect` for origins where you'll make requests soon (establishes full connection)

**Note:** DNS prefetch is more lightweight than preconnect, so it's safer to use for origins that might not be accessed on every page load.

---

## images

Salesforce Dynamic Imaging Service configuration.

### images.quality

Type: `number` | Default: `70`

The quality level for image compression (0-100). Lower values reduce file size but can affect image quality.

Example:
```bash
PUBLIC__app__images__quality=85
```

**Troubleshooting:** If images appear blurry or pixelated, increase this value. If images load slowly, decrease it.

---

### images.formats

Type: `Array<"avif" | "gif" | "jp2" | "jpg" | "jpeg" | "jxr" | "png" | "webp">` | Default: `["webp"]`

Array of image formats to generate. Modern formats like [WebP](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types#webp_image) and [AVIF](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types#avif_image) provide better compression but may not be supported by all browsers. The application uses the [`<picture>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/picture) element, generates [`<source>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/source) elements for each defined image format, and thus ultimately lets the browsers choose the respective best supported formats and dimensions.

Example:
```bash
PUBLIC__app__images__formats='["avif","webp","jpg"]'
```

---

### images.fallbackFormat

Type: `"avif" | "gif" | "jp2" | "jpg" | "jpeg" | "jxr" | "png" | "webp"` | Default: `jpg`

While modern web-optimized image formats such as WebP and AVIF are widely supported and used, some systems still lack compatibility. A fallback to an established image format is therefore recommended.

Example:
```bash
PUBLIC__app__images__fallbackFormat='png'
```

---

### images.host

Type: `string` | Default: `https://edge.disstg.commercecloud.salesforce.com`

The Salesforce Dynamic Imaging Service (DIS) host URL. This is the CDN endpoint that serves optimized images with on-the-fly transformations (resizing, format conversion, quality adjustment).

**Available DIS Hosts:**

| Environment | Host URL |
|-------------|----------|
| **Staging** | `https://edge.disstg.commercecloud.salesforce.com` |
| **Production** | `https://edge.dis.commercecloud.salesforce.com` |

Example for production:
```bash
PUBLIC__app__images__host='https://edge.dis.commercecloud.salesforce.com'
```

**Important:** When deploying to production, update this value to the production DIS host. Using the staging host in production may result in slower image loading or availability issues.

**Note:** Also update the corresponding `links.preconnect` value to match, so browsers can establish early connections to the correct DIS host.

---

## search

Search-specific configuration options.

### search.products.refine.orderableOnly

Type: `boolean` Optional | Default: `true`

Property to define whether to only return search results with products that are currently orderable, i.e., in stock. By default, we only search for orderable products, which for downstream components and functionalities (e.g., JSON-LD for SEO) means that the orderability/availability of the returned search results can implicitly be assumed.

* [SCAPI Server-Side Web-Tier Caching
  ](https://developer.salesforce.com/docs/commerce/commerce-api/guide/server-side-web-tier-caching.html)
  * [Default Cache Expiration and Personalization Settings](https://developer.salesforce.com/docs/commerce/commerce-api/guide/server-side-web-tier-caching.html#default-cache-expiration-and-personalization-settings)
  * ["expand" Parameter Impact on Cache Hit Rates](https://developer.salesforce.com/docs/commerce/commerce-api/guide/server-side-web-tier-caching.html#expand-parameter-impact-on-cache-hit-rates)
* [shopper-search/product-search](https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-search?meta=productSearch)

Example:
```bash
PUBLIC__app__search__products__refine__orderableOnly=true
```

---

### search.products.hits.limit

Type: `number` | Default: `24`

The number of products to display per page in product listing pages, such as search result and category pages. This option affects pagination and the initial API request size for product listings.

Example:
```bash
PUBLIC__app__search__products__hits__limit=36
```

---

### search.products.hits.critical

Define the number of product search hits to load in a blocking manner, i.e., critical.

Example:
```bash
PUBLIC__app__search__products__hits__critical=4
```

---

### search.products.images.tile

Type: `string` Optional | Default: `'medium'`

The viewType the product tile reads for the hero image on PLPs. Drives the search
filter (the SCAPI `imgTypes` query parameter is derived as the union of all
role-named viewTypes here). A planned follow-up will also have the tile component
itself read this value, eliminating drift between the search filter and the tile's
image lookup.

Set to `undefined` to opt this role out of the search filter. If you customize the
tile to read a different viewType (e.g. `'large'`), update this value to match.

Example:
```bash
PUBLIC__app__search__products__images__tile=large
```

---

### search.products.images.swatch

Type: `string` Optional | Default: `'swatch'`

The viewType the swatch builder reads for color thumbnails on PLPs. Same role-named
declaration pattern as `tile` above — feeds the SCAPI `imgTypes` filter; a planned
follow-up will have the swatch builder itself read this value.

Set to `undefined` to opt this role out of the search filter.

Example:
```bash
PUBLIC__app__search__products__images__swatch=swatch
```

Both roles together control PLP image filtering. To disable filtering entirely and
return the full imageGroups payload, set both to `undefined` or pass an empty
`images: {}` config block. Only applies to `fetchSearchProducts` (search/category
pages); PDP and cart fetches are unaffected. See
[docs/README-IMAGES.md](./README-IMAGES.md#image-filtering-on-product-listing-pages)
for the full pattern.

---

## performance

Performance optimization configuration.

### performance.caching.apiCacheTtl

Type: `number` | Default: `300`

Time-to-live for API response caching in seconds. This determines how long B2C Commerce API responses are cached.

Example:
```bash
PUBLIC__app__performance__caching__apiCacheTtl=600
```

**Troubleshooting:** If content updates aren't appearing immediately, reduce this value. If you're experiencing API rate limiting, increase this value.

---

### performance.caching.staticAssetCacheTtl

Type: `number` | Default: `31536000`

Time-to-live for static asset caching in seconds. Default is 1 year (31,536,000 seconds).

---

### performance.metrics.serverPerformanceMetricsEnabled

Type: `boolean` Optional | Default: `false`

When enabled, collects and logs server-side performance metrics.

---

### performance.metrics.serverTimingHeaderEnabled

Type: `boolean` Optional | Default: `false`

When enabled, adds Server-Timing headers to responses, which can be viewed in browser developer tools. The Server-Timing header provides detailed timing information for server operations, useful for debugging performance issues.

Example:
```bash
PUBLIC__app__performance__metrics__serverTimingHeaderEnabled=true
```

---

### performance.metrics.clientPerformanceMetricsEnabled

Type: `boolean` Optional | Default: `false`

When enabled, collects client-side performance metrics using the Performance API.

---

## engagement

Analytics and engagement adapter configuration.

Note: Engagement settings can't be overridden via `PUBLIC__` environment variables. To change these values, update `config.server.ts` directly. This restriction exists because engagement configuration affects build-time validation for analytics instrumentation.

### engagement.adapters

Type: `Record<string, EngagementAdapterConfig>`

Configuration for analytics and engagement adapters. Each adapter can be enabled independently and has its own settings.

**Available Adapters:**
- `einstein` - Einstein Recommendations and Analytics
- `dataCloud` - Salesforce Data Cloud integration
- `activeData` - Active Data tracking

---

### engagement.adapters.einstein.enabled

Type: `boolean` | Default: `true`

Enables Einstein Recommendations and Analytics tracking.

---

### engagement.adapters.einstein.host

Type: `string` | Default: `'https://api.cquotient.com'`

The Einstein API host URL.

---

### engagement.adapters.einstein.einsteinId

Type: `string` | Default: `'1ea06c6e-c936-4324-bcf0-fada93f83bb1'`

Your Einstein site ID.

---

### engagement.adapters.einstein.isProduction

Type: `boolean` | Default: `false`

Determines whether to use production or sandbox Einstein environment.

---

### engagement.adapters.einstein.realm

Type: `string` | Default: `'aaij'`

The Einstein realm identifier.

---

### engagement.adapters.einstein.siteId

Type: `string` | Default: `'MobileFirst'`

The site identifier for Einstein tracking.

---

### engagement.adapters.einstein.eventToggles

Type: `Record<string, boolean>`

Individual toggles for each Einstein event type. Available events:
- `view_page` - Page view events
- `view_product` - Product detail page views
- `view_search` - Search result views
- `view_category` - Category page views
- `view_recommender` - Recommendation section views
- `click_product_in_category` - Product clicks from category pages
- `click_product_in_search` - Product clicks from search results
- `click_product_in_recommender` - Product clicks from recommendations
- `cart_item_add` - Add to cart events
- `checkout_start` - Checkout initiation
- `checkout_step` - Checkout step progression
- `view_search_suggestion` - Search suggestion panel views
- `click_search_suggestion` - Clicks on search suggestions

Example:
```bash
PUBLIC__app__engagement__adapters__einstein__eventToggles='{"view_product":true,"cart_item_add":true}'
```

---

### engagement.adapters.dataCloud.enabled

Type: `boolean` | Default: `false`

Enables Salesforce Data Cloud integration for unified customer data.

---

### engagement.adapters.dataCloud.appSourceId

Type: `string` | Default: `'7ae070a6-f4ec-4def-a383-d9cacc3f20a1'`

Your Data Cloud application source identifier.

---

### engagement.adapters.dataCloud.tenantId

Type: `string` | Default: `'g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd'`

Your Data Cloud tenant identifier.

---

### engagement.adapters.dataCloud.siteId

Type: `string` | Default: `''`

The site identifier for Data Cloud tracking.

---

### engagement.adapters.dataCloud.eventToggles

Type: `Record<string, boolean>`

Individual toggles for each Data Cloud event type. Uses the same event types as Einstein.

---

### engagement.adapters.activeData.enabled

Type: `boolean` | Default: `true`

Enables Active Data tracking for real-time analytics.

---

### engagement.adapters.activeData.host

Type: `string` | Default: `'https://zzrf-001.dx.commercecloud.salesforce.com'`

The Active Data API host URL.

---

### engagement.adapters.activeData.siteId

Type: `string` | Default: `'RefArchGlobal'`

The site identifier for Active Data tracking.

---

### engagement.adapters.activeData.locale

Type: `string` | Default: `'en_US'`

The locale for Active Data events. Note the underscore format differs from the site locale format.

---

### engagement.adapters.activeData.siteUUID

Type: `string` | Default: `'8bb1ea1b04ac3454d36b83a888'`

The unique site identifier for Active Data.

---

### engagement.adapters.activeData.eventToggles

Type: `Record<string, boolean>`

Individual toggles for each Active Data event type. Uses the same event types as Einstein.

---

### engagement.analytics.trackingConsent.enabled

Type: `boolean` Optional | Default: `true`

When enabled, displays a consent banner for tracking and analytics. Users can accept or decline tracking.

Example:
```bash
PUBLIC__app__engagement__analytics__trackingConsent__enabled=false
```

---

### engagement.analytics.trackingConsent.defaultTrackingConsent

Type: `TrackingConsent` Optional | Default: `TrackingConsent.Declined`

The default tracking consent state before the user makes a choice. Can be `TrackingConsent.Granted` or `TrackingConsent.Declined`. This determines whether tracking events are sent before the user explicitly accepts or declines tracking.

---

### engagement.analytics.trackingConsent.position

Type: `('bottom-left' | 'bottom-right' | 'bottom-center')` Optional | Default: `'bottom-right'`

The position of the tracking consent banner on the page.

Example:
```bash
PUBLIC__app__engagement__analytics__trackingConsent__position="bottom-center"
```

---

### engagement.analytics.pageViewsBlocklist

Type: `string[]` | Default: `['/action', '/callback', '/oauth2', '/resource', '/search', '/category', '/product', '/checkout']`

Array of path patterns where automatic page view events shouldn't be sent. These paths either use custom events or aren't actual pages.

Example:
```bash
PUBLIC__app__engagement__analytics__pageViewsBlocklist='["/action","/api"]'
```

Note:
Paths like `/search`, `/category`, `/product`, and `/checkout` use specialized events (viewSearch, viewCategory, viewProduct, beginCheckout). Paths like `/action` are server actions, not pages. Paths like `/callback` and `/oauth2` are authentication flows.

---

### engagement.analytics.pageViewsResetDuration

Type: `number` | Default: `1500`

Time in milliseconds before the same page can trigger another page view event. This option prevents duplicate events during navigation.

Example:
```bash
PUBLIC__app__engagement__analytics__pageViewsResetDuration=2000
```

---

## cimulateAgent

Commerce Client (Cimulate) messaging widget configuration. When enabled, loads the Cimulate UMD bundle and injects a chat widget accessible via the header sparkles icon or Account Help "Ask a question" button.

Override via `PUBLIC__app__cimulateAgent` as a single JSON string. Defaults in `config.server.ts` are empty or disabled. See `src/components/cimulate/README.md` for setup.

| Path | Type | Description |
|------|------|-------------|
| `enabled` | `string \| boolean` | `true` / `'true'` to enable. |
| `commerceClientScriptSourceUrl` | `string` | Full URL to the Cimulate UMD bundle (must be from a trusted domain). |
| `scrt2Url` | `string` | SCRT2 URL for your org. |
| `salesforceOrgId` | `string` | Salesforce org ID. |
| `esDeveloperName` | `string` | Embedded Service developer name. |
| `commerceClientElementId` | `string` (optional) | DOM element ID for widget container. |
| `commerceClientDisplayMode` | `'panel' \| 'dialog' \| 'modal'` (optional) | Widget display mode. Default: `'panel'`. |
| `commerceClientPanelWidth` | `string` (optional) | Panel width (e.g. `'420px'`). |
| `commerceClientLogoUrl` | `string` (optional) | Logo URL for the widget header. |
| `headerText` | `string` (optional) | Widget header text. |
| `commerceClientTheme` | `object` (optional) | Theme overrides (primaryColor, fontFamily, etc.). |
| `routingAttributes` | `object` (optional) | Routing attributes for agent assignment. |

---

## development

Development tools and features for local development.

### development.enableDevtools

Type: `boolean` | Default: `true`

Enables React Developer Tools and other development utilities.

Example:
```bash
PUBLIC__app__development__enableDevtools=false
```

---

### development.hotReload

Type: `boolean` | Default: `true`

Enables hot module replacement (HMR) for faster development. Changes to code are reflected immediately without full page reloads.

Example:
```bash
PUBLIC__app__development__hotReload=false
```

---

### development.strictMode

Type: `boolean` | Default: `true`

Enables React Strict Mode, which helps identify potential problems in the application during development. Strict Mode runs additional checks and warnings in development. It doesn't affect production builds.

Example:
```bash
PUBLIC__app__development__strictMode=false
```

---

## Common Configuration Scenarios

### Setting Up a New Site

Minimum required configuration for a new site.

```bash
# B2C Commerce credentials (required)
PUBLIC__app__commerce__api__clientId="your-client-id"
PUBLIC__app__commerce__api__organizationId="your-org-id"
PUBLIC__app__commerce__api__shortCode="your-short-code"

# Basic branding
PUBLIC__app__global__branding__name="Your Store Name"
```

**Note:** Site-specific settings (locale, currency, supported locales/currencies) are configured in `commerce.sites` array. See the next scenario for multi-language configuration.

---

### Configuring Multiple Languages

To support multiple languages and currencies using multi-line JSON format for readability.

```bash
# Configure site with multi-language support (multi-line JSON)
PUBLIC__app__commerce__sites='[
  {
    "cookies": {"domain": null},
    "id": "RefArchGlobal",
    "defaultLocale": "en-GB",
    "defaultCurrency": "USD",
    "supportedLocales": [
      {"id": "en-GB", "preferredCurrency": "USD"},
      {"id": "de-DE", "preferredCurrency": "EUR"},
      {"id": "fr-FR", "preferredCurrency": "EUR"}
    ],
    "supportedCurrencies": ["USD", "EUR", "GBP"]
  }
]'

# Configure i18n with all supported languages
PUBLIC__app__i18n__supportedLngs='["en-GB", "de-DE", "fr-FR"]'
PUBLIC__app__i18n__fallbackLng="en-US"
```

**Important:** Multi-line JSON is supported and recommended for readability. The parser automatically normalizes whitespace.

Make sure translation files exist for each language in your project.

---

### Enabling Social Login

To enable login with Apple, Google, or other providers.

```bash
# Enable social login
PUBLIC__app__features__socialLogin__enabled=true
PUBLIC__app__features__socialLogin__providers='["Apple", "Google", "Facebook"]'
PUBLIC__app__features__socialLogin__callbackUri="/social-callback"
```

**Additional Steps Required:**
1. Configure OAuth apps with each provider (Apple, Google, etc.).
2. Add provider credentials in Account Manager.
3. Configure callback URLs with each provider.

---

### Optimizing Performance

For high-traffic sites, consider these settings.

```bash
# Reduce API calls
PUBLIC__app__performance__caching__apiCacheTtl=600

# Optimize images
PUBLIC__app__images__quality=65
PUBLIC__app__images__formats='["webp","jpg"]'

# Reduce quantity update API calls
PUBLIC__app__pages__cart__quantityUpdateDebounce=1000

# Enable performance monitoring
PUBLIC__app__performance__metrics__serverTimingHeaderEnabled=true
```

---

### Customizing Product Listings

To customize how products appear in search and category pages, use these settings.

```bash
# Show more products per page
PUBLIC__app__search__products__hits__limit=36

# Customize sort options
PUBLIC__app__global__productListing__sortOptions='["relevance","price-asc","price-desc","newest"]'

# Disable quick view
PUBLIC__app__global__productListing__enableQuickView=false
```

---

## Troubleshooting

### Configuration not taking effect

**Problem:** You've set an environment variable but the change isn't reflected in the application.

**Possible Solutions:**
1. Restart your development server (environment variables load at startup).
2. Verify the variable name starts with `PUBLIC__` (double underscore).
3. Check the `.env` file is in the project root.
4. Ensure there are no typos in the configuration path.
5. For booleans, use the string `"true"` not bare `true`.

---

### Type errors after adding configuration

**Problem:** TypeScript shows errors after adding new configuration options.

**Possible Solutions:**
1. Update both `src/types/config.ts` (type definitions) and `config.server.ts` (default values).
2. Ensure the types match between both files.
3. Run `pnpm typecheck` to verify all files.
4. Restart your IDE's TypeScript server.

---

### Application won't start - missing credentials

**Problem:** Application fails to start with authentication errors.

**Possible Solutions:**
1. Copy `.env.default` to `.env` if you haven't already.
2. Set all required B2C Commerce credentials.
   ```bash
   PUBLIC__app__commerce__api__clientId=your-id
   PUBLIC__app__commerce__api__organizationId=your-org
   PUBLIC__app__commerce__api__shortCode=your-code
   ```
3. Verify credentials match your Business Manager configuration.
4. Ensure the client ID has the necessary API scopes.

---

### Locale or translation not working

**Problem:** A locale doesn't appear in the language selector or translations aren't working.

**Possible Solutions:**
1. Verify the locale is in both your site's `supportedLocales` (in `commerce.sites` array) and `i18n.supportedLngs`.
2. Ensure translation files exist for the locale in your project.
3. Check the locale format matches (e.g., 'en-US' not 'en_US').
4. Verify the middleware configuration in `src/middlewares/i18next.ts` matches.

---

### Environment variable path too deep

**Problem:** Environment variable isn't working because the path is too deep.

**Possible Solutions:**
1. Environment variable paths are limited to 10 levels deep.
2. Use JSON values for deeper structures.
   ```bash
   PUBLIC__app__myFeature='{"deep":{"nested":{"structure":"value"}}}'
   ```

---

## Additional Resources

- [Configuration Guide](./README-CONFIG.md) - Detailed guide on using the configuration system
- [Environment Variables in MRT](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/guide/environment-variables.html) - Managed Runtime environment configuration
