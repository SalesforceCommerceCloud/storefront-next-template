# Authentication & Session Management

This project uses a **server-only** auth architecture. All SLAS token management—guest login, refresh, registered login, social/passwordless flows, and cookie writing—happens in a single server middleware (`auth.server.ts`) that runs on every request. Tokens never reach the browser. Client components receive only a small, non-sensitive slice of session data.

## Architecture Overview

Two layers, one source of truth:

1. **Server middleware** (`middlewares/auth.server.ts`): Runs on every request (full page loads _and_ React Router client navigations, which re-invoke the server loaders). It reads auth cookies from the `Cookie` header, validates and refreshes tokens, performs guest login when needed, and writes updated cookies via `Set-Cookie`. It is the only place tokens exist.
2. **React Context** (`providers/auth.tsx`): `AuthProvider` exposes a `PublicSessionData` object (no tokens) to components via the `useAuth()` hook. The root loader extracts this slice with `getPublicSessionData(session)` and passes it straight to the provider.

Per project rules, route modules use only server `loader`/`action` — never `clientLoader`/`clientAction`.

### Request Flow

```
Browser request (full load or client navigation)
        │
        ▼
auth.server.ts middleware
  • parse cookies from Cookie header
  • decode access-token JWT (userType, customerId, usid, expiry, tracking consent)
  • if access token valid → use it
    elif refresh token present → refresh
      if refresh fails AND user was registered → 307 redirect to /login?returnUrl=...&error=session_expired
      if refresh fails AND user was guest → guest login
    else → guest login
  • write updated tokens/metadata via Set-Cookie
        │
        ▼
root loader: getAuth(context) → full SessionData
             getPublicSessionData(session) → clientAuth (no tokens)
        │
        ▼
<AuthProvider value={clientAuth}> → useAuth() in components
```

## Cookie Architecture

All auth state is stored across separate cookies, each with its own purpose, expiry, and value source. **Every cookie is `HttpOnly`** — the browser sends them on each request (so server middleware and hybrid B2C Commerce both read them), but client JavaScript cannot. The client gets its auth state from the serialized loader data, not from reading cookies.

| Cookie             | Purpose                                              | User type  | Expiry                                   | Value source            |
| ------------------ | ---------------------------------------------------- | ---------- | ---------------------------------------- | ----------------------- |
| `cc-nx-g`          | Guest refresh token                                  | Guest      | Guest refresh expiry (max 30 days)       | SLAS body               |
| `cc-nx`            | Registered refresh token                             | Registered | Registered refresh expiry (max 90 days)  | SLAS body               |
| `cc-at`            | Access token                                         | Both       | Access-token JWT `exp`                   | SLAS body               |
| `usid`             | User session ID (mirrors JWT `sub` → `usid`)         | Both       | Refresh expiry, else access expiry       | JWT `sub` claim         |
| `enc_user_id`      | Encoded user ID                                      | Registered | Refresh expiry                           | SLAS body               |
| `idp_access_token` | IDP access token (social login)                      | Both       | Access expiry (proxy)                    | SLAS body               |
| `id_token`         | OIDC ID token                                        | Both       | Access expiry                            | SLAS body               |
| `idp_refresh_token`| IDP refresh token (social login)                     | Both       | Refresh expiry                           | SLAS body               |
| `dw_dnt`           | Tracking consent preference (value = `TrackingConsent` enum) | Both | Session                              | Cookie (source of truth) / JWT `dnt` |
| `dwsid`            | Hybrid storefront session ID (B2C Commerce session bridge)   | Both       | Session                                  | SLAS `Set-Cookie` header |
| `cc-cv`            | OAuth2 PKCE code verifier                            | Both       | 5 minutes                                | Generated (social flow) |
| `cc-auth-recover`  | 401-recovery loop guard                              | Both       | 30 seconds                               | Middleware              |

> **Value source.** Token strings come verbatim from the SLAS `TokenResponse` body. The session _facts_ — `userType`, `customerId`, `usid`, `accessTokenExpiry`, tracking consent—are decoded from the access-token JWT, not read from the body, so they can never drift from the token. `dwsid` is the exception: it comes from the SLAS response's `Set-Cookie` header.

