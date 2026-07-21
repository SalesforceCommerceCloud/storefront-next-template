# Storybook Documentation

This project uses Storybook for component development, testing, and documentation. Storybook provides an isolated environment to develop and test UI components in isolation.

> **Writing your first story?** Jump to [Contributing a story](#contributing-a-story) for the step-by-step walkthrough, from naming through verifying it before you open a PR.

## Story-writing principles

Stories should be the *minimum* setup needed to render a component in a particular state. The four rules below keep stories cheap to write and resilient to internal refactors:

1. **Props-first.** Pass data via component props whenever the component accepts them. Reach for the global provider/router stack only when the component genuinely reads from global context (auth, basket, site, locale).
2. **Mock at the boundary, not at the internals.** Prefer `parameters.routeLoaderData` / `parameters.scapiMock` / `parameters.mockRoutes` (router-level) over `vi.mock(...)` of individual hooks. Hook mocks couple stories to internal refactors; route-level mocks survive them.
3. **Args are JSON-serializable; non-serializable data goes in `parameters`.** Storybook's args UI cannot render Promises, class instances, functions returning Promises, or circular structures — passing those as args breaks the controls panel and snapshot serialization. Use `parameters.routeLoaderData` for Promise-returning loader data.
4. **One reason to update a mock.** If changing a component's internals (a hook signature, a context shape) forces a story update, the story is mocking too deeply — push the mock down to the route or fixture layer.


## Decorator registry

Every story is wrapped, top-down, in:

```
withRouter(StoryShell)
  └── createMemoryRouter (in-memory, with default mock routes)
        └── StoryShell
              └── StorybookWrapper (config + site + i18n + auth + basket + storeLocator + checkoutOneClick)
                    └── UITargetProviders
                          └── <Story />
```

The pieces live in [`../.storybook/decorators/`](../.storybook/decorators/):

| File | Exports | Role |
|------|---------|------|
| `with-router.tsx` | `withRouter(Wrapper)` | Mounts the in-memory React Router and reads `parameters.routeLoaderData` / `scapiMock` / `mockRoutes`. |
| `with-providers.tsx` | `StorybookWrapper` | Provider stack (config/site/i18n/auth/basket/storeLocator/checkoutOneClick) on a `min-h-screen bg-background` shell. |
| `with-ui-targets.tsx` | `StoryShell` | `StorybookWrapper` + `UITargetProviders`. |
| `mock-routes.ts` | `buildDefaultMockRoutes(scapiMock, miniCartData)` | The default `/resource/*` and `/action/*` route table consumed by `withRouter`. |
| `index.ts` | barrel | `export { StorybookWrapper, StoryShell, withRouter, buildDefaultMockRoutes }`. |

Treat the providers as an **escape hatch**, not the default. Stories whose component takes the data via props should not require the global provider stack to render.

## Mock routes & data

Shared fixtures live in [`../src/components/__mocks__/`](../src/components/__mocks__/) (consumed by both stories and unit tests). Curated fixtures are re-exported from the [`index.ts` barrel](../src/components/__mocks__/index.ts) — import via `@/components/__mocks__` for the curated set, or via `@/components/__mocks__/<file>` for fixtures that aren't re-exported.

### Story-level overrides

The router decorator reads four story-level `parameters`:

- `routeLoaderData: Record<string, unknown>` — wrap the story in ancestor routes that resolve `useRouteLoaderData(routeId)` for the given ids. Use this for components like `CategoryBanner` that read loader data from a parent route.
- `scapiMock: { data?: unknown }` — override the default `/resource/api/client/:resource` loader response. Required when a play function asserts against story-specific product data (e.g. `BonusProductModal`'s tie fixture).
- `miniCartData: { basket, productsById }` — override what the `/resource/basket-products` mock returns. Required by stories that need a different basket shape than the populated default (e.g. CartSheet "Empty" story).
- `mockRoutes: RouteObject[]` — append story-specific mock routes (extra `/resource/*` or `/action/*` paths) without forking the decorator. Story-supplied paths must not shadow `/`, `*`, or any default mock-route path — `withRouter` throws on conflicts.

### Default mock routes

`buildDefaultMockRoutes(scapiMock, miniCartData)` provides a loader for basket-product enrichment and actions for cart updates, wishlist mutations, OTP verification, product/bundle/set adds, site-context (currency/locale) updates, tracking-consent, and place-order. See [`../.storybook/decorators/mock-routes.ts`](../.storybook/decorators/mock-routes.ts) for the full list.

## Quick Start

```bash
# Start Storybook development server
pnpm storybook

# Build Storybook for production
pnpm storybook:build
```

## Test runners

Two engines run under one dispatcher (`pnpm storybook:test`):

- **Snapshot tests** → Vitest, jsdom. Fast; also collects code coverage via `composeStories`.
- **Interaction + a11y tests** → `@storybook/test-runner` (Playwright), real Chromium. Real-browser `play()` assertions and axe-core checks.

## Prerequisites (local)

Interaction and a11y tests run in real Chromium via Playwright. `pnpm install` does **not** download the browser (Playwright isn't in pnpm's build-script allowlist), so run this once:

```bash
pnpm exec playwright install chromium
```

Snapshot tests run in jsdom and need no browser. CI runs inside a Playwright container, so browsers are pre-installed there.

## Run tests on Command Line Interface

```bash
# Run snapshot tests
pnpm storybook:test --type=snapshot

# Update snapshot files locally and run tests
pnpm storybook:test --type=snapshot --update

# Run interaction tests
pnpm storybook:test --type=interaction

# Run interaction tests against static build
pnpm storybook:test --type=interaction --static

# Run a11y tests
pnpm storybook:test --type=a11y

# Run a11y tests against static build
pnpm storybook:test --type=a11y --static
```

**Storybook URL:** http://localhost:6006

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm storybook` | Start Storybook development server on port 6006 (default vertical: `fashion`) |
| `VERTICAL=cosmetic pnpm storybook` | Start Storybook rendering a specific vertical's overlays (`fashion` \| `cosmetic`) |
| `pnpm storybook:build` | Build static Storybook for production deployment |
| `pnpm storybook:test --type=snapshot` | Run snapshot tests |
| `pnpm storybook:test --type=snapshot --update` | Update snapshot files locally and run tests |
| `pnpm storybook:test --type=interaction` | Run interaction tests against live Storybook server |
| `pnpm storybook:test --type=interaction --static` | Run interaction tests against static Storybook build |
| `pnpm storybook:test --type=a11y` | Run a11y tests against live Storybook server |
| `pnpm storybook:test --type=a11y --static` | Run a11y tests against static Storybook build |
| `pnpm storybook:test --type=snapshot --coverage` | Run snapshot tests with code coverage (auto-generates story tests first) |
| `pnpm storybook:test --type=snapshot --stories=<name>` | Snapshot only — narrow the run to story files whose path contains `<name>` (e.g. `account/order-details`) |
| `pnpm storybook:test:mirror <vertical>` | Run a vertical's suite against the flattened mirror exactly as CI does (default `cosmetic`; forwards extra args, e.g. `--type=interaction`) |

## CI execution

All three suites run on every PR in a single CI job (in this repo, the `storybook-tests` job) inside the `mcr.microsoft.com/playwright` container (browsers pre-installed), executing the same commands you'd run locally: `snapshot --coverage`, `interaction --static`, `a11y --static`, then the coverage report.

## Features & Addons

This Storybook setup includes the following addons:

- **@storybook/addon-docs** - Automatic documentation generation
- **@storybook/addon-a11y** - Accessibility testing and validation
- **@storybook/addon-vitest** - Integration with Vitest for component testing
- **Viewport Toolbar** - Built-in toolbar for testing different screen sizes (Mobile, Tablet, Desktop)

> **Note**: We use Storybook's built-in viewport toolbar instead of creating separate viewport stories. Use the viewport selector in the Storybook toolbar to test components at different screen sizes.

## Project Structure

Most components live in their own folder under `src/components/`. Source files (`.tsx`), unit tests (`.test.tsx`), and a `stories/` subfolder sit side by side. Story files, snapshot fixtures, and serialized snapshots all live inside `stories/`.

Three folder shapes show up in this codebase:

- **Single component per folder** (most common): an `index.tsx` plus supporting `.tsx` files, each paired with a `*.test.tsx`, and a `stories/` subfolder. Example: `email-update-form/`, `footer/`.
- **Multi-component folder**: several sibling components share a folder, each with its own test and story. Includes an `index.tsx` only when one of the components is the folder's main export composing the others — `header/` has one (`<Header />` composes `Search`, `CartBadge`, etc.); `buttons/` doesn't, since each button is independent.
- **Flat shadcn primitives** under `ui/`: one file per primitive, no per-component test or story folder. See [`src/components/ui/README.md`](../src/components/ui/README.md).

For new components, default to **Single component per folder**. Use a multi-component folder only when the components are tightly coupled (e.g., variants of the same control); reserve `ui/` for shadcn primitives.

```
src/
├── components/
│   ├── __mocks__/                        # Shared fixtures (stories + unit tests)
│   │   ├── index.ts                      # Curated barrel
│   │   └── *.ts                          # Individual fixtures (basket, products, search, ...)
│   ├── footer/                           # Single component per folder
│   │   ├── index.tsx
│   │   ├── signup.tsx
│   │   ├── signup.test.tsx
│   │   └── stories/
│   │       ├── index.stories.tsx
│   │       ├── footer-snapshot.tsx       # Snapshot fixture (codegen — see test-wrapper.tsx)
│   │       ├── signup.stories.tsx
│   │       ├── signup-snapshot.tsx
│   │       └── __snapshots__/            # Serialized snapshots (auto-generated)
│   ├── buttons/                          # Multi-component folder (no index.tsx)
│   │   ├── share-button.tsx
│   │   ├── share-button.test.tsx
│   │   ├── wishlist-button.tsx
│   │   ├── wishlist-button.test.tsx
│   │   └── stories/
│   │       ├── share-button.stories.tsx
│   │       └── wishlist-button.stories.tsx
│   └── ui/                               # Flat shadcn primitives (no stories folder)
│       ├── button.tsx
│       ├── dialog.tsx
│       └── ...
└── .storybook/
    ├── main.ts                           # Storybook framework config
    ├── preview.tsx                       # Imports + parameters + decorator wiring
    ├── preview-head.html                 # <head> tags injected into the preview iframe
    ├── vite.config.ts                    # Storybook-only Vite overrides (incl. shim alias)
    ├── vitest.setup.ts                   # Vitest setup for Storybook tests
    ├── modes.ts                          # Viewport mode definitions
    ├── decorators/                       # withRouter, StorybookWrapper, StoryShell, mock-routes
    ├── storybook-providers.tsx           # Provider stack (config/site/i18n/auth/...)
    ├── test-wrapper.tsx                  # Snapshot-only wrapper (codegen — see header comment)
    ├── test-utils.ts                     # Shared helpers for story tests
    ├── coverage/                         # Story coverage tooling
    └── shims/
        └── shopper-agent-context-ui.ts   # Storybook-only (see below)
```

Snapshot fixtures (`*-snapshot.tsx`) and `__snapshots__/` directories appear only for components with snapshot tests.

### Production vs Storybook: `shopper-agent-context-ui` shim

PDP FAQ and the account Need Help **Ask a question** action are gated in production by `src/lib/shopper-agent-context-ui.ts`. Storybook still needs those UIs to show up in stories without changing production defaults.

**What we do:** `.storybook/vite.config.ts` adds a resolve alias so `@/lib/shopper-context/agent-ui` points at `.storybook/shims/shopper-agent-context-ui.ts` when Storybook builds. That shim implements `isShopperAgentContextUiEnabled()` as `true` while the production file returns the real `SHOPPER_AGENT_CONTEXT_UI_ENABLED` constant. The storefront `vite build` and Vitest unit tests resolve the normal `src/lib/` module — no Storybook branching in shipped code.

**Why not `globalThis` in production utilities?** Putting Storybook detection in shared runtime code mixes concerns, invites duplicated magic strings (`preview.tsx`, tests, utils), and adds an unnecessary branch on every call.

**Why not environment variables for “am I Storybook?”** An `import.meta.env.STORYBOOK`-style flag would still require production modules to depend on Storybook-specific keys or strip them carefully in prod builds. Env is also easier to get wrong across CI, Managed Runtime, and local dev. A **build-time module alias** limits the override to the Storybook bundle only.

**Unit tests:** Mock `@/lib/shopper-context/agent-ui` when you need context UI enabled; otherwise imports use the real module (`false` until you change the constant).

## Creating Stories

### Story titles & sidebar taxonomy

Every `meta.title` follows a `Domain/Component` (or `Domain/Subgroup/Component`) shape, where `Domain` is one of the fixed top-level groups below. Use Title Case With Spaces for each segment (`Account/Addresses/Address Card`), and place a new story under the domain that matches the component's purpose — not the folder it happens to live in. This keeps the sidebar consistent and shallow rather than one flat list.

| Top-level group | What belongs here |
|---|---|
| `Account` | Logged-in account area: orders, addresses, wishlist, profile, payment methods, store preferences |
| `Authentication` | Login, signup, password reset, OTP, passwordless, social login |
| `Cart` | Cart page, mini cart, cart items, promo codes, bonus products |
| `Category` | PLP chrome: banners, breadcrumbs, refinements, sorting, pagination |
| `Checkout` | Checkout flow: address, contact, payment, shipping, order summary, registration |
| `Content` | Authored content: marketing sections and Page Designer components |
| `Core` | Cross-domain primitives: actions, forms, feedback, overlays, icons, navigation, SEO, security, utilities |
| `Design System` | Theme tokens (`Theme/*`: colors, typography, radius, shadows) and UI primitives (`UI/*`: Button, Dialog, Input, Form) |
| `Extensions` | Optional feature extensions: BOPIS, BNPL, Store Locator, Ratings & Reviews, Multiship, etc. |
| `Home` | Homepage sections: hero, features, popular categories |
| `Layout` | Global chrome: header, footer, navigation, switchers, logo |
| `Products` | Product components: tiles, PDP view, price, ratings, swatches, carousels, grids |
| `Search` | Search suggestions and recent searches |

Pick the closest existing group before inventing a new one — a story with a novel top-level prefix lands as a sidebar outlier. Titles are convention, not lint-enforced; matching this taxonomy is on the author (and on any agent writing stories).

> Customers own this template and may restructure the sidebar for their own brand — this taxonomy is our default, not a locked contract.

### Basic Story Structure

```typescript
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyComponent } from './MyComponent';

const meta: Meta<typeof MyComponent> = {
  title: 'Core/Forms/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: 'primary',
  },
};
```

Add `parameters` (e.g. `layout`, `docs`), `argTypes` (control configs), and additional named exports for variants only when the story needs them — keep the default minimal.

### Basic Story Structure with Play function for Interaction Tests

```typescript
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent } from '@storybook/test';
import { MyComponent } from './MyComponent';

const meta: Meta<typeof MyComponent> = {
  title: 'Core/Forms/MyComponent',
  component: MyComponent,
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: 'primary' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
  },
};
```

### Basic Story Structure with Actions

```typescript
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActionLogger } from './ActionLogger';

const meta: Meta<typeof ActionLogger> = {
  title: 'Core/Utilities/ActionLogger',
  component: ActionLogger,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <ActionLogger>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button>Edit</button>
        <button>Remove</button>
      </div>
    </ActionLogger>
  ),
};
```

### Story Best Practices

**Do:**
1. **Naming Convention**: Use PascalCase for story names (e.g., `Default`, `Loading`, `Error`)
2. **Organization**: Title stories per the [sidebar taxonomy](#story-titles--sidebar-taxonomy) — a `Domain/Component` prefix from the fixed top-level groups
3. **Documentation**: Include component descriptions and prop documentation
4. **Controls**: Use `argTypes` to make components interactive
5. **Variants**: Create stories for different states (loading, error, success)
6. **Accessibility**: Test with the a11y addon
7. **Viewport Testing**: Use Storybook's built-in viewport toolbar instead of creating separate Mobile/Tablet/Desktop stories

**Don't (anti-patterns):**
- **Massive mock equivalents of the component.** Recreating the component's data shape inside the story (huge nested literals) instead of passing props.
- **Promises through `args`.** They don't serialize; the controls panel breaks. Move them to `parameters` (e.g. `parameters.routeLoaderData`).
- **`vi.mock(...)` of hooks inside a story.** Should be route-level (a mock loader/action) or replaced with a prop.

## ESLint Integration

This project includes `eslint-plugin-storybook` for Storybook-specific linting:

- Enforces Storybook best practices
- Catches common mistakes in story files
- Ensures consistent story structure
- Validates story naming conventions

## Troubleshooting

### Common Issues

1. **Port Already in Use**: Change the port in the storybook command
   ```bash
   pnpm storybook --port 6007
   ```

2. **Build Errors**: Check that all dependencies are installed
   ```bash
   pnpm install
   ```

3. **Story Not Loading**: Verify the story file follows the correct naming convention (`*.stories.tsx`)

4. **TypeScript Errors**: Ensure your component props are properly typed

### Getting Help

- Check the [Storybook documentation](https://storybook.js.org/docs)
- Review existing stories in the project for examples
- Use the Storybook UI to explore available controls and addons

## Contributing a story

The step-by-step for adding or changing a story so it matches conventions and passes CI. The sections above (taxonomy, decorators, mock routes) are the reference this walkthrough points back to.

### The guiding principle

A story should be the *minimum* setup needed to render a component in a particular state — cheap to write, resilient to internal refactors. The four [story-writing principles](#story-writing-principles) at the top of this doc (props-first, mock at the boundary, JSON-serializable args, one reason to update a mock) are the whole game; everything below applies them.

### Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Story file | `*.stories.tsx` in a `stories/` subfolder next to the component | `footer/stories/index.stories.tsx` |
| Story export | PascalCase, names the *state* | `Default`, `Loading`, `InvalidEmailError`, `MobileView` |
| `meta.title` | `Domain/Component` (or `Domain/Subgroup/Component`), Title Case With Spaces | `Account/Profile/Email Update Fields` |
| Snapshot fixture | `<name>-snapshot.tsx` alongside the story | `signup-snapshot.tsx` |

The `stories/` subdirectory is **required** — coverage tooling only matches stories there (`cart/cart-content.tsx` → `cart/stories/cart-content.stories.tsx`). See [Story Coverage](./README-STORY-COVERAGE.md) for the matching rules and [Project Structure](#project-structure) for the three folder shapes.

### Args, controls & argTypes

`args` are the props; `argTypes` configure how the Controls panel edits them. **Expose only what visibly drives the canvas; hide the noise.**

```tsx
argTypes: {
    label: { control: 'text', description: 'Label in the summary row' },
    defaultOpen: { control: 'boolean', description: 'Whether the section starts open' },

    // className is utility-class noise — hide it from the panel.
    className: { control: false, table: { disable: true } },

    // ReactNode props can't be usefully edited as JSX — hide, or expose as a
    // `text` control when the component renders strings inline.
    children: { control: 'text' },

    // Callbacks become logged Actions instead of controls.
    onCancel: { action: 'cancel' },
}
```

**State seeded from a prop won't react to a Control unless you remount.** If a component copies a prop into `useState` once (no `useEffect` resync), toggling that Control is silently ignored. Re-key the story on the prop so it remounts:

```tsx
decorators: [(Story, ctx) => <Story key={`defaultOpen-${String(ctx.args.defaultOpen)}`} />],
```

(Real example: [`collapsible-section/stories/index.stories.tsx`](../src/components/collapsible-section/stories/index.stories.tsx).)

### Test data

**Reuse shared fixtures — don't recreate the component's data shape inside the story.** Curated fixtures in [`src/components/__mocks__/`](../src/components/__mocks__/) are shared by stories *and* unit tests:

```tsx
import { basketWithOneItem, inBasketProductDetails } from '@/components/__mocks__';
```

Feed data through the [story-level parameters](#story-level-overrides) (`routeLoaderData` / `scapiMock` / `miniCartData` / `mockRoutes`) so the component exercises its real data-reading path. A route-level mock survives a hook-signature refactor; a `vi.mock('use-some-hook')` breaks on it. When a component needs a React Router fetcher, hand it a small mock object — see `createMockFetcher` in [`email-update-fields.stories.tsx`](../src/components/email-update-form/stories/email-update-fields.stories.tsx).

### Interaction tests (play functions)

An interaction test is a `play` function that drives the component with real user events and asserts the result. Tag the story `['autodocs', 'interaction']`.

```tsx
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

export const Interactive: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);   // 1. always first — waits out the mount placeholder
        const canvas = within(canvasElement);          // 2. scope queries to the story canvas

        const input = canvas.getByRole('textbox');
        await userEvent.type(input, 'hello');           // 3. drive with userEvent
        await expect(input).toHaveValue('hello');       // 4. assert the resulting state
    },
};
```

Rules that keep plays deterministic:

- **`await waitForStorybookReady(canvasElement)` first**, always — so you don't assert against a half-mounted component.
- **Radix/portal content lives on `document.body`, not the canvas.** Query dialogs/sheets/popovers with `within(document.body)`, and `await waitFor(...)` for them to appear:
  ```tsx
  await userEvent.click(trigger);
  await waitFor(() => expect(within(document.body).queryByRole('dialog', { hidden: false })).toBeInTheDocument());
  ```
- **Assert Radix state via `aria-expanded` / `data-state`, not native `open`** — a Radix Accordion is not a `<details>`.
- **`await waitFor(...)` for anything async** (validation messages, state settling).

Pick the archetype closest to your component and model on its exemplar:

| Archetype | Exemplar | Key move |
|---|---|---|
| **Form** | [`email-update-fields`](../src/components/email-update-form/stories/email-update-fields.stories.tsx) (`Interactive`, `InvalidEmailError`) | type → submit → `waitFor` validation message |
| **Modal / drawer** | [`cart-sheet`](../src/components/header/stories/cart-sheet.stories.tsx) | click trigger → `waitFor` portal dialog on `document.body` |
| **Selector** | [`product-info`](../src/components/product-view/stories/product-info.stories.tsx) | click option → assert callback fired + `aria-checked` moved |
| **Accordion / disclosure** | [`collapsible-section`](../src/components/collapsible-section/stories/index.stories.tsx) | click summary → assert expanded → click → assert collapsed |

**What NOT to interaction-test:** mutations that hit action routes (add-to-cart, wishlist toggle, cart qty/remove, promo apply, checkout navigation) — they're flaky. Assert the pre-mutation state (button present/enabled), not the round-trip. And don't chase 100% coverage — test what can break, not every subcomponent in isolation.

### Add a new component story from scratch

Worked example: a static component `PromoBadge` at `src/components/promo-badge/index.tsx`.

1. **Create the story file** at `src/components/promo-badge/stories/index.stories.tsx` with the [copyright header](../CLAUDE.md#copyright-header-required), then:

   ```tsx
   import type { Meta, StoryObj } from '@storybook/react-vite';
   import { PromoBadge } from '../index';

   const meta: Meta<typeof PromoBadge> = {
       title: 'Products/Promo Badge',   // pick the taxonomy group by purpose, not by folder
       component: PromoBadge,
       tags: ['autodocs'],
       args: { label: '20% off' },       // minimal shared default
   };

   export default meta;
   type Story = StoryObj<typeof meta>;

   export const Default: Story = {};
   ```

2. **Run it up** — `pnpm storybook` (http://localhost:6006) — and confirm it renders and lands in the right sidebar group.
3. **Add variant stories** for the states that matter (loading, error, empty, a size variant). Override only the args that change.
4. **Trim the Controls panel** — hide `className` and ReactNode props; expose the props that visibly drive the canvas.
5. **If it's interactive, add a `play` function** and add `'interaction'` to `tags`. If it reads global context or loader data, wire it via [story-level parameters](#story-level-overrides), not by mocking hooks.
6. **If it needs a committed snapshot baseline**, add a `<name>-snapshot.tsx` fixture next to the story (copy the tiny wrapper from [`collapsible-section-snapshot.tsx`](../src/components/collapsible-section/stories/collapsible-section-snapshot.tsx)) and generate the baseline in the next step.
7. **Verify** (below), then add a changeset (`pnpm changeset`, pick `@salesforce/template`).

### Verify before you open a PR

Run from `packages/template`. Interaction and a11y tests need Chromium once: `pnpm exec playwright install chromium`.

```bash
# Run the three Storybook suites (what CI runs on every PR)
pnpm storybook:test --type=snapshot        # jsdom snapshot — the committed-baseline visual regression gate
pnpm storybook:test --type=interaction      # real Chromium, runs your play()
pnpm storybook:test --type=a11y             # axe-core — new stories must pass

# If your change intentionally alters the DOM, refresh baselines and commit the diff:
pnpm storybook:test --type=snapshot --update
```

The snapshot suite serializes each story's DOM and diffs it against a committed `__snapshots__/*.snap` baseline — a DOM change you didn't intend shows up as a failure. Only run `--update` for a change you *meant* to make, and confirm the diff is additive (new keys, no surprise deletions) before committing.

### Anti-patterns

- **Recreating the component's data shape inside the story** — huge nested literals instead of props/fixtures. Use `@/components/__mocks__`.
- **Promises (or other non-serializable data) in `args`** — breaks Controls and snapshots. Move to `parameters`.
- **`vi.mock(...)` of a hook inside a story** — mock at the route boundary instead.
- **Reaching for the global provider stack when props would do** — it's an escape hatch.
- **Interaction-testing mutations** (add-to-cart, wishlist, promo apply) — flaky; assert the pre-mutation state.
- **Duplicating a story per viewport** — use the viewport toolbar, not `MobileDefault` + `DesktopDefault` copies.
- **Copy-pasting the same `play` across stories** or defining an action logger per story — define shared harnesses once in `meta`.
- **Chasing 100% coverage** — test reusable components and what can break, not every leaf subcomponent in isolation.