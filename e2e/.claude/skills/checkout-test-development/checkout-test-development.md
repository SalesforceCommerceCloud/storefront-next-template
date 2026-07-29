---
name: checkout-test-development
description: Comprehensive checkout development skill covering E2E testing, Storybook component documentation, debugging, and performance analysis for Salesforce Commerce Cloud checkout flows
keywords:
  - checkout
  - e2e-testing
  - codeceptjs
  - testing
  - debugging
  - storybook
  - performance
model: claude-opus-20250514
token_budget: 50000
preconditions:
  - "User is in storefront-next project (packages/template)"
  - "E2E test environment is set up (CodeceptJS, Playwright)"
  - "Checkout page object exists (e2e/src/pages/checkout.page.ts)"
  - "Test data is available (e2e/src/test-data/checkout.data.ts)"
---

# Checkout Test Development Skill

Master end-to-end testing for checkout functionality with comprehensive patterns, page object methods, debugging techniques, and performance optimization strategies.

## Quick Start

This skill helps you:

1. **Write E2E Tests** — Guest checkout, registered shopper flows, billing address scenarios, payment validation
2. **Create Storybook Stories** — Document checkout components with isolated examples
3. **Debug Issues** — Systematically diagnose form visibility, timing, validation, and payment issues
4. **Optimize Performance** — Track metrics, identify bottlenecks, prevent regressions

## Usage Patterns

### Pattern 1: Create Guest Checkout Test

Ask Claude:
```
Using the checkout-test-development skill, create an E2E test for:
- Guest completes checkout with single item
- Email validation passes
- Shipping address entered
- Payment processed successfully
- Order confirmation shown

Use TEST_PRODUCT_CATEGORIES.MENS_JACKETS and TEST_SHIPPING_ADDRESS from test data.
```

Claude will:
- Generate test file with proper structure
- Include Feature, Scenario, and tags
- Use page object methods (not direct I.* calls)
- Add proper assertions and waits
- Reference feature specs if applicable

### Pattern 2: Debug Checkout Failure

Ask Claude:
```
Using the checkout-test-development skill, debug why this test fails:
- Test times out at payment section
- Payment form not visible after shipping selection

Steps before failure:
1. Contact info filled
2. Shipping address entered
3. Shipping method selected (index 0)
4. Click payment toggle
5. TIMEOUT: Payment form not appearing after 15 seconds
```

Claude will:
- Diagnose common causes (shipping not selected, form state issues, timing)
- Suggest diagnostic code (wait times, DOM inspection, logging)
- Provide solution steps
- Show debug test example

### Pattern 3: Create Storybook Story

Ask Claude:
```
Using the checkout-test-development skill, create Storybook story for PaymentForm component:
- Empty state (all fields blank)
- Filled state (valid card data)
- Loading state (processing payment)
- Error state (validation errors on all fields)

Include argTypes for interactive controls and proper decorator setup.
```

Claude will:
- Generate story with proper Meta and args
- Include all requested variants
- Add argTypes for Storybook controls
- Reference test data patterns

### Pattern 4: Optimize Performance

Ask Claude:
```
Using the checkout-test-development skill, analyze checkout performance:
- Current page load time: 4.5 seconds (target: < 3s)
- Shipping options API: 2.3 seconds (target: < 1s)
- Payment form render: 1.8 seconds (target: < 500ms)

What are the bottlenecks and optimization strategies?
```

Claude will:
- Identify critical path issues
- Suggest specific optimizations
- Provide implementation patterns
- Recommend monitoring strategy

## Key Capabilities

### E2E Testing
- Guest checkout flows
- Registered shopper patterns
- Billing address variations
- Payment validation
- Multi-currency checkout
- Form validation errors
- Order confirmation validation

### Component Documentation (Storybook)
- Contact form states
- Shipping address form
- Billing address form
- Payment form
- Shipping method selector
- Order summary
- Checkout stepper
- Mobile responsive variants

### Debugging Techniques
- Form field visibility issues
- Payment timing problems
- Validation error handling
- Order confirmation failures
- Billing address logic
- DOM inspection and logging
- Network activity monitoring

### Performance Analysis
- Page load metrics
- Form interaction latency
- API response monitoring
- Bundle size optimization
- Performance regression detection
- Baseline establishment

## File Organization

The skill references these project locations:

