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
import type { RouterContextProvider } from 'react-router';
import { createCookie, getCookieConfig, type Cookie } from '@/lib/cookie-utils.server';

/**
 * Remembers the exact email a shopper submitted when requesting an emailed link (passwordless
 * login or password reset), so the landing page can use it without the link carrying it. Keeps
 * the shopper email out of the link URL (and therefore out of request logs, browser history, and
 * Referer headers). Each flow has its own cookie so finishing one never clears the other.
 */
export const COOKIE_PASSWORDLESS_EMAIL = 'cc-pwdless-email';
export const COOKIE_PASSWORD_RESET_EMAIL = 'cc-pwreset-email';

/** Seconds. Long enough to cover the passwordless and password reset token lifetimes. */
export const REMEMBERED_EMAIL_MAX_AGE = 15 * 60;

const getRememberedEmailCookie = (name: string, context: Readonly<RouterContextProvider>): Cookie<string> =>
    createCookie<string>(name, getCookieConfig({ httpOnly: true, maxAge: REMEMBERED_EMAIL_MAX_AGE }, context), context);

const serializeRememberedEmail = (name: string, context: Readonly<RouterContextProvider>, email: string) =>
    getRememberedEmailCookie(name, context).serialize(encodeURIComponent(email));

const clearRememberedEmail = (name: string, context: Readonly<RouterContextProvider>) =>
    getRememberedEmailCookie(name, context).serialize('', { maxAge: 0 });

const readRememberedEmail = async (
    name: string,
    request: Request,
    context: Readonly<RouterContextProvider>
): Promise<string | undefined> => {
    const value = await getRememberedEmailCookie(name, context).parse(request.headers.get('Cookie'));
    if (!value) return undefined;
    try {
        return decodeURIComponent(value) || undefined;
    } catch {
        return undefined;
    }
};

/** Returns a Set-Cookie header value that remembers `email` for the magic-link landing page. */
export const serializePasswordlessEmailCookie = (context: Readonly<RouterContextProvider>, email: string) =>
    serializeRememberedEmail(COOKIE_PASSWORDLESS_EMAIL, context, email);

/** Returns a Set-Cookie header value that removes the remembered passwordless email. */
export const clearPasswordlessEmailCookie = (context: Readonly<RouterContextProvider>) =>
    clearRememberedEmail(COOKIE_PASSWORDLESS_EMAIL, context);

/** Reads the remembered passwordless email from the request, or undefined if none. */
export const readPasswordlessEmailCookie = (request: Request, context: Readonly<RouterContextProvider>) =>
    readRememberedEmail(COOKIE_PASSWORDLESS_EMAIL, request, context);

/** Returns a Set-Cookie header value that remembers `email` for the reset password page. */
export const serializePasswordResetEmailCookie = (context: Readonly<RouterContextProvider>, email: string) =>
    serializeRememberedEmail(COOKIE_PASSWORD_RESET_EMAIL, context, email);

/** Returns a Set-Cookie header value that removes the remembered password reset email. */
export const clearPasswordResetEmailCookie = (context: Readonly<RouterContextProvider>) =>
    clearRememberedEmail(COOKIE_PASSWORD_RESET_EMAIL, context);

/** Reads the remembered password reset email from the request, or undefined if none. */
export const readPasswordResetEmailCookie = (request: Request, context: Readonly<RouterContextProvider>) =>
    readRememberedEmail(COOKIE_PASSWORD_RESET_EMAIL, request, context);