> **`customerId` is not a cookie.** It is derived per-request from the access-token JWT and exposed through `getAuth()` (server) and `useAuth()` (client). The logout and error path also clears any legacy `customer_id` cookie left by older versions.

**Key design decisions:**

- Mutually exclusive refresh tokens: Only one of `cc-nx-g` / `cc-nx` exists at a time. On a user-type transition the other is explicitly deleted (`Set-Cookie` with an expired date).
- `userType` is never stored in a cookie: It is derived from the JWT (see below). The refresh-cookie name is only a _write-time_ decision for where to put the refresh token.
- Namespacing: Cookies are suffixed with `siteId` (e.g. `cc-nx_RefArch`), **except** `dwsid` and `dw_dnt`, which are excluded (`COOKIE_NAMESPACE_EXCLUSIONS`) so external or B2C Commerce systems can read them directly.
- `HttpOnly` everywhere: Protects every token from XSS. The client never needs cookie access because public session data arrives via the loader.

### User Type Detection

`userType` comes from the access-token JWT (registered tokens carry an `rcid` identity claim that guest tokens lack), not from which refresh cookie exists. The refresh-cookie name is consulted only as a cold-start fallback, before any access token has been issued, and to decide which refresh cookie to write or delete on the response.

### Token Expiry Management

**Access token:** the expiry is read from the JWT `exp` claim, stored as a timestamp, and compared at runtime with a fast numeric check — no repeated JWT decoding in the hot path.

**Refresh token:** configurable via environment variables, capped at Commerce Cloud maximums (guest 30 days, registered 90 days).

### 401 recovery redirect

When a SCAPI call returns **401** for a non-SLAS endpoint, the SCAPI client throws `AuthTokenInvalidError`. The middleware catches it in `handleAuthTokenInvalidation`, clears stale token state, re-runs the refresh/guest flow, and — if recovery succeeds — issues a **307 redirect** back to the same URL so the request restarts with fresh cookies. The redirect carries `x-sfnext-auth-recovery: 1` (observability only).

To prevent loops, a short-lived guard cookie `cc-auth-recover` (`Max-Age=30`) is set during recovery. If a 401 recurs while the guard is present, recovery is **not** retried — the error surfaces and the response carries `x-sfnext-auth-recovery-guard: 1`. The guard is cleared on the follow-up request.

### Registered session expiry redirect

When a **registered** shopper's SLAS refresh token fails (SLAS returns a 400), the middleware redirects to `/login` (with the site/locale prefix) instead of silently downgrading the shopper to a guest session. The redirect carries `returnUrl` (the original request path, already prefixed) and `error=session_expired` so the login page can display a contextual message. A fresh guest session is created in parallel so the application has a valid token while the redirect is processed.

The same `cc-auth-recover` guard cookie prevents redirect loops: if the guard is already set when the redirect would fire, the middleware falls through to the guest session rather than redirecting again. The guard expires after 30 seconds and is cleared on the follow-up request.

Guest shoppers whose refresh token fails are unaffected by this change. They continue to receive a new guest session silently.

### JWT Integrity Validation

SLAS guarantees `gcid`/`rcid` in `isb` and `usid` in `sub`. The middleware validates this on the **incoming cookie token** — but only when that token survived validation unchanged (`authAction === 'tokenValid'`). After a refresh or guest login, re-validation is skipped because the freshly issued token was already validated inside `updateAuthStorageDataByTokenResponse`.

If a structurally invalid token is detected (decodable but missing required claims, or undecodable), `AuthTokenInvalidError` is thrown and routed through the same recovery flow as a 401 (clear cookies → fresh login → 307 redirect). This indicates a critical token-issuance failure, so it logs at **error** level for production visibility.

## Configuration

### Environment variables (optional)

```bash
# Override guest refresh token expiry (capped at 30 days)
PUBLIC_COMMERCE_API_GUEST_REFRESH_TOKEN_EXPIRY_SECONDS=2592000

# Override registered refresh token expiry (capped at 90 days)
PUBLIC_COMMERCE_API_REGISTERED_REFRESH_TOKEN_EXPIRY_SECONDS=7776000
```

