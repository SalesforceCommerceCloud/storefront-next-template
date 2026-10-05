# Email Cartridge

The `app_storefrontnext_base` cartridge exposes a SCAPI Custom API (`POST /notify`) that the storefront BFF calls to send transactional notifications. The default implementation uses B2C Commerce's built-in mail delivery — no external email service required — but the cartridge is designed to be replaced or extended.

Email types supported out of the box:

| `type` | Use |
|---|---|
| `passwordless-magic-link` | Passwordless sign-in link |
| `password-reset` | Password reset link |
| `otp` | One-time verification code |
| _(hook)_ `sfcc.app.order.sendOrderAccessCode` | Guest order lookup access code |

## Setup

### 1. Register the SLAS scope

Run once after creating your project. This adds the `c_sfnext_notify` scope to the SLAS client so the storefront token is authorized to call the email API.

```bash
sfnext setup-base-cartridge --slas-client-id <your-slas-client-id>
```

The command reads `SFCC_SHORTCODE`, `SFCC_TENANT_ID`, `SFCC_OAUTH_CLIENT_ID`, and `SFCC_OAUTH_CLIENT_SECRET` from your environment (or `dw.json`). It is idempotent — safe to re-run.

### 2. Deploy the cartridge

```bash
sfnext cartridge:deploy --reload
```

### 3. Configure Business Manager

1. **Cartridge path** — add `app_storefrontnext_base` to your site's cartridge path: Administration > Sites > Manage Sites > [your site] > Settings.

2. **Import global preference metadata** — import the preference definition so Business Manager knows about `sfnextStorefrontHost`:

   Administration > Site Development > Import & Export > Import > Upload file:
   `cartridges/app_storefrontnext_base/staticfiles/cartridge/impex/default/meta/custom-objects.xml`

   This only needs to be done once per B2C organization. It creates the `sfnext` custom preference group and registers the `sfnextStorefrontHost` attribute on `OrganizationPreferences`.

3. **Set the storefront hostname** — after importing the metadata, set the preference value:

   Administration > Global Preferences > Custom Preferences > `sfnext` > `Storefront Host`

   Enter the public-facing hostname of your MRT storefront — no protocol, no trailing slash:

   ```
   my-store.salesforcecommercecloudsites.com
   ```

   This is a global (organization-level) preference because one MRT environment serves all B2C sites in the organization — the hostname is the same regardless of which site the email originates from. Magic-link emails (password reset, passwordless login) use this value to construct the link the shopper clicks. If not set, the cartridge falls back to `Site.getCurrent().httpsHostName` and logs a warning — links will point to the B2C instance and fail to resolve.

### 4. Enable callback mode in storefront config

The cartridge is only called when the storefront is configured to use callback delivery. Set these env vars in your MRT environment (or `.env` for local dev):

```bash
# Switch delivery from SLAS to your storefront BFF → cartridge
PUBLIC__app__features__passwordlessLogin__mode=callback
PUBLIC__app__features__otpRequest__mode=callback
PUBLIC__app__features__resetPassword__mode=callback

# Required when mode=callback — the absolute URL SLAS will POST to
# passwordlessLogin and resetPassword use a bare path (one URL covers all sites/locales):
PUBLIC__app__features__passwordlessLogin__callbackUri=https://your-storefront.example.com/passwordless-login-callback
PUBLIC__app__features__resetPassword__callbackUri=https://your-storefront.example.com/reset-password-callback
# OTP carries the site/locale prefix — register one URL per site (see OTP callback mode below):
PUBLIC__app__features__otpRequest__callbackUri=https://your-storefront.example.com/en-US/otp-callback
```

Each mode defaults to `'email'` (SLAS delivers the email itself). Switch to `'callback'` to route delivery through the cartridge. **Both `mode` and `callbackUri` must be set — `mode=callback` with a missing or empty `callbackUri` silently drops all callbacks.**

## Disabling the notification feature

If you already have a custom email provider (Marketing Cloud, a third-party service, or your own `sendOrderAccessCode` hook implementation) and want to keep `app_storefrontnext_base` in your cartridge path for its other features (Page Designer components), you can disable the built-in notification feature entirely:

1. Import the metadata (step 3 in Setup above) to register the preference schema if you haven't already.
2. In Business Manager: **Administration > Global Preferences > Custom Preferences > sfnext > Notifications Enabled** → set to **false**.

With this set, the `sfnext-notify` REST API returns `503` and the `sendOrderAccessCode` hook is a no-op — no emails are sent by the cartridge. Your existing email implementation continues to work unchanged.

When the preference is unset (the default for new installs), notifications are enabled.

## Post-deploy scope check

