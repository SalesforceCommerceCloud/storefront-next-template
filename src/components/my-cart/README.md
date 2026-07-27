# My Cart Component

## Overview

The **MyCart** component is a **read-only cart summary** displayed on the **checkout page**. It shows customers what items are in their cart during the checkout process without allowing modifications.

## Purpose

This component serves as a **collapsible cart review** on the checkout page, allowing customers to:
- See what items they're purchasing
- Verify quantities and prices
- View applied promotions
- Navigate back to the full cart page if they need to make changes

## Key Differences: MyCart vs Cart

| Feature | MyCart (Checkout Summary) | Cart (Full Cart Page) |
|---------|---------------------------|----------------------|
| **Location** | `/checkout` page (sidebar) | `/cart` route (dedicated page) |
| **Purpose** | Review items during checkout | Manage cart contents |
| **Interaction** | Read-only (summary view) | Fully interactive |
| **Edit Items** | ❌ Cannot edit (links to cart page) | ✅ Can edit quantities, remove items |
| **Checkout CTA** | ❌ No (already on checkout) | ✅ Yes (primary action) |
| **Layout** | Collapsible accordion in card | Full page with grid layout |
| **Variant** | `ProductItemsList` with `variant="summary"` | `ProductItemsList` with `variant="default"` |
| **Component Location** | `/components/my-cart/` | `/components/cart/` |

## When to Use

Use **MyCart** when:
- ✅ Displaying cart contents on the checkout page
- ✅ You want a collapsible, space-efficient cart review
- ✅ You need a read-only cart summary
- ✅ Users should not modify cart during checkout flow

Use **Cart** components (`/components/cart/`) when:
- ✅ Building the dedicated cart page (`/cart` route)
- ✅ Users need to edit quantities, remove items
- ✅ You want full cart management functionality
- ✅ Checkout CTA is needed

## Design Decisions

### Why Separate from Cart Components?

1. **Different Use Cases**: MyCart is for checkout review, Cart is for management
2. **Different Interactions**: MyCart is passive, Cart is active
3. **Different Contexts**: MyCart is embedded, Cart is standalone
4. **Cleaner Separation**: Prevents checkout-specific logic from polluting cart components

### Why Not Reuse Cart Components?

- Cart components are designed for **editing** (quantity pickers, remove buttons, etc.)
- MyCart is designed for **reviewing** (read-only, compact, collapsible)
- Different layout requirements (card vs. full page)
- Different user intents (modify vs. confirm)