### Cookie domain

To share cookies across subdomains — or to keep session continuity in a hybrid Storefront Next + SFRA deployment — set a cookie domain via the global `app.cookies.domain` or a per-site `commerce.sites[].cookies.domain` override. It applies to **every** cookie the storefront writes and is opt-in (host-only by default). See **[Cookie Domain Configuration](./README-COOKIE-DOMAIN.md)** for the full guide: the storefront config and its precedence, the matching Business Manager setting, and rollout guidance/limitations.

Cookie attribute defaults (`path: '/'`, `sameSite: 'lax'`, `secure`) are applied automatically; the resolved cookie domain takes precedence over them. `secure` is gated on `isRemote()` (the `BUNDLE_ID` signal): `true` on deployed (HTTPS) environments, `false` on local `pnpm dev` / `pnpm preview`, which serve plain HTTP over `localhost`. Without this, Safari/WebKit silently refuses to persist `Secure` cookies on loopback and login never sticks (Chrome/Firefox mask it with a localhost exception). `SameSite=None` cookies — used in Page Designer design mode — always stay `Secure`, as the spec requires.

## Usage

### Accessing Auth on the Server

Use `getAuth(context)` in loaders and actions:

```typescript
import { getAuth } from '@/middlewares/auth.server';
import type { LoaderFunctionArgs } from 'react-router';

export async function loader({ context }: LoaderFunctionArgs) {
    const auth = getAuth(context);

    const accessToken = auth.accessToken; // server only
    const customerId = auth.customerId;
    const userType = auth.userType; // 'guest' | 'registered'
    const usid = auth.usid;

    return { customerId, isRegistered: userType === 'registered' };
}
```

### Accessing auth in client components

There is no client-side `getAuth` Client components read the non-sensitive slice via the `useAuth()` hook (tokens are never available on the client):

```typescript
import { useAuth } from '@/providers/auth';

function AccountBadge() {
    const auth = useAuth(); // PublicSessionData | undefined
    if (auth?.userType === 'registered') {
        return <span>Welcome back</span>;
    }
    return <SignInLink />;
}
```

For route-level auth checks, branch inside the server `loader`—not a client guard.

### Updating auth (login)

`updateAuth(context, updater)` accepts **either** a SLAS token response **or** a function updater:

```typescript
import { updateAuth, loginRegisteredUser } from '@/middlewares/auth.server';
import type { ActionFunctionArgs } from 'react-router';

export async function action({ request, context }: ActionFunctionArgs) {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
        const tokenResponse = await loginRegisteredUser(context, email, password);
        updateAuth(context, tokenResponse); // token-response form
        return redirect('/account');
    } catch {
        return { error: 'Login failed' };
    }
}
```

The token-response form re-derives `userType`, `customerId`, `usid`, and expiry from the new JWT, preserves the tracking-consent cookie, and writes the appropriate cookies. The function form (`updateAuth(context, (data) => ({ ...data, codeVerifier }))`) is used to merge in fields like the PKCE code verifier without a full token swap.

### Destroying auth (logout)

```typescript
import { destroyAuth } from '@/middlewares/auth.server';

export async function action({ context }: ActionFunctionArgs) {
    destroyAuth(context); // clears storage; middleware deletes all auth cookies on the response
    return redirect('/');
}
```

### Social login (OAuth2 PKCE)

```typescript
import { getAuth, updateAuth } from '@/middlewares/auth.server';

// Step 1 — generate PKCE challenge, store verifier, redirect to IDP
export async function loader({ context }: LoaderFunctionArgs) {
    const { url, codeVerifier } = await clients.auth.social.getAuthorizationUrl(/* ... */);
    updateAuth(context, (current) => ({ ...current, codeVerifier })); // stored in httpOnly cc-cv
    return redirect(url);
}

// Step 2 — exchange code for tokens (verifier read from cc-cv); cc-cv auto-deleted on the next write
export async function action({ request, context }: ActionFunctionArgs) {
    const session = getAuth(context);
    const tokenResponse = await exchangeCodeForTokens(code, session.codeVerifier); // illustrative
    updateAuth(context, tokenResponse);
    return redirect('/account');
}
```

