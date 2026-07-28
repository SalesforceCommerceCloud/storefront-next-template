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

import type { HealingRecipe } from './types';

/**
 * Search Input - Header search field
 * Primary: input[data-testid*="search"]
 */
export const searchInputRecipe: HealingRecipe = {
    name: 'searchInput',
    description: 'Search input field in storefront header',
    selectors: [
        'input[data-testid*="search"]', // Primary selector from page object
        'input[type="search"]', // Semantic HTML
        'input[placeholder*="search" i]', // Placeholder text
        'input[aria-label*="search" i]', // Accessibility label
        'header input[type="text"]', // Location + type
        '[role="searchbox"]', // ARIA role
    ],
    context: 'Located in storefront header, used for product search',
    fallbackStrategy: 'Look for input field in header navigation area',
};

/**
 * Cart Icon - Shopping cart button/link
 * Primary: [data-testid*="cart"]
 */
export const cartIconRecipe: HealingRecipe = {
    name: 'cartIcon',
    description: 'Shopping cart icon in header navigation',
    selectors: [
        '[data-testid*="cart"]', // Primary selector from page object
        'a[href*="/cart"]', // Cart page link
        'button[aria-label*="cart" i]', // Accessibility label
        '[aria-label*="shopping cart" i]', // Full label variant
        'header [class*="cart"]', // Header cart element
        '[data-testid*="mini-cart"]', // Mini cart variant
    ],
    context: 'Located in header, shows cart item count badge',
    fallbackStrategy: 'Look for clickable element in header with cart-related attributes',
};

/**
 * User Icon - Account/login button
 * Primary: [data-testid*="user"]
 */
export const userIconRecipe: HealingRecipe = {
    name: 'userIcon',
    description: 'User account icon in header navigation',
    selectors: [
        '[data-testid*="user"]', // Primary selector from page object
        '[data-testid*="account"]', // Account variant
        'a[href*="/account"]', // Account page link
        'a[href*="/login"]', // Login page link
        'button[aria-label*="account" i]', // Accessibility label
        '[aria-label*="user" i]', // User label variant
        'header [class*="user"]', // Header user element
    ],
    context: 'Located in header, opens account menu or navigates to login',
    fallbackStrategy: 'Look for clickable element in header with user/account-related attributes',
};

/**
 * User Menu Logout Button - "Log out" button inside the account popover menu
 * Primary: [data-testid="user-menu-logout"]
 */
export const userMenuLogoutButtonRecipe: HealingRecipe = {
    name: 'userMenuLogoutButton',
    description: '"Log out" button inside the header account popover menu',
    selectors: [
        '[data-testid="user-menu-logout"]', // Primary selector from page object
        'form[action*="/logout"] button[type="submit"]', // Form action fallback
        'button:has-text("Log out")', // Text fallback
        'button:has-text("Log Out")', // Capitalized variant
    ],
    context: 'Inside the account popover opened via the header user icon; submits a client-side <Form> POST to /logout',
    fallbackStrategy: 'Look for a submit button with logout-related text inside the account popover',
};

/**
 * Navigation Menu - Main site navigation
 * Primary: nav
 */
export const navMenuRecipe: HealingRecipe = {
    name: 'navMenu',
    description: 'Main navigation menu container',
    selectors: [
        'nav', // Primary selector from page object
        '[role="navigation"]', // ARIA role
        'header nav', // Header navigation
        '[data-testid*="nav"]', // Navigation test ID
        '.navigation', // Common class name
        '#navigation', // Common ID
    ],
    context: 'Main site navigation, typically in header',
    fallbackStrategy: 'Look for nav element or navigation role in header area',
};

/**
 * Category Links - Navigation category links
 * Primary: nav a
 */
export const categoryLinksRecipe: HealingRecipe = {
    name: 'categoryLinks',
    description: 'Category navigation links',
    selectors: [
        'nav a', // Primary selector from page object
        'nav [role="menuitem"]', // Menu items
        'nav ul li a', // List-based navigation
        '[data-testid*="category"]', // Category test ID
        'a[href*="/category/"]', // Category page links
        'a[href*="/c/"]', // Short category URL pattern
    ],
    context: 'Category links in main navigation menu',
    fallbackStrategy: 'Look for links within navigation element',
};

/**
 * Mega Menu Container - Appears on hover/click
 * Primary: [data-testid*="mega-menu"], [class*="mega-menu"]
 */
