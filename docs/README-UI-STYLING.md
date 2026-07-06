# UI and Styling in Storefront Next

This document describes the complete UI and styling approach for the template storefront: Tailwind CSS, shadcn/ui, design tokens, and related development practices.

## Tailwind CSS (v4)

The project uses **Tailwind CSS v4** with a utility-first approach.

### Rules

- Use **Tailwind utility classes** in component JSX for layout, spacing, typography, and colors.
- Use the **`cn()` utility** for conditional or combined class names: `import { cn } from '@/lib/utils'`. Example: `cn('rounded p-4', isActive && 'ring-2')`.
- Follow **mobile-first** responsive patterns using breakpoint prefixes: `sm:`, `md:`, `lg:`, `xl:`, `2xl:`.
- **Do not use inline styles** (`style={{ ... }}`) for styling.
- **Do not use CSS modules** (`.module.css`) or separate CSS files for component-level styles.
- **Global and theme styles** belong in `src/theme/` only. The entry point is `src/theme/index.css`, with tokens split across `src/theme/tokens/`, base resets in `src/theme/base.css`, and component overrides in `src/theme/overrides/`.

### Design Tokens

Colors and theme values are defined as CSS variables (design tokens). Use semantic token-based classes instead of hard-coded colors:

- Backgrounds: `bg-background`, `bg-muted`, `bg-card`
- Text: `text-foreground`, `text-muted-foreground`, `text-primary`
- Borders: `border-border`
- Interactive: `bg-primary`, `text-primary-foreground`, `hover:bg-primary/90`

Avoid raw color utilities (e.g. `bg-[#hex]`) so the app stays consistent with the theme.

### Responsive Design

Use breakpoints consistently:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Content */}
</div>
```

---

## shadcn/ui

Presentational UI components are built on **Radix UI primitives** with **shadcn/ui** as the styling layer. They live in `src/components/ui/`.

### Adding Components

Add new components only via the official CLI so they are ejected with the correct config and Tailwind setup:

```bash
npx shadcn@latest add <component-name>
```

This ejects the component into `src/components/ui/` with the right dependencies and styles.

### Rules

- **Do** add and customize shadcn components by editing the files in `src/components/ui/`.
- **Do not** create custom components inside `src/components/ui/`; keep that directory for ejected shadcn components only.
- **Do not** manually copy components from the shadcn docs; always use the CLI so configuration (e.g. `components.json`) stays in sync.

Keeping `src/components/ui/` limited to ejected shadcn components makes upgrades and maintenance predictable. For custom UI, use `src/components/` (or another feature directory) and compose or wrap shadcn components as needed.

See [src/components/ui/README.md](../src/components/ui/README.md) for more detail.

### Reusing Styles: When to Extract

Tailwind's utility-first approach means most styling lives inline in JSX. Before extracting a reusable abstraction, read the official guide on [managing reuse](https://tailwindcss.com/docs/styling-with-utility-classes#managing-duplication) — it covers multi-cursor editing, loops, and component extraction as the **preferred** strategies before reaching for CSS abstractions.

**Use a React component** (the default choice) when:
- The pattern involves **markup structure** — multiple elements, slots, children
- There is **logic, state, or event handling**
- It accepts **props** that change behavior or content
- It composes other components (shadcn, Radix, etc.)

**Use a CSS component class** (`@layer components` in `src/theme/base.css`) only when:
- The pattern is **pure layout/styling** — padding, max-width, centering, typography presets
- There is **no logic, state, or props** — just a bag of CSS properties
- It needs to be applied to **many different HTML elements** across the codebase (divs, sections, wrappers)
- Utilities need to **override** it in specific contexts (the components layer is lower specificity than utilities)

Example: `section-container` — consolidates `px-4 sm:px-8 lg:px-16 max-w-screen-2xl mx-auto` into one class, used by 30+ files. A page can add `max-w-4xl` alongside it and the utility wins.

**Rule of thumb**: if you can express it as a single `className` string with no JSX children, it's a CSS class. If it renders elements or accepts props, it's a React component.

```css
/* src/theme/base.css — CSS component class */
@layer components {
    .section-container {
        @apply px-4 sm:px-8 lg:px-16 max-w-screen-2xl mx-auto;
    }
}
```

```tsx
/* React component — has structure, props, and children */
function CategoryBanner({ title, image }: CategoryBannerProps) {
    return (
        <div className="section-container">
            <img src={image} alt="" />
            <h1>{title}</h1>
        </div>
    );
}
```

> **Do not use `@utility`** for multi-property compositions that need to be overridable. The utility layer has the highest specificity, so any override attempt (e.g., adding `max-w-4xl` alongside a `@utility` class) would lose. Use `@layer components` instead.

---

## Component Library and Icons

- **Radix UI**: Use Radix primitives for accessible behavior (focus, keyboard, ARIA).
- **Icons**: Use **Lucide React** and **React Simple Icons** for iconography.

### CSS-only decorative icons (pseudo-element + mask)

When you want a purely decorative icon in front of (or after) an element whose component you shouldn't fork — a shared title, a label rendered deep in a shadcn primitive — add it with a `::before` / `::after` pseudo-element in theme CSS instead of editing the JSX. This keeps component-level styling out of components (see the rule above) and lets you hook a stable `data-slot` or structural selector rather than threading a prop through.

The tokens, selectors, and icons below are **illustrative** — adapt them to your own storefront. The file paths (`src/theme/tokens/core.css`, `src/theme/base.css`) are where global tokens and base rules live.

**Use a `mask` + `background-color`, not `content: url(...)`.** A masked SVG is **tintable**: `background-color: currentColor` paints the icon in the element's text color, so it tracks light/dark and theme changes automatically. A `content: url(...)` image renders at its baked-in colors and can't inherit `currentColor`. Define the SVG once as a token so it's reusable and themeable:

```css
/* src/theme/tokens/core.css — a Lucide icon as a mask data URI.
   Percent-encode the SVG (e.g. encodeURIComponent) so characters like
   #, %, <, > and quotes survive the data URI intact — an unencoded # or %
   truncates the URI and the mask silently fails to load.
   Inside a mask the SVG's alpha is what matters; the stroke color is never
   painted, so it's a literal `black`, not `currentColor` (which doesn't
   resolve inside a mask). The visible color comes from background-color below. */