> **CSP note:** When adding a social-login provider beyond the defaults, extend `connect-src` (and any redirect/popup origins) in your `app.security.headers.csp.directives` config. See [README-SECURITY-HEADERS.md](./README-SECURITY-HEADERS.md).

### Custom auth operations

Server-side SLAS helpers exported from `auth.server.ts`:

```typescript
import {
    loginGuestUser,
    loginRegisteredUser,
    refreshAccessToken,
    authorizePasswordless,
    getPasswordLessAccessToken,
    getPasswordResetToken,
    resetPasswordWithToken,
    requestOtp,
    verifyOtp,
    flashAuth,
    clearInvalidSessionAndRestoreGuest,
} from '@/middlewares/auth.server';

const guestTokens = await loginGuestUser(context, { usid: 'optional-usid' });
const newTokens = await refreshAccessToken(context, refreshToken);

// Passwordless (magic link)
await authorizePasswordless(context, { userid: 'user@example.com', redirectPath: '/account' });
const tokens = await getPasswordLessAccessToken(context, magicLinkToken);

// OTP email verification (validates a code without creating a new session)
await requestOtp(context, { email: 'user@example.com' });
await verifyOtp(context, { pwdActionToken, email: 'user@example.com' });

// Password reset
await getPasswordResetToken(context, { email: 'user@example.com' });
await resetPasswordWithToken(context, { email, token, newPassword });

// Recovery helpers
flashAuth(context, 'Your session expired'); // clear session + set an error message
await clearInvalidSessionAndRestoreGuest(context); // e.g. deleted customer / corrupted session
```

See [README-EMAIL-VERIFICATION.md](./README-EMAIL-VERIFICATION.md) for the OTP and passwordless flows in depth.

## Authentication Flows

### New guest user

1. User visits with no auth cookies.
2. Server middleware finds no usable token → calls SLAS guest login.
3. Server writes `cc-nx-g`, `cc-at`, `usid` (and any `dwsid` from the response).
4. Root loader serializes `clientAuth`; `AuthProvider` makes it available via `useAuth()`.

### Returning user (token valid)

1. Server reads cookies from the `Cookie` header.
2. Access-token `exp` is in the future → tokens are used as-is.
3. If the access token is expired but a refresh token exists → server refreshes and rewrites `cc-at` (+ `usid` if changed).

### Guest → registered (login)

1. Action calls `loginRegisteredUser()`; SLAS returns a registered token whose JWT carries `rcid`.
2. `updateAuth(context, tokenResponse)` derives `userType = 'registered'` from the JWT.
3. Middleware writes `cc-nx` and **deletes** `cc-nx-g` (mutual exclusivity).
4. Guest resources are merged into the registered account (see below).

### Logout

1. Action calls `destroyAuth(context)`.
2. Middleware deletes all auth cookies via expired `Set-Cookie` headers (including the legacy `customer_id`).
3. Next request finds no cookies → fresh guest login.

### Guest → registered resource merge

On any guest→registered transition (social, passwordless, standard login), guest-owned resources must be **captured before the token swap**, because `customerId` changes from the guest `gcid` to the registered `rcid` and SCAPI rejects the guest customer ID under a registered token. The social-login path demonstrates the pattern:

```typescript
// lib/api/auth/social-login.server.ts (shape)
const guestWishlistSnapshot = await captureGuestWishlistSnapshot(context); // BEFORE swap
const result = await loginIDPUser(context, /* ... */);                     // token swap (updateAuth)
await mergeBasket(context);                                                // AFTER swap
await mergeWishlist(context, guestWishlistSnapshot);                       // AFTER swap
```

Tracking consent is preserved across the swap: `updateAuthStorageData` restores the `dw_dnt` cookie value (the source of truth) after clearing storage, and login/refresh calls forward it to SLAS as the `dnt` parameter.

### Hybrid storefronts (B2C Commerce session bridge)

There is no client-side cookie sync. The bridge is the `dwsid` cookie:

1. The SDK extracts `dwsid` from the SLAS response `Set-Cookie` header and the middleware persists it.
2. `dwsid` (and `dw_dnt`) are **not namespaced**, so the B2C Commerce cartridge can read/write them directly.
3. The browser sends these cookies on every request; on the next full request the React storefront's server middleware reads them from the `Cookie` header. There is no real-time iframe/SPA sync in middleware scope.

See [README-HYBRID-PROXY.md](./README-HYBRID-PROXY.md) for the hybrid local-development setup.

## Hydration

Auth is available immediately during SSR and hydration without serializing any tokens:

- **Server:** the root loader builds full `SessionData` via `getAuth(context)`, then returns only `clientAuth = getPublicSessionData(session)` — a `Pick` of `userType`, `customerId`, `usid`, `encUserId`, `trackingConsent`.
- **Client:** the root renders `<AuthProvider value={clientAuth}>` directly. Components reading `useAuth()` see exactly the same data that produced the SSR markup, so there is no hydration gap and no bootstrap snapshot.
- **Subsequent navigations:** React Router re-invokes the root loader, which re-derives `clientAuth`. `AuthProvider` stays mounted; the root memoizes the provider tree on `clientAuth`, so only its `value` changes and `useAuth()` consumers re-render.

```typescript
// providers/auth.tsx
export const AuthContext = createContext<PublicSessionData | undefined>(undefined);
export const useAuth = (): PublicSessionData | undefined => useContext(AuthContext);

// root.tsx (shape)
const session = getAuth(context);                  // full SessionData (server only)
const clientAuth = getPublicSessionData(session);  // non-sensitive slice → loader data
// ...
<AuthProvider value={clientAuth}>{/* app */}</AuthProvider>
```

This keeps a single server source of truth, exposes no tokens to the client, and maintains a stable provider tree.

## Best Practices

- **Server versus client:** Use `getAuth(context)` in loaders and actions, and `useAuth()` in components. Tokens are server-only.
- **No direct cookie writes:** Always go through `updateAuth()` or `destroyAuth()`—the middleware owns cookie serialization.
- **User-type checks:** Use `auth.userType`, which is JWT-derived.
- **Token refresh:** Handled automatically by the middleware. Don't refresh manually in routes.
- **Capture before swap:** On guest-to-registered login, snapshot guest resources before the token swap and merge after.
- **Security:** Never log or expose `accessToken` or `refreshToken`.
- **No `clientLoader` or `clientAction`:** Route modules use the server `loader` and `action` only.

## Type Safety

```typescript
import type { SessionData, PublicSessionData } from '@/lib/api/types';

// Full server-side session (tokens included — never serialized to the client)
type SessionData = {
    accessToken?: string;
    accessTokenExpiry?: number;
    refreshToken?: string;
    refreshTokenExpiry?: number;
    customerId?: string;
    userType?: 'guest' | 'registered';
    usid?: string;
    encUserId?: string;
    codeVerifier?: string;          // OAuth2 PKCE (server-only, ephemeral)
    idpAccessToken?: string;
    idpAccessTokenExpiry?: number;
    idToken?: string;               // OIDC id_token (server-only)
    idpRefreshToken?: string;       // social login (server-only)
    dwsid?: string;                 // hybrid storefront session bridge
    trackingConsent?: TrackingConsent;
};

// The only data exposed to the client (Pick — stays in sync with SessionData)
type PublicSessionData = Pick<
    SessionData,
    'customerId' | 'userType' | 'usid' | 'encUserId' | 'trackingConsent'
>;
```

## File Structure

```
src/
├── middlewares/
│   ├── auth.server.ts        # Server auth middleware, SLAS operations, cookie I/O, getAuth/updateAuth/destroyAuth
│   └── auth.utils.ts         # Cookie-name constants, JWT decoding/claims, userType derivation, getPublicSessionData
├── providers/
│   └── auth.tsx              # AuthContext + AuthProvider + useAuth() (PublicSessionData only)
└── lib/
    ├── cookie-utils.server.ts  # getCookieConfig, createCookie, namespacing, parseAllCookies
    ├── auth/                   # passwordless-login.server.ts, error-handler.ts
    └── api/auth/               # register, standard-login, social-login, reset-password (.server.ts)
```
