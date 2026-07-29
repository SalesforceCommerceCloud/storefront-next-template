# Turnstile Test Plan

Complete testing guide for Cloudflare Turnstile bot protection.

## Integration

**Location:** Checkout `ContactInfo` component (`src/components/checkout/components/contact-info.tsx`)

**Trigger:** Passwordless login when email field loses focus → POST to `/action/authorize-passwordless-email` with `turnstileToken`

**Note:** Login page has Turnstile available but does not currently use passwordless login.

## Quick Start

```bash
# 1. Start dev server
cd packages/template
pnpm dev

# 2. Run E2E tests
cd e2e
pnpm e2e --grep "@turnstile"

# Expected: 6 passed in ~23s
```

## Test Keys

| Sitekey | Behavior | Mode | Use Case |
|---------|----------|------|----------|
| **`1x00000000000000000000BB`** | **Always passes** | **Invisible** | **Default (E2E tests)** |
| `2x00000000000000000000BB` | Always fails | Invisible | Error handling |
| `1x00000000000000000000AA` | Always passes | Visible | Debugging |
| `2x00000000000000000000AB` | Always fails | Visible | Error handling |
| `3x00000000000000000000FF` | Forces challenge | Visible | Interactive UX |

Source: [Cloudflare Turnstile Testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)

## Automated Tests

**File:** `e2e/src/specs/core/checkout-turnstile.spec.ts`

| Test | Key | Validates |
|------|-----|-----------|
| Script loading | `1x00000000000000000000BB` | CDN load, API, widget DOM |
| Token generation | `1x00000000000000000000BB` | Token in request FormData |
| Graceful degradation | `1x00000000000000000000BB` | Form works, no errors |
| Error handling | `2x00000000000000000000BB` | Challenge fails, form works |
| Visible mode | `1x00000000000000000000AA` | Widget container exists |
| Interactive challenge | `3x00000000000000000000FF` | Widget container exists |

**Run:**
```bash
pnpm e2e --grep "@turnstile"          # All tests
pnpm e2e --grep "@checkout-ac30"      # AC30 only
pnpm e2e --grep "@error-handling"     # Error handling
```

## Manual Testing

**Setup:**
1. Add product to cart
2. Navigate to: http://localhost:5173/checkout
3. Open DevTools (Console + Network tabs)

**Check 1: Script loaded**
```javascript
document.querySelector('script[src*="challenges.cloudflare.com"]')
// Should return: <script> element

window.turnstile
// Should return: Object with render, reset, remove methods
```

**Check 2: Widget exists**
```javascript
document.querySelector('[data-testid="turnstile-widget"]')
// Should return: <div> element
```

**Check 3: Token in request**
1. Enter email in Contact Info
2. Tab/click outside field (blur) → triggers passwordless login
3. Check Network tab for POST to `/action/authorize-passwordless-email`
4. View Payload → should include `turnstileToken` field

## Test Scenarios

### Scenario 1: Happy Path (Default)

**Config:** Already configured in `config.server.ts`
```typescript
siteKeys: { 'http://localhost:5173': '1x00000000000000000000BB' },
mode: 'invisible'
```

**Expected:**
- No visible UI
- Token generated in ~1-3 seconds
- Token included in request
- Form works smoothly

**E2E:** Fully automated (3 tests)

### Scenario 2: Error Handling

**Config:**
```typescript
siteKeys: { 'http://localhost:5173': '2x00000000000000000000BB' },
mode: 'invisible'
```

**Expected:**
- Console warning: `[Turnstile] Challenge failed`
- No error UI shown to user
- Form works without token
- Passwordless login proceeds

**E2E:** Fully automated

**Manual:** Change config, restart dev server, test in browser

### Scenario 3: Visible Mode (Debugging)

**Config:**
```typescript
siteKeys: { 'http://localhost:5173': '1x00000000000000000000AA' },
mode: 'visible'
```

**Expected:**
- Visible checkbox: "Verify you are human"
- User clicks checkbox
- Token generated after interaction

**Manual:** Change config, restart dev server, verify checkbox appears

### Scenario 4: Interactive Challenge

**Config:**
```typescript
siteKeys: { 'http://localhost:5173': '3x00000000000000000000FF' },
mode: 'visible'
```

**Expected:**
- Interactive challenge (puzzle, image selection)
- User completes challenge
- Token generated

**Manual:** Change config, restart dev server, complete challenge

## Troubleshooting

### Script Not Loading
**Cause:** Ad blocker or CSP

**Check:**
```javascript
document.querySelector('script[src*="challenges.cloudflare.com"]')
// Should not be null
```

**Fix:**
- Disable ad blocker for localhost
- Check console for CSP errors

### Token Not Generated
**Cause:** Widget initialization failed

**Check:**
```javascript
window.turnstile  // Should be defined
```

**Expected:** Console warnings logged, form works without token (graceful degradation)

### Configuration Issues
**Fix:** Verify `config.server.ts` has correct site key, restart dev server

## Configuration

**Development** (`config.server.ts`):
```typescript
security: {
  turnstile: {
    siteKeys: { 'http://localhost:5173': '1x00000000000000000000BB' },
    enabled: true,
    mode: 'invisible'
  }
}
```

**Production:**
```typescript
security: {
  turnstile: {
    siteKeys: { 'https://your-store.com': 'YOUR_PRODUCTION_KEY' },
    enabled: true,
    mode: 'invisible'
  }
}
```

Get production keys: https://dash.cloudflare.com/?to=/:account/turnstile

## Related Files

- **Feature Spec:** `e2e/feature-specs/checkout/turnstile-protection.spec.md`
- **E2E Tests:** `e2e/src/specs/core/checkout-turnstile.spec.ts`
- **Implementation:** `src/components/checkout/components/contact-info.tsx`
- **Widget:** `src/components/security/turnstile-widget.tsx`
- **Config:** `config.server.ts`