After every `cartridge:deploy` that includes `app_storefrontnext_base`, the `b2c:operation-lifecycle` hook checks whether `c_sfnext_notify` is registered on the SLAS client (using `SFCC_SHORTCODE`, `SFCC_TENANT_ID`, and the deploy context's OAuth credentials). If the scope is missing, you'll see a warning in your deploy output:

```
⚠ The app_storefrontnext_base cartridge is deployed but the c_sfnext_notify scope is not registered on your SLAS client.
  Run: sfnext setup-base-cartridge --slas-client-id <clientId>
```

The check is purely advisory — it never blocks a deploy. If credentials are absent the check is skipped silently.

## How notifications are sent

The BFF calls `sendNotification()` from `src/lib/notify/notify.server.ts`. Authentication reuses the shopper's existing SLAS token — no additional credentials are needed.

```typescript
import { sendNotification } from '@/lib/notify/notify.server';

await sendNotification(context, {
    type: 'otp',
    recipient: 'shopper@example.com',
    data: { token: '123456' },
});
```

The BFF does not know or care how the notification is delivered — that is entirely the cartridge's concern. This separation means you can change the delivery provider without touching the storefront code.

## Customizing the delivery

The primary customization point is `cartridge/scripts/helpers/sendNotification.js`. The `send()` function there receives the resolved recipient, subject, template name, and context variables. By default it renders an ISML template and delivers via `dw/net/Mail`. To use a different provider — including SMS or a third-party email service — replace that function's body:

```js
// cartridge/scripts/helpers/sendNotification.js

function send(recipient, subject, templateName, context) {
    // Replace with your provider's SDK or an HTTP service call.
    // e.g. call SendGrid, Mailchimp, Postmark, an SMS gateway, etc.
    var service = require('*/cartridge/scripts/services/myNotificationService');
    var result = service.send({ to: recipient, subject: subject, templateId: templateName, data: context });
    return result.ok ? { error: false } : { error: true, errorMessage: result.errorMessage };
}
```

The function signature (`recipient`, `subject`, `templateName`, `context`) is the contract between the API handler and the delivery layer. Keep it stable when swapping implementations.

## Customizing email templates

If you keep the default ISML sender, templates live in `cartridge/templates/default/email/`. Edit them to match your brand — colors, logo, copy, layout.

| Template | Variables |
|---|---|
| `passwordlessMagicLink.isml` | `${pdict.magicLink}` |
| `passwordResetMagicLink.isml` | `${pdict.magicLink}` |
| `otpVerification.isml` | `${pdict.token}` |
| `gloAccessCode.isml` | `${pdict.orderNo}`, `${pdict.accessCode}` |

The sender address defaults to the `customerServiceEmail` site preference, falling back to `no-reply@<site-hostname>`.

## Adding a new email type

1. Add a branch in `cartridge/rest-apis/sfnext-notify/Notify.js` that maps the new type string to a subject and template name:

```js
} else if (type === 'order-confirmation') {
    if (!body.data.orderNo) {
        RESTResponseMgr.createError(400, 'missing-order-no', 'Bad Request', 'Missing data.orderNo').render();
        return;
    }
    subject = Resource.msg('orderConfirmation.subject', 'email', 'Your Order Confirmation');
    templateName = 'email/orderConfirmation';
    context = { orderNo: body.data.orderNo };
}
```

2. Add the new type to `NotifyType` and `NotifyPayload` in `src/lib/notify/notify.server.ts` and to the OpenAPI schema `cartridge/rest-apis/sfnext-notify/schema.yaml`.
3. Create the ISML template in `cartridge/templates/default/email/`.
4. Redeploy the cartridge.

## Password reset callback mode

When `features.resetPassword.mode` is `callback`, SLAS calls your storefront's callback endpoint server-to-server instead of sending the password-reset email itself. Use this when you want to deliver the reset link via your own email service.

### How the callback works

1. Shopper submits the forgot-password form.
2. SLAS makes a `POST` to `callbackUri` with:
   - Header: `x-slas-callback-token` — a signed JWT issued by SLAS
   - Body: `{ "email_id": "shopper@example.com", "token": "<reset-token>" }`
3. The storefront validates the JWT (verifying the SLAS signature via JWKS), builds a magic link using the `token`, and sends a `password-reset` email via the cartridge.
4. Shopper clicks the magic link, lands on `features.resetPassword.landingUri`, and sets a new password.

### SLAS Admin configuration

In SLAS Admin, register the absolute URL for each environment under **Callback URL**. SLAS does exact URL matching — no wildcards.

The storefront registers `/reset-password-callback` at a bare path (no `/:siteId/:localeId` prefix), so **a single registration covers all sites and locales**:

```
https://your-storefront.example.com/reset-password-callback
```

Set `features.resetPassword.callbackUri` to this same value so the storefront sends the matching URL when it initiates a password-reset request:

```bash
PUBLIC__app__features__resetPassword__callbackUri=https://your-storefront.example.com/reset-password-callback
```

### JWKS validation

The storefront validates `x-slas-callback-token` by fetching the SLAS JWKS endpoint:

```
https://{shortCode}.api.commercecloud.salesforce.com/shopper/auth/v1/organizations/{organizationId}/oauth2/jwks
```

On some sandbox environments (e.g. `sandbox-001`), Cloudflare blocks outbound requests from MRT Lambda IPs to this endpoint with a 403. In that case, preload the JWKS JSON as an environment variable:

1. Fetch the JWKS from a machine that can reach SLAS:
   ```bash
   curl https://{shortCode}.api.commercecloud.salesforce.com/shopper/auth/v1/organizations/{organizationId}/oauth2/jwks
   ```
2. Set `SLAS_JWKS_JSON` in your MRT environment variables to the full JSON string returned by that request.

When `SLAS_JWKS_JSON` is set, the Lambda skips the network fetch entirely and uses the preloaded keys. On production environments where the SLAS endpoint is reachable, this variable is not needed.

## Passwordless login callback mode

When `features.passwordlessLogin.mode` is `callback`, SLAS calls your storefront's callback endpoint server-to-server instead of sending the magic link email itself.

### How the callback works

1. Shopper submits their email on the login page.
2. SLAS makes a `POST` to `callbackUri` with:
   - Header: `x-slas-callback-token` — a signed JWT issued by SLAS
   - Body: `{ "email_id": "shopper@example.com", "token": "<magic-link-token>" }`
3. The storefront validates the JWT (verifying the SLAS signature via JWKS), builds a magic link, and sends a `passwordless-magic-link` email via the cartridge.
4. Shopper clicks the magic link, lands on `features.passwordlessLogin.landingUri`, and is logged in.

### SLAS Admin configuration

Register the absolute callback URL in the SLAS client under **Callback URL**. SLAS does exact URL matching — no wildcards.

The storefront registers `/passwordless-login-callback` at a bare path (no `/:siteId/:localeId` prefix), so **a single registration covers all sites and locales**:

```
https://your-storefront.example.com/passwordless-login-callback
```

### JWKS validation and `SLAS_JWKS_JSON`

The storefront validates `x-slas-callback-token` using the same JWKS mechanism as the password-reset callback. On sandbox environments where Cloudflare blocks outbound Lambda requests to the SLAS JWKS endpoint, set `SLAS_JWKS_JSON` — see [JWKS validation](#jwks-validation) above.

## OTP callback mode

When `features.otpRequest.mode` is `callback`, SLAS calls your storefront's callback endpoint server-to-server instead of sending the OTP code email itself.

### How the callback works

1. Shopper requests an OTP code (e.g., during registration or email verification).
2. SLAS makes a `POST` to `callbackUri` with:
   - Header: `x-slas-callback-token` — a signed JWT issued by SLAS
   - Body: `{ "email_id": "shopper@example.com", "token": "<otp-code>" }`
3. The storefront validates the JWT (verifying the SLAS signature via JWKS) and sends an `otp` email via the cartridge.
4. Shopper enters the code to complete verification.

### SLAS Admin configuration

Register the absolute callback URL in the SLAS client under **Callback URL**. SLAS does exact URL matching — no wildcards.

> **URL shape differs from password-reset and passwordless-login callbacks.** Those callbacks are registered as bare routes (no `/:siteId/:localeId` prefix), so one URL covers all sites. The OTP callback goes through the catch-all route and **does carry the site/locale prefix** in multi-site deployments. Register a separate URL per site:
> ```
> https://your-storefront.example.com/en-US/otp-callback
> ```
> Set `features.otpRequest.callbackUri` to the corresponding value:
> ```bash
> PUBLIC__app__features__otpRequest__callbackUri=https://your-storefront.example.com/en-US/otp-callback
> ```

### JWKS validation and `SLAS_JWKS_JSON`

The storefront validates `x-slas-callback-token` using the same JWKS mechanism as the password-reset callback. See [JWKS validation](#jwks-validation) above.

## JWKS token validation — known security limitations

The `x-slas-callback-token` validation currently verifies:

- **Signature** — the token was signed by SLAS using a key from the SLAS JWKS endpoint
- **Algorithm** — constrained to `RS256` and `ES256` to prevent algorithm confusion
- **Tenant** — the issuer tenant ID matches your configured `organizationId`

**Not yet validated: `aud` (audience) claim.** The callback token's `aud` format has not been confirmed from SLAS documentation as of the initial release. Without this check, any SLAS-signed JWT for the same tenant technically passes validation. This will be tightened before GA once the expected `aud` value is confirmed — see the TODO comment in `src/lib/notify/notify.server.ts`.

## Sandbox vs production

On ODS sandboxes, `dw/net/Mail` does send email — but with two important differences from production:

**Sender is rewritten.** ODS unconditionally rewrites both the SMTP envelope-from and the `From:` header to `noreply@ap01.dx.commercecloud.salesforce.com`, regardless of the `customerServiceEmail` site preference. Recipients will see this address, not your brand domain.

**Per-address bounce blocking.** If a recipient address has previously bounced or been flagged as a complaint on ODS's shared SES infrastructure, ODS silently blocks delivery to that address. The `mail.send()` call returns success (no error thrown), but the message is never sent. This is the most common reason emails appear to work (API returns `{"success": true}`) but never arrive.

To diagnose: try sending to a different recipient address (e.g. a personal Gmail). If that succeeds, the original address is bounce-blocked on ODS. To unblock it, ask in the `#cc-ods-public` Slack channel — the ODS/CCDX team can check the smtp-relay logs and remove the block.

The `sfnext-notify` log file (readable via WebDAV at `Logs/sfnext-notify-*.log`) will confirm whether `mail.send()` reported success from the script's perspective.
