# Email Verification

Email verification confirms shopper identity using a one-time passcode (OTP). When enabled via a Business Manager site preference, it activates passwordless registration and login as the default flows, adds a verification badge to account details, and allows shoppers to update their email address with OTP-based identity confirmation.

## Prerequisites

Before enabling email verification:

1. Configure a SLAS private client with passwordless login enabled. See [Configure a SLAS Private Client](https://developer.salesforce.com/docs/commerce/commerce-api/guide/slas-passwordless-login.html#configure-a-slas-private-client).
2. In `config.server.ts`, set `commerce.api.privateKeyEnabled: true`. If `false`, passwordless login is disabled at runtime regardless of the site preference.
3. Enable **Enable Loginid Updates for SCAPI** (must be requested via Salesforce support). This allows shoppers to update their login email via SCAPI — required for the Change Email flow.
4. In **Merchant Tools > Site Preferences > Storefront Login Preferences**, turn on **Enable Email Verification**.

> Site preference changes can take up to 5 minutes to propagate to a deployed storefront.

## Configuration

Email verification behavior is controlled by `auth`, `features.otpRequest`, and `features.passwordlessLogin` in `config.server.ts`:

```ts
auth: {
  otpLength: 6,  // Valid values: 6 or 8. Must match the OTP length configured in your SLAS private client.
},
features: {
  otpRequest: {
    mode: 'email',       // 'email' (default) or 'callback'. Only 'email' supports email verification.
    callbackUri: '',     // Required when mode is 'callback'. Must be an absolute URI allowlisted in the SLAS client.
  },
  passwordlessLogin: {
    callbackUri: '/passwordless-login-callback',  // Path SLAS redirects the shopper to after passwordless auth. Must match the redirect URI allowlisted in your SLAS client.
    landingUri: '/login',                          // Path the shopper is sent to after a successful passwordless login.
  },
},
```

These can also be set via MRT environment variables:

```sh
PUBLIC__app__auth__otpLength=6
PUBLIC__app__features__otpRequest__mode=email
PUBLIC__app__features__otpRequest__callbackUri=https://www.example.com/otp-callback
```

### OTP Delivery Modes

| Mode | How OTP is delivered | Supports email verification? |
| --- | --- | --- |
| `email` | SLAS sends the OTP directly to the shopper's email | Yes |
| `callback` | SLAS POSTs the OTP to your `callbackUri`; you deliver it (email, SMS, etc.) | No |

**Email mode** requires configuring the SLAS client for [Passwordless Login with Email](https://developer.salesforce.com/docs/commerce/commerce-api/guide/slas-passwordless-login-email.html). No `callbackUri` is needed.

**Callback mode** requires the `callbackUri` to exactly match an allowlisted URL in the SLAS client (full URL, no wildcards). Email verification features (badge, Change Email, passwordless registration) are not available in callback mode.

### Passkey Registration OTP

`features.passkey.mode` and `features.passkey.callbackUri` control delivery of the OTP that authorizes passkey registration ([`PasskeyRegistrationModal`](../src/components/passkeys/passkey-registration-modal.tsx)), following the same `email`/`callback` modes and `callbackUri` allowlisting rules as above. See [features.passkey.mode](./README-CONFIG-OPTIONS.md#featurespasskeymode) for config reference.

## Feature Behavior

### Registration

When email verification is **OFF**, the standard password-based registration form is shown. Account is created without any verification.

When email verification is **ON**, there are two registration paths:

#### Path A: Passwordless registration (default)

1. Shopper submits name + email. No password field is shown.
2. Storefront calls the SLAS passwordless login endpoint, which creates the account and sends an OTP.
3. Shopper enters the OTP in a verification modal.
4. OTP verified → account created, shopper logged in, My Account shows verified email.
5. OTP skipped/closed → no account created, shopper not logged in.

#### Path B: Password-based registration with email verification

1. Shopper clicks "Create account with password" and submits name + email + password.
2. Account is created and an OTP is immediately sent to the registered email.
3. Shopper enters the OTP in a verification modal.
4. OTP verified → shopper logged in, My Account shows verified email.
5. OTP skipped/closed → account is still created, shopper is logged in, My Account shows unverified email. If the OTP request itself fails (server error), the shopper is redirected without any verification prompt.

### Login

When email verification is **OFF**, the login page shows email + password fields, "Forgot your password?", and social login options (if configured).

When email verification is **ON**, the login page shows passwordless login as the default (email only + "Continue" button to trigger OTP). "Login with password" is available as a secondary option. "Forgot your password?" and social login options remain available.

### Account Details

**Verification badge:** The email field displays a **Verified** badge or **Unverified** status when email verification is enabled.

**Change Email flow:** The "Change Email" button only appears when the site preference is on. Identity confirmation before the change depends on account type:

| Account type | Identity confirmation method |
| --- | --- |
| Passwordless (no password set) | OTP sent to current email |
| Password-based | Shopper enters current password |

**Password card for passwordless accounts:** Accounts without a password show "Reset password" (not "Change password") in the Password & Security card, allowing shoppers to set a password if they choose. The password field displays "Not provided".

## Checkout

For checkout login behavior, see [checkout-login.spec.md](../e2e/feature-specs/checkout/checkout-login.spec.md).

### Post-order registration

When email verification is **disabled**, the order confirmation page shows a registration card for guests who opted in via the "Save my info" checkbox during checkout. On registration, order data (addresses, payment, phone) is saved to the new profile.

When email verification is **enabled**, the post-order registration card is not shown. Shoppers register via the passwordless flow before or after checkout.

## Troubleshooting

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| OTP not delivered (email mode) | Sender email not configured in SLAS; password action email template not set | Verify SLAS email configuration |
| OTP not delivered (callback mode) | `callbackUri` not allowlisted or endpoint unreachable | Ensure `callbackUri` exactly matches an allowlisted URL in the SLAS client (full URL, no wildcards); confirm the endpoint is publicly accessible |
| OTP modal shows the wrong number of input slots for the delivered code | `auth.otpLength` in `config.server.ts` doesn't match the SLAS client OTP length. SLAS owns the delivered length; `otpLength` only sets the modal's initial slot count. | Set `auth.otpLength` to `6` or `8` to match your SLAS private client so the slot count and copy are correct. The modal tolerates a mismatch regardless: pasting a code longer than `otpLength` expands the inputs to fit (up to 8), and the code auto-submits once the visible slots are filled — so a drift no longer hard-blocks login. (A code longer than `otpLength` that is *typed by hand* rather than pasted won't expand the inputs; paste it, or correct the config.) |
| Passwordless registration form not shown | "Enable Email Verification" site preference is off | Enable the preference in Business Manager; allow up to 5 minutes to propagate |
| Verification badge or "Change Email" button missing | "Enable Email Verification" is off or hasn't propagated | Enable the preference; allow up to 5 minutes to propagate |
| Shopper can't log in after email update, **or** an email change with a wrong current password is **accepted** instead of rejected | "Enable Loginid Updates for SCAPI" is not enabled, or the instance is on B2C **< 24.7**. With both in place, `currentPassword` is validated against the shopper's existing password and SCAPI returns **HTTP 400** on mismatch; without them, SCAPI returns 200, the email change commits, and the login ID is not synced (or the password is never validated). | Use a B2C ≥ 24.7 instance and ask Salesforce support to enable "Enable Loginid Updates for SCAPI". The storefront routes the SCAPI 400 to the "Failed to update email address" toast. |