```
e2e/
├── .claude/skills/checkout-test-development/
│   ├── SKILL.md                    ← This file
│   ├── checkout-skills.md          ← Comprehensive guide
│   └── evals/
│       └── checkout-evals.json     ← Skill validation tests
│
├── src/
│   ├── specs/core/
│   │   ├── checkout.spec.ts
│   │   ├── checkout-*.spec.ts
│   │   └── ...
│   ├── pages/
│   │   └── checkout.page.ts
│   ├── flows/
│   │   └── add-to-cart.flow.ts
│   │   └── login.flow.ts
│   │   └── ...
│   └── test-data/
│       └── checkout.data.ts
│
└── test-plans/
    └── checkout-e2e-test-plan.md
```

## Command Reference

Run checkout tests directly from CLI:

```bash
# Run all checkout tests
pnpm e2e --grep "@checkout"

# Run guest checkout only
pnpm e2e --grep "(?=.*@checkout)(?=.*@guest-checkout)"

# Run specific test file
pnpm e2e --grep "Multiple Items"

# Run with verbose output
pnpm e2e:verbose --grep "@checkout"

# Run in debug mode
pnpm e2e:debug --grep "@checkout"

# Run with headless browser
pnpm e2e:headless --grep "@checkout"

# Start Storybook
pnpm storybook

# Build Storybook static site
pnpm build-storybook
```

## Best Practices

### Testing
- Write specs BEFORE tests (use feature-specs skill)
- Use page object methods, never direct `I.*` calls in scenarios
- Generate unique emails with `generateTestEmail('scenario-name')`
- Include proper tags (`@checkout`, `@guest-checkout`, etc.)
- Add logout hooks for registered shopper tests

### Stories
- Create variants for all major states (empty, filled, loading, error)
- Use `argTypes` for Storybook controls
- Include mobile viewport variants
- Add meaningful descriptions to `meta.parameters`

### Debugging
- Add `I.say()` statements for logging
- Use `grabPageSource()` and `grabHTMLFromElement()` for inspection
- Increase wait times before escalating issues
- Check element selectors match current UI

### Performance
- Establish baseline metrics before optimizations
- Monitor for 10% WARNING / 30% CRITICAL regressions
- Test on low-end devices to catch performance issues early
- Track API response times independently from UI rendering

## Integration with Feature Specs

This skill works closely with **feature-specs** skill:

1. **Feature Spec** defines WHAT should be built (acceptance criteria)
2. **Checkout Test** implements HOW to validate it (E2E tests)
3. **Linking**: Test file header references the spec:
   ```typescript
   /**
    * Feature Spec: e2e/feature-specs/checkout/guest-checkout.spec.md
    * Acceptance Criteria: AC1 - Guest can complete checkout without account
    */
   ```

## Troubleshooting

### "Tests timeout or hang"
- Increase wait times in page object methods
- Check if network requests are pending (use network monitoring)
- Verify element selectors are correct (use `grabPageSource()`)

### "Payment form not visible"
- Ensure shipping method is selected before payment
- Use `expandPaymentStep()` for registered shopper tests
- Wait for payment fields explicitly

### "Storybook stories not showing"
- Verify component paths in story imports
- Check `.storybook/main.ts` story discovery patterns
- Ensure stories follow naming convention (`*.stories.tsx`)

### "Performance metrics high"
- Check for unnecessary re-renders (use React DevTools)
- Monitor API response times separately
- Profile with Lighthouse in Chrome DevTools

## Evaluation Criteria

This skill is validated by the `evals/checkout-evals.json` test suite covering:

- E2E test generation correctness
- Storybook story structure
- Debugging technique effectiveness
- Performance metric calculations
- Code quality and best practices
- Reference accuracy to existing patterns

Run evals:
```bash
# Validate skill generates correct tests
claude eval packages/template/e2e/.claude/skills/checkout-test-development/evals/checkout-evals.json
```

## Related Skills

- **feature-specs** — Define requirements before writing tests
- **checkout-skills** (this skill) — Implement E2E tests, Storybook stories, debugging
- **simplify** — Review test code for quality and efficiency

## Questions?

Refer to:
- Comprehensive guide: `checkout-skills.md` (detailed patterns, examples, checklists)
- Feature specs: `e2e/feature-specs/checkout/*.spec.md` (requirements)
- Existing tests: `e2e/src/specs/core/checkout*.spec.ts` (reference patterns)
- Page object: `e2e/src/pages/checkout.page.ts` (available methods)

---

**Last Updated**: 2026-04-02  
**Skill Version**: 1.0  
**Token Budget**: 50,000 tokens (optimized for focused, efficient responses)