--icon-star: url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M11.525%202.295a.53.53%200%200%201%20.95%200l2.31%204.679a2.123%202.123%200%200%200%201.595%201.16l5.166.756a.53.53%200%200%201%20.294.904l-3.736%203.638a2.123%202.123%200%200%200-.611%201.878l.882%205.14a.53.53%200%200%201-.771.56l-4.618-2.428a2.122%202.122%200%200%200-1.973%200L6.28%2021.28a.53.53%200%200%201-.77-.56l.881-5.139a2.122%202.122%200%200%200-.611-1.879L2.045%209.865a.53.53%200%200%201%20.294-.904l5.166-.755a2.122%202.122%200%200%200%201.597-1.16z%22%2F%3E%3C%2Fsvg%3E');
--icon-check: url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M20%206%209%2017l-5-5%22%2F%3E%3C%2Fsvg%3E');
```

```css
/* src/theme/base.css — star icon before a title. The selector hooks the
   title's structure; nothing in the component changes.
   `flex-shrink: 0` applies because the parent is `inline-flex` (see the rule
   below), so the ::before is a flex item and would otherwise be squeezed by a
   long title. Drop it if the parent isn't a flex container. */
[data-slot="section-title"] {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem; /* icon ↔ text */
}

[data-slot="section-title"]::before {
    content: "";
    display: inline-block;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    background-color: currentColor; /* tints the icon to the title text color */
    -webkit-mask: var(--icon-star) center / contain no-repeat;
    mask: var(--icon-star) center / contain no-repeat;
}
```

**Swap on state by toggling only the mask.** Have the component set a `data-*` attribute on an ancestor when state changes, then add a rule that overrides just the mask image — size and tint stay put. Here the star becomes a `check` once the element is marked complete:

```css
[data-slot="section-title"][data-complete]::before {
    -webkit-mask: var(--icon-check) center / contain no-repeat;
    mask: var(--icon-check) center / contain no-repeat;
}
```

> **Caveat — keep the structure stable.** Decoration hooked to structural selectors (`:first-child`, `> span`, `data-slot`) breaks if that structure shifts. If the icon must stay `:first-child`, keep that first element mounted (render it empty rather than removing it) so the icon doesn't detach. If you decorate by position, don't conditionally add or remove the siblings around it.

---

## Accessibility and Design System

- Use **semantic HTML** (`<button>`, `<nav>`, `<main>`, etc.) and appropriate **ARIA** where needed.
- Ensure **keyboard navigation** and visible **focus states** for interactive elements.
- Aim for **WCAG** compliance (contrast, focus order, labels).
- Keep **spacing and typography** consistent with the design system defined in `src/theme/` and Tailwind config.

---

## Summary

Quick reference:

| Do | Don't |
|----|--------|
| Tailwind utility classes | Inline styles, CSS modules, component-level `.css` files |
| `cn()` for conditional classes | Manual string concatenation for `className` |
| Design tokens (`bg-background`, `text-muted-foreground`) | Hard-coded colors |
| `npx shadcn@latest add <name>` | Manually copying or creating components in `src/components/ui/` |
| Global/theme styles in `src/theme/` | Scattered or duplicate global CSS |

For a short checklist, see the styling section in the Storefront Next development guidelines (e.g. the `storefront_next_development_guidelines` tool).
