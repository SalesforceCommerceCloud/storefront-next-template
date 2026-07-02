---
title: Checkout Login
domain: Checkout
status: active
version: 1
created: 2026-05-28
last_updated: 2026-05-28
author: Avinash Kumar
---

## Overview

How shopper login works at the checkout contact step, given the site's email-verification preference and the SLAS response.

## Behavior

| `emailVerificationEnabled` | SLAS response | Checkout behavior |
|---|---|---|
| `true` | 200 (verified) | OTP modal opens; shopper signs in via passwordless OTP |
| `true` | 400 + `email not verified` | Storefront silently re-issues `/passwordless/login` without `strict_verify`; OTP modal opens; `/passwordless/token` verifies the email and signs the shopper in atomically |
| `true` | 400 (other) | Standard login modal (email + password) |
| `true` | 5xx | Standard login modal |
| `true` | 403 / 404 | Continue as guest |
| `false` | n/a (SLAS not called) | Standard login modal (email + password); registration checkbox hidden; post-order registration card shown on order confirmation |

## Notes

- The recovery branch (`emailVerificationEnabled=true` + `400 + email not verified`) handles shoppers mid-email-change who haven't completed OTP verification. SLAS only emits this status when the pref is enabled.
- The login modal submits to the site/locale-prefixed `/login` route. Successful login redirects back to `/checkout` and dismisses the modal.
- The post-order registration card on order confirmation only appears when the pref is disabled (i.e., the shopper couldn't be passwordless-registered during checkout).