export const megaMenuContainerRecipe: HealingRecipe = {
    name: 'megaMenuContainer',
    description: 'Mega-menu dropdown container',
    selectors: [
        '[data-testid*="mega-menu"]',
        '[class*="mega-menu"]',
        'nav [role="menu"]',
        '[aria-expanded="true"][class*="menu"]',
        'nav [class*="dropdown"]',
        '.nav-flyout',
    ],
    context: 'Appears when hovering/clicking on main navigation categories',
    fallbackStrategy: 'Look for expanded menu container with role="menu" in navigation',
};

/**
 * Mobile Menu Toggle - Hamburger menu button
 * Primary: button[data-testid*="menu"], button[aria-label*="menu" i]
 */
export const mobileMenuToggleRecipe: HealingRecipe = {
    name: 'mobileMenuToggle',
    description: 'Mobile hamburger menu toggle button',
    selectors: [
        'button[data-testid*="menu"]',
        'button[aria-label*="menu" i]',
        'button[class*="hamburger"]',
        'button[class*="mobile-menu"]',
        '[role="button"][aria-label*="menu" i]',
        'button:has(svg[class*="menu"])',
    ],
    context: 'Mobile navigation toggle in header, visible only on mobile viewports',
    fallbackStrategy: 'Look for button in header with menu-related attributes',
};

/**
 * Footer - Site footer
 * Primary: footer
 */
export const footerRecipe: HealingRecipe = {
    name: 'footer',
    description: 'Site footer container',
    selectors: [
        'footer', // Primary selector from page object
        '[role="contentinfo"]', // ARIA role for footer
        '[data-testid*="footer"]', // Footer test ID
        '.footer', // Common class name
        '#footer', // Common ID
    ],
    context: 'Site footer with links and information',
    fallbackStrategy: 'Look for footer element at bottom of page',
};

/**
 * Footer Links - Links in footer
 * Primary: footer a
 */
export const footerLinksRecipe: HealingRecipe = {
    name: 'footerLinks',
    description: 'Links within site footer',
    selectors: [
        'footer a', // Primary selector from page object
        'footer [role="navigation"] a', // Footer navigation links
        '[role="contentinfo"] a', // Links in contentinfo
        'footer ul li a', // Footer list links
        '[data-testid*="footer"] a', // Links in footer test ID
    ],
    context: 'Footer navigation and information links',
    fallbackStrategy: 'Look for links within footer element',
};

/**
 * Loading Spinner - Loading state indicator
 * Primary: [data-testid*="loading"]
 * Note: Matches various loading states (Suspense fallbacks, form loading, button loading states)
 * Not specifically for the Loading component (which doesn't have data-testid)
 */
export const loadingSpinnerRecipe: HealingRecipe = {
    name: 'loadingSpinner',
    description: 'Loading spinner or progress indicator (various loading states throughout app)',
    selectors: [
        '[data-testid*="loading"]', // Primary selector - matches Suspense fallbacks, form loading, etc.
        '[data-testid*="spinner"]', // Spinner variant
        '[role="progressbar"]', // ARIA progress role
        '[aria-busy="true"]', // Busy state
        '.loading-spinner', // Common class
        '[class*="spinner"]', // Class contains spinner
    ],
    context: 'Loading indicators shown during asynchronous operations (forms, Suspense boundaries, button states)',
    fallbackStrategy: 'Look for animated elements with loading/spinner attributes or busy states',
};

/**
 * Error Message - Error state display
 * Primary: [data-testid*="error"]
 */
export const errorMessageRecipe: HealingRecipe = {
    name: 'errorMessage',
    description: 'Error message display',
    selectors: [
        '[data-testid*="error"]', // Primary selector from page object
        '[role="alert"]', // ARIA alert role
        '[aria-live="assertive"]', // Live region
        '.error-message', // Common class
        '[class*="error"]', // Class contains error
        '.alert-error', // Alert variant
    ],
    context: 'Error messages displayed when operations fail',
    fallbackStrategy: 'Look for alert role or error-related classes',
};

/**
 * SFCC Cookies - Salesforce Commerce Cloud session cookies
 * Not visible elements, but important for validation
 */
export const sfccCookiesRecipe = {
    name: 'sfccCookies',
    description: 'SFCC session and authentication cookies',
    cookies: [
        'cc-at_{SITE_ID}', // Access token
        'cc-nx-g_{SITE_ID}', // Next generation guest token
        'usid_{SITE_ID}', // User session ID
    ],
    context: 'SFCC cookies set on storefront, namespaced with SITE_ID (e.g., RefArchGlobal)',
    note: 'Replace {SITE_ID} with actual site ID from process.env.SITE_ID',
};
