# Page Designer Components - Developer Guide

Comprehensive guide for developing components in Salesforce Page Designer system.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Component Wrapper (Internal)](#component-wrapper-internal)
3. [Region Component API](#region-component-api)
4. [Component Development](#component-development)
5. [Performance Best Practices](#performance-best-practices)
6. [Page Development](#page-development)
7. [Business Manager Integration](#business-manager-integration)
8. [Troubleshooting](#troubleshooting)
9. [Quick Reference](#quick-reference)
10. [Additional Resources](#additional-resources)

---

## Core Concepts

### Architecture Overview

The Page Designer system has four key concepts:

1. **Pages** - Top-level containers from ShopperExperience API
2. **Regions** - Named areas within pages or components that contain components
3. **Components** - Individual UI elements (Hero, Carousel, Grid, etc.)
4. **ComponentData** - Async data loaded by component loaders

```
Page (from loader)
└── ComponentData Map { componentId → Promise<data> }
└── Region "header"
    ├── Component "hero-1"
    ├── Component "carousel-2"
└── Region "main"
    ├── Component "grid-3"
        └── Region "main" (nested)
            ├── Component "banner-4"
            ├── Component "banner-5"
```

### Data Flow

```
Route Loader
  ↓
  Fetches Page + ComponentData { componentId → Promise<data> }
  ↓
  ┌──────────────────────────────────────────────────────┐
  │ <Region page={page}>                                 │
  │   ↓                                                   │
  │   Creates ComponentDataProvider                      │
  │   ↓                                                   │
  │   <Component wrapper id="hero-1">                    │
  │     ↓                                                 │
  │     useComponentDataById("hero-1") → Promise<data>   │
  │     ↓                                                 │
  │     <Suspense fallback={<Fallback />}>               │
  │       ↓                                               │
  │       <Await resolve={dataPromise}>                  │
  │         ↓                                             │
  │         Promise resolves → data                      │
  │         ↓                                             │
  │         <YourComponent data={data} />                │
  │       </Await>                                        │
  │     </Suspense>                                       │
  └──────────────────────────────────────────────────────┘
```

This flow shows a component with deferred loader data. A critical component without deferred data follows the
shell-blocking path described in [Critical Page Regions](#critical-page-regions).

### When Are Data Promises Resolved?

Component data promises are resolved **automatically by the Component wrapper** using React Router's `<Await>`:

1. **Page Loader Returns Promises** - Route loader returns componentData map:
   ```tsx
   export async function loader() {
       return {
           page,
           componentData: {
               'hero-1': fetchHeroData(),      // Promise<HeroData>
               'carousel-2': fetchCarouselData(), // Promise<CarouselData>
           },
       };
   }
   ```

2. **ComponentDataProvider Stores Promises** - Region creates provider at page level:
   ```tsx
   <ComponentDataProvider value={componentData}>
       {/* All nested components can access promises */}
   </ComponentDataProvider>
   ```

3. **Component Wrapper Retrieves Promise** - Internal wrapper gets promise by ID:
   ```tsx
   // In Component wrapper (internal)
   const dataPromise = useComponentDataById(component.id); // → Promise<data>
   ```

4. **Await Resolves Promise** - Wrapper uses React Router's `<Await>`:
   ```tsx
   // In Component wrapper (internal)
   <Suspense fallback={<FallbackComponent />}>
       <Await resolve={dataPromise}>
           {(data) => <YourComponent data={data} />}
       </Await>
   </Suspense>
   ```

5. **Component Receives Resolved Data** - Your component gets resolved data:
   ```tsx
   // Your component receives this
   export default function Hero({ data }) {
       // data is already resolved, not a Promise!
       return <h1>{data.title}</h1>;
   }
   ```

**Key Points:**
- ✅ You **never handle promises** in your component code
- ✅ The `data` prop is **always resolved** (or undefined)
- ✅ Promise resolution happens in the **Component wrapper** (internal)
- ✅ While resolving, your **fallback is shown** automatically
- ✅ Multiple components resolve **in parallel** (not sequential)
- ✅ If no loader/data, component receives `data={undefined}` immediately

**Edge Cases:**

```tsx
// No loader exported → data is undefined (renders immediately)
export default function StaticBanner({ title }) {
    // data is undefined, component renders immediately
    return <div>{title}</div>;
}

// Loader returns null → data is null (after promise resolves)
export const loader = {
    server: async () => null,
};
export default function ConditionalBanner({ data }) {
    // data is null (promise resolved to null)
    if (!data) return <div>Not configured</div>;
    return <div>{data.title}</div>;
}

// Component not in componentData map → data is undefined
// This happens when page loader doesn't include component ID
export default function MyComponent({ data }) {
    // data is undefined
    return <div>{data?.title ?? 'No data'}</div>;
}
```

---

## Component Wrapper (Internal)

Every Page Designer component is wrapped by an internal `Component` wrapper that handles:

### What the Wrapper Does

1. **Module Loading** - Loads component code on demand, or uses the module prepared by a critical region
2. **Data Resolution** - Retrieves and resolves data promises via `<Await>`
3. **Suspense Boundaries** - Keeps deferred data and non-critical or client-only module suspension local to the affected component
4. **Design Metadata** - Injects Page Designer metadata
5. **Error Handling** - Handles data loading errors gracefully

### Component Wrapper Flow

```tsx
// Internal wrapper (you don't write this)
export const Component = memo(function Component({ component, regionId }) {
    const dataPromise = useComponentDataById(component.id);
    const isInCriticalRegion = useIsInCriticalRegion();
    const wasServerRendered = useWasServerRendered(component.id, component.typeId);
    const requiresRegistration = !(dataPromise instanceof Promise);
    const FallbackComponent = registry.getFallback(component.typeId);
    const fallback = FallbackComponent ? <FallbackComponent {...component.data} /> : <div />;

    const content = dataPromise instanceof Promise
        ? (
            <Await resolve={dataPromise} errorElement={<ComponentErrorFallback />}>
                {(data) => <ResolvedComponent component={component} data={data} regionId={regionId} />}
            </Await>
        )
        : <ResolvedComponent component={component} data={undefined} regionId={regionId} />;

    // Only an exact component instance emitted by critical SSR, without deferred data,
    // omits the local boundary so its module and render tree block the server shell.
    const componentContent = isInCriticalRegion && wasServerRendered && requiresRegistration
        ? content
        : <Suspense fallback={fallback}>{content}</Suspense>;

    return (
        <>
            {wasServerRendered && (
                <CriticalComponentHydrationMarker
                    componentId={component.id}
                    componentTypeId={component.typeId}
                    requiresRegistration={requiresRegistration}
                />
            )}
            <ComponentErrorBoundary fallback={fallback}>
                {componentContent}
            </ComponentErrorBoundary>
        </>
    );
});
```

The component marker is inert and records that this exact component ID and type ID participated in critical SSR.
Components mounted later in the same critical region do not find such a marker and therefore keep their local boundary.
Only a marker for a component without deferred data also carries the registration attribute read before hydration.

### What This Means for You

**You only write:**
```tsx
export default function MyComponent({ data, ...props }) {
    // data is already resolved!
    return <div>{data.title}</div>;
}

export function fallback(props) {
    // Shown while component data or its concrete component module loads
    return <Skeleton />;
}
```

**You DON'T write:**
- ❌ Suspense boundaries (wrapper handles it)
- ❌ Await logic (wrapper handles it)
- ❌ Promise resolution (wrapper handles it)
- ❌ Lazy loading (wrapper handles it)

### Component Data Loading Error Handling

When a component's data promise rejects (e.g., API error, network failure), the Component wrapper handles it gracefully:

**Behavior:**
1. **Error is logged** - Console error with component ID and type
2. **Component renders nothing** - Returns `null` (removed from DOM)
3. **Page continues rendering** - Other components are unaffected
4. **No error boundary triggered** - Error is caught and handled locally

**Example Error Log:**
```
[Page Designer] Failed to load data for component "hero-1" (Content.hero):
Error: API Error 401: Unauthorized (GET /api/...)
```

**Why render nothing on error?**
- ❌ **Don't show skeleton** - Misleading (data will never arrive)
- ❌ **Don't show fallback** - Wrong state (not loading, failed)
- ✅ **Show nothing** - Honest representation of failure
- ✅ **Let other components work** - Graceful degradation

**Example:**
```tsx
// Component with failing data loader
export const loader = {
    server: async () => {
        // This throws 401 Unauthorized
        return await fetchRestrictedData();
    }
};

export default function Hero({ data }) {
    // This component will render nothing if loader fails
    // Error is logged to console for debugging
    return <h1>{data.title}</h1>;
}

// On error:
// 1. Console shows: "[Page Designer] Failed to load data for component..."
// 2. Component returns null (not rendered)
// 3. Page continues rendering other components normally
```

**Handling errors in your component:**
If your component needs custom error handling, handle it in the loader:

```tsx
export const loader = {
    server: async () => {
        try {
            return await fetchData();
        } catch (error) {
            // Log, report to monitoring, etc.
            return { error: true, message: 'Failed to load' };
        }
    }
};

export default function Hero({ data }) {
    if (data?.error) {
        return <div>Could not load hero content</div>;
    }
    return <h1>{data.title}</h1>;
}
```

---

## Region Component API

The `Region` component supports two modes via discriminated union types:

### Page Mode (Route-Level Regions)

Used at the route level for rendering page regions.

```tsx
import { Region } from '@/components/region';

export default function CategoryPage({ loaderData }) {
    return (
        <Region
            page={loaderData.page}                    // Promise<Page> or Page
            regionId="main"
            fallbackElement={<Skeleton />}            // Optional: non-critical Suspense fallback
            errorElement={<ErrorBoundary />}          // Optional: Error boundary
            className="my-custom-class"               // Optional: CSS classes
            critical={false}                          // Optional: block the shell on modules/styles
        />
    );
}
```

**Characteristics:**
- Accepts `page` prop (Promise or synchronous)
- Wraps non-critical page promises in a region-level `<Suspense>` boundary
- Creates `ComponentDataProvider` at page level
- Registers `PageDesignerPageMetadataProvider` for root regions
- Supports streaming/progressive rendering

### Critical Page Regions

Set `critical` only on a page-level region whose Page Designer content is required in the initial HTML, such as an above-the-fold hero or other LCP candidate:

```tsx
export async function loader(args: LoaderFunctionArgs) {
    const page = fetchPageWithComponentData(args, { pageId: 'homepage' });
    const recommendations = fetchRecommendations(args.context);

    return {
        page: await page, // Critical: the region structure must be known before rendering
        recommendations, // Non-critical: keep unrelated data deferred
    };
}

export default function HomePage({ loaderData }: Route.ComponentProps) {
    return <Region page={loaderData.page} regionId="headerbanner" critical />;
}
```

A critical region:

- Loads and registers the direct component types of each region that is actually rendered before those components enter the initial SSR shell.
- Prepares nested regions only when their owning component renders them, so conditional nested payloads do not import unused modules.
- Requires an already resolved page value.
- Lets module and render-tree suspension from components without deferred data reach the nearest outer boundary, blocking the initial shell instead of rendering `fallbackElement` or a component fallback.
- Keeps each component's asynchronous loader data inside its existing local `<Suspense>` boundary. `critical` does not make all component data blocking.

Every component wrapper actually reached during SSR emits its own production resource hints. Use `critical` sparingly because preparing above-the-fold components and blocking on their render trees delays the initial shell. The prop is intentionally unavailable in component mode; nested regions inherit critical status from their containing page region.

The Storefront Next Vite plugin must generate the Page Designer preload manifest. The template enables this in `vite-plugins/storefront-next.ts`:

```tsx
storefrontNextSdk({
    staticRegistry: {
        componentPath: 'src/components',
        registryPath: 'src/lib/page-designer/static-registry.ts',
        preloadManifest: true,
    },
});
```

Application, route, and extension styles rendered through React Router's `links` export must use the storefront precedence helper so critical component styles are inserted after them in a stable cascade:

```tsx
import { createStorefrontStylesheetLink } from '@salesforce/storefront-next-runtime/design/react/preload';
import appStylesHref from '@/styles/app.css?url';

export const links: Route.LinksFunction = () => [createStorefrontStylesheetLink(appStylesHref)];
```

Keep static registry initialization at entry startup so importers exist before component registration begins. The template calls `initializeRegistry()` from `entry.server.tsx` during server module initialization and synchronously from `entry.client.tsx` before scanning critical component markers; do not move it into the `App` render function.

Resource hints are based on the finalized production client bundle. Development uses an empty resource manifest, while component modules continue to load through the registry normally.

### Module Loading and Hydration

The server and browser have separate component registries. A component can therefore exist in SSR markup before its concrete browser export is registered. Storefront Next combines three mechanisms to keep that markup stable without registering speculative payload branches:

1. Every component wrapper actually reached during SSR emits resource hints for its own module and styles. Conditional components whose wrappers are never reached emit no hints.
2. Every critical component actually emitted by SSR writes an inert `<template>` marker containing its exact component ID and type ID. Components without deferred data additionally expose their type through a registration attribute. Before hydration, the client registers only the unique types carrying that attribute; during hydration, the marker ID identifies every actual SSR instance independently of whether it needs registration.
3. Non-critical components, components with deferred data, and components mounted later on the client resolve their concrete exports inside a component-local Suspense boundary. Their modules register on demand without replacing the parent region.

There is no page-wide owner and a page may contain any number of critical regions.

#### Exact Component Discovery

The declared recursive region payload is deliberately not serialized for client registration: it can contain nested components that a layout conditionally omitted from the actual render tree. Instead, every exact critical component instance emits a marker only when its wrapper is reached during SSR. A component without deferred data also marks its type for pre-hydration registration:

```html
<template
    id="page-designer-critical-component-hero-1%3AContent.hero"
    data-page-designer-component-type="Content.hero">
</template>
```

The marker ID combines the component ID and component type ID. The component wrapper reads it during hydration to
preserve the same boundary structure as the server. The type ID prevents an instance whose ID is reused with a different
type from being mistaken for the server-rendered component. The data attribute lets the client registry read the type
directly instead of parsing the encoded ID. Duplicate types are registered once in DOM discovery order.

Critical components with deferred data emit the same ID marker, but omit
`data-page-designer-component-type` because they retain their local Suspense boundary on both server and client.
This distinction matters for layout parents with an actual data loader: the parent remains identifiable as
server-rendered even when deferred data keeps it out of the registration barrier, while its concrete children can
independently request pre-hydration registration. Non-critical components emit no critical marker and register on
demand.

Only an actual server `loader` export creates an entry in the page's component-data map. A `clientLoader` or configured
visual `fallback` is not server data and must not create a resolved `Promise<undefined>`: doing so would incorrectly
retain a local Suspense boundary around otherwise synchronous critical layouts such as Hero Carousel.

#### Resource Hints and Registration

Resource hints and registry loading are complementary:

- `preloadModule()` starts fetching component entries and dependencies.
- `preinit()` activates component styles with stable Page Designer precedence.
- `registry.loadAndRegister()` evaluates a module and registers its concrete default export.

A module preload does not populate the application registry. The generated manifest therefore describes only the resource graph needed for hints; it contains no byte budgets, size estimates, compression settings, or schema version. Producer and consumer are built and deployed together, so mixed manifest schemas are not supported.

The client entry initializes generated importers and scans the exact critical component markers already present. Their unique imports run concurrently, and hydration waits only for those boundary-free critical types to settle. Registration runs in parallel with i18n initialization and does not wait for `DOMContentLoaded`. All other types rely on the component-local Suspense path.

Concurrent requests for one type share the same in-flight promise. A rejected registration becomes a stable error rather than a loop of newly rejected promises. The local `ComponentErrorBoundary` contains browser failures to the affected component; SSR consumes a terminal registration error so a later request can retry.

This keeps the hydration barrier proportional to the critical SSR output rather than the complete recursive Page Designer payload. Measure critical module evaluation and its effect on long tasks and TBT alongside LCP and hydration stability.

### Component Mode (Nested Regions)

Used for nested regions inside layout components (Grid, Carousel, Tabs, etc.).

```tsx
import { Region } from '@/components/region';

export default function Grid({ component }) {
    return (
        <div className="grid">
            <Region
                component={component}                 // Component object (synchronous)
                regionId="main"
                errorElement={<div>No content</div>}  // Optional: fallback if region missing
            />
        </div>
    );
}
```

**Characteristics:**
- Accepts `component` prop (synchronous only)
- Region lookup is synchronous. Children with deferred data and children mounted only on the client retain their component-local `<Suspense>` boundary; an exact child emitted during critical SSR without deferred data inherits the shell-blocking behavior.
- Inherits `ComponentDataProvider` from parent
- No `PageDesignerPageMetadataProvider` (nested context)
- Better performance (no async overhead)

### Type Safety

TypeScript enforces correct usage:

```tsx
// ✅ Valid: page mode
<Region page={pagePromise} regionId="main" />

// ✅ Valid: critical page mode
<Region page={resolvedPage} regionId="hero" critical />

// ✅ Valid: component mode
<Region component={component} regionId="main" />

// ❌ Compile Error: can't pass both
<Region page={pagePromise} component={component} regionId="main" />

// ❌ Compile Error: critical is page-mode only
<Region component={component} regionId="main" critical />

// ❌ Compile Error: must pass one or the other
<Region regionId="main" />
```

### Error Fallbacks: Anti-Pattern ⚠️

**DO NOT use `errorElement` for Page Designer components only to hide that page designer components aren't set up.** This is considered a bad practice.

#### Why Error Fallbacks Are Bad

1. **Defeats the purpose of Page Designer** - Content managers should control content, not developers
2. **Hides page designer problems** - Pages set up with PD, should render PD content, error fallbacks hide breakages.
3. **Performance overhead** - Oftentimes forces unnecessary data fetching
4. **Maintenance burden** - Hardcoded fallbacks need updates when designs change
5. **Inconsistent experience** - Error fallbacks bypass Page Designer configuration

#### Wrong Approach ❌

```tsx
// BAD: Error fallback with hardcoded content
<Region
    page={loaderData.page}
    regionId="main"
    errorElement={
        <>
            <HeroCarousel slides={heroSlides} />
            <ProductCarousel products={loaderData.products} />
        </>
    }
/>

// BAD: Loader fetching data just for error fallback
export function loader(args) {
    return {
        page: fetchPage(args),
        products: fetchProducts(args), // ❌ Only used in errorElement
        categories: fetchCategories(args), // ❌ Only used in errorElement
    };
}
```

#### Correct Approach ✅

```tsx
// GOOD: Use skeleton fallbackElement for loading states
<Region
    page={loaderData.page}
    regionId="main"
    fallbackElement={
        <div className="space-y-8">
            <div className="h-64 bg-gray-200 animate-pulse rounded" />
            <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-48 bg-gray-200 animate-pulse rounded" />
                ))}
            </div>
        </div>
    }
/>

// GOOD: Or just omit if region is below the fold
<Region page={loaderData.page} regionId="footer" />

// GOOD: Loader only fetches page data
export function loader(args) {
    return {
        page: fetchPage(args), // ✅ Only what's needed
    };
}
```

#### What To Do Instead

1. **Use `fallbackElement`** - For loading states (Suspense boundaries)
2. **Let Page Designer control content** - Content managers add/remove components
3. **Trust the empty state** - If a region is empty, render nothing
4. **Add default components in Page Designer** - Configure via PD, not code
5. **Graceful fallback** - Show nothing in case Page loading fails

#### Migration Example

**Before:**
```tsx
// Homepage with error fallbacks
export function loader(args) {
    return {
        page: fetchPage(args),
        products: fetchProducts(args), // Only for errorElement
        categories: fetchCategories(args), // Only for errorElement
    };
}

<Region
    page={loaderData.page}
    regionId="main"
    errorElement={
        <>
            <PopularCategories categories={loaderData.categories} />
            <FeaturedProducts products={loaderData.products} />
        </>
    }
/>
```

**After:**
```tsx
// Homepage without error fallbacks
export function loader(args) {
    return {
        page: fetchPage(args), // That's it!
    };
}

<Region
    page={loaderData.page}
    regionId="main"
    fallbackElement={
        <div className="space-y-8">
            <Skeleton className="h-64" />
            <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-48" />
                ))}
            </div>
        </div>
    }
/>
```

**Benefits:**
- ✅ Removed 2 unnecessary API calls
- ✅ Faster page loads
- ✅ Content managers control all content
- ✅ Simpler loader logic
- ✅ Less code to maintain

---


### Layout & Styling with className

The `Region` component supports `className` prop for applying layout styles (flex, grid, spacing) to region content. This works consistently in both runtime and Page Designer design mode.

#### How className Works

**In Runtime Mode:**
- `className` is applied to the region's content wrapper
- Layout classes control how child components are arranged

**In Design Mode (Page Designer):**
- `className` is applied to the `.pd-design__frame` content container
- Layout classes work the same as runtime
- Page Designer decorator wrappers use `display: contents` to stay transparent to layout

#### Basic Usage

```tsx
// Horizontal flex layout
<Region
    page={loaderData.page}
    regionId="categories"
    className="flex gap-4 overflow-x-auto"
/>

// Grid layout
<Region
    page={loaderData.page}
    regionId="products"
    className="grid grid-cols-2 md:grid-cols-4 gap-6"
/>

// Vertical stack with spacing
<Region
    page={loaderData.page}
    regionId="main"
    className="space-y-8"
/>
```

#### Common Layout Patterns

**Horizontal Scroll Container:**
```tsx
<Region
    page={loaderData.page}
    regionId="featured"
    className="flex gap-4 md:gap-6 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
/>
```

**Responsive Grid:**
```tsx
<Region
    page={loaderData.page}
    regionId="grid"
    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
/>
```

**Centered Content:**
```tsx
<Region
    page={loaderData.page}
    regionId="hero"
    className="flex flex-col items-center justify-center min-h-[400px]"
/>
```

#### When to Use className

Use `className` on `Region` when:
- ✅ The region itself needs layout properties (flex, grid, spacing)
- ✅ Child components should be direct flex/grid items
- ✅ Layout is consistent regardless of which components are inside

Do **NOT** use `className` when:
- ❌ Only one component will ever be in the region (put styles on the component)
- ❌ Different component types need different layouts (handle in component logic)
- ❌ Applying decorative styles (colors, borders, etc.) - wrap Region in a styled div

#### Layout with Parent Containers

If you need to control the region wrapper itself (padding, background, borders), wrap the Region:

```tsx
<div className="bg-muted/50 py-12 md:py-16">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Region
            page={loaderData.page}
            regionId="categories"
            className="flex gap-4 overflow-x-auto"
        />
    </div>
</div>
```

Structure:
- **Outer wrapper**: Background, padding, theming
- **Container**: Max-width, horizontal padding
- **Region className**: Layout of child components

#### Design Mode Behavior

In Page Designer design mode, the DOM structure includes decorator wrappers:

```html
<!-- Runtime -->
<div class="flex gap-4">
  <PopularCategory />
  <PopularCategory />
</div>

<!-- Design Mode -->
<div class="pd-design__region">
  <div class="pd-design__frame flex gap-4">  <!-- className applied here -->
    <div class="pd-design__component">
      <PopularCategory />
    </div>
    <div class="pd-design__component">
      <PopularCategory />
    </div>
  </div>
</div>
```

The `.pd-design__frame` wrapper has `display: contents` in CSS, making it transparent to layout so child components become direct flex/grid items of the parent container.

#### Troubleshooting Layout Issues

**Problem:** Components stack vertically in design mode but render horizontally at runtime

**Solution:** Pass `className` to the Region:
```tsx
// Before (broken in design mode)
<div className="flex gap-4">
    <Region page={page} regionId="items" />
</div>

// After (works in both modes)
<Region page={page} regionId="items" className="flex gap-4" />
```

**Problem:** Layout classes not applying

**Cause:** Conflicting specificity or missing CSS
**Solution:** 
- Check that Tailwind classes are valid
- Use browser DevTools to inspect computed styles
- Verify className is reaching `.pd-design__frame` in design mode

---

## Component Development

### Component Module Contract

All Page Designer components must follow this structure:

```tsx
// src/components/my-component/index.tsx

import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import { RegionDefinition } from '@/lib/decorators';

// 1. Metadata class with decorators (for Page Designer UI)
@Component('myComponent', {
    name: 'My Component',
    description: 'A reusable component for...',
})
@RegionDefinition([
    {
        id: 'content',
        name: 'Content',
        description: 'Add components here',
    },
])
export class MyComponentMetadata {
    @AttributeDefinition({
        name: 'Title',
        description: 'Component title',
        type: 'string',
        defaultValue: 'Default Title',
    })
    title?: string;

    @AttributeDefinition({
        name: 'Show Border',
        type: 'boolean',
        defaultValue: false,
    })
    showBorder?: boolean;
}

// 2. Props interface
interface MyComponentProps {
    title?: string;
    showBorder?: boolean;
    // Page Designer provided props
    component?: ShopperExperience.schemas['Component'];
    data?: MyComponentData; // From loader
    designMetadata?: ComponentDesignMetadata;
}

// 3. Fallback/Skeleton export (REQUIRED)
export function fallback({ title = 'Loading...' }: Partial<MyComponentProps>) {
    return (
        <div className="skeleton">
            <div className="skeleton-title">{title}</div>
        </div>
    );
}

// 4. Component loaders (if needed)
export const loader = {
    server: async ({ componentData, context, request }) => {
        const data = await fetchMyData(componentData?.id);
        return data;
    },
    client: async ({ componentData, request }) => {
        // Client-side logic if needed
        return null;
    },
};

// 5. Main component (DEFAULT EXPORT - REQUIRED)
export default function MyComponent({
    title = 'Default Title',
    showBorder = false,
    component,
    data,
}: MyComponentProps) {
    return (
        <div className={showBorder ? 'border' : ''}>
            <h2>{title}</h2>
            {data && <p>{data.description}</p>}

            {/* Nested region if component has regions */}
            {component && (
                <Region component={component} regionId="content" />
            )}
        </div>
    );
}
```

### Critical Requirements

#### ✅ DO

1. **Always export a `fallback`** - Used by component-data and non-critical module Suspense boundaries
2. **Default export must be the component** - Required by component registry
3. **Keep fallback lightweight** - No heavy computation or data fetching
4. **Use loaders for data** - Export `loader.server` or `loader.client`
5. **Accept Page Designer props** - `component`, `data`, `designMetadata`
6. **Handle undefined gracefully** - All props should have defaults

#### ❌ DON'T

1. **Don't render skeletons in main component** - Use `fallback` export instead
2. **Don't fetch data in render** - Use loaders
3. **Don't hardcode data** - Use props or loader data
4. **Don't wrap nested Regions in Suspense** - Component mode is synchronous
5. **Don't pass Promises to component-mode Regions** - Use synchronous values

### Design Metadata

Every Page Designer component receives a `designMetadata` prop containing information used by the Page Designer editor for selection, editing, and management.

#### ComponentDesignMetadata Interface

```typescript
interface ComponentDesignMetadata {
    /** Component identifier */
    id: string;

    /**
     * Content Link UUID - uniquely identifies this component instance.
     * When the same component/fragment appears multiple times on a page,
     * this UUID allows Page Designer to uniquely identify and manage each instance.
     */
    contentLinkUuid?: string;

    /** Whether this is a fragment (reusable component) */
    isFragment: boolean;

    /** Whether the component is visible (based on visibility rules) */
    isVisible: boolean;

    /** Whether the component has been localized for the current locale */
    isLocalized: boolean;

    /** Component name from Business Manager */
    name?: string;

    /** Region definitions if the component has nested regions */
    regionDefinitions?: RegionDesignMetadata[];
}
```

#### Content Link UUID

The `contentLinkUuid` field uniquely identifies each component instance on a page. This is especially important for:

- **Multiple instances of the same component** - When a fragment or component appears multiple times on a page, the UUID ensures each can be individually selected and managed
- **Component selection in Page Designer** - The editor uses this UUID to target the correct instance for editing or deletion
- **React key generation** - The UUID is used as the React key to ensure proper reconciliation

**SCAPI Response Structure:**

The UUID comes from the SCAPI `getPage` response at the component level:

```typescript
{
  "id": "component-123",
  "typeId": "commerce_assets.hero",
  "contentLinkUuid": "uuid-12345-abcde-67890",
  "data": { "title": "Welcome" }
}
```

This UUID is automatically extracted and provided in the `designMetadata` prop by StorefrontNext.

---

## Performance Best Practices

### 1. Lazy Loading and Code Splitting

Components are automatically lazy-loaded via the component registry. Direct modules in each actually rendered critical region are instead loaded and registered before entering the initial SSR shell; nested regions prepare their children only when rendered. A critical component without deferred data renders inline and its render tree can delay that shell. Components with deferred data remain granular inside their local boundaries. Ensure:

```tsx
// ✅ Good: Component in its own module
// src/components/hero/index.tsx
export default function Hero({ ... }) { ... }

// ❌ Bad: Multiple components in one module
export function Hero({ ... }) { ... }
export function Banner({ ... }) { ... }
```

### 2. Optimize Fallbacks

Keep fallback components minimal:

```tsx
// ✅ Good: Lightweight skeleton
export function fallback() {
    return <div className="h-48 bg-gray-200 animate-pulse" />;
}

// ❌ Bad: Heavy fallback with state/effects
export function fallback() {
    const [loading, setLoading] = useState(true);
    useEffect(() => { /* ... */ }, []);
    return <ComplexSkeleton />;
}
```

### 3. Memoization

Use `memo` for components that receive stable props:

```tsx
import { memo } from 'react';

export default memo(function Hero({ title, image }) {
    return (
        <div>
            <h1>{title}</h1>
            <img src={image} alt={title} />
        </div>
    );
});
```

### 4. Loader Performance

Optimize loaders for performance:

```tsx
// ✅ Good: Parallel data fetching
export const loader = {
    server: async ({ component }) => {
        const [products, categories] = await Promise.all([
            fetchProducts(component.data?.productIds),
            fetchCategories(component.data?.categoryIds),
        ]);
        return { products, categories };
    },
};

// ❌ Bad: Sequential fetching
export const loader = {
    server: async ({ component }) => {
        const products = await fetchProducts(component.data?.productIds);
        const categories = await fetchCategories(component.data?.categoryIds);
        return { products, categories };
    },
};
```

### 5. Component Data Context

The `ComponentDataProvider` is created once at page level:

```tsx
// ✅ Automatic: Region handles this
<Region page={page} regionId="main" />
// Creates: <ComponentDataProvider value={page.componentData}>

// ✅ Good: Nested regions inherit context
function Grid({ component }) {
    return <Region component={component} regionId="main" />;
    // No new provider - inherits from page level
}

// ❌ Bad: Don't create duplicate providers
function Grid({ component, componentData }) {
    return (
        <ComponentDataProvider value={componentData}>
            <Region component={component} regionId="main" />
        </ComponentDataProvider>
    );
}
```

---

## Page Development

### Overview

Page annotations allow you to define metadata for your route components that integrates with Salesforce B2C Commerce's Page Designer. The `@PageType` decorator marks a route as a Page Designer-enabled page and specifies which aspect types it supports.

### The @PageType Decorator

The `@PageType` decorator is applied to a metadata class exported from your route file. It defines:

- **name** - Human-readable name displayed in Business Manager
- **description** - Detailed description of the page's purpose
- **supportedAspectTypes** - Array of SFCC aspect types that this page supports

### Basic Example

```tsx
import { PageType } from '@/lib/decorators/page-type';
import { RegionDefinition } from '@/lib/decorators/region-definition';

@PageType({
    name: 'Product Detail Page',
    description: 'Product detail page with product information, images, and recommendations',
    supportedAspectTypes: ['pdp'],
})
@RegionDefinition([
    {
        id: 'promoContent',
        name: 'Promo Content Region',
        description: 'Promotional content region above main product content',
        maxComponents: 1,
    },
    {
        id: 'engagementContent',
        name: 'Engagement Content Region',
        description: 'Engagement content region for recommendations and related products',
        maxComponents: 1,
    },
])
export class ProductPageMetadata {}

export function loader(args: LoaderFunctionArgs) {
    // Loader implementation
}

export default function ProductPage({ loaderData }) {
    return (
        <div>
            <Region page={loaderData.page} regionId="promoContent" />
            {/* Main product content */}
            <Region page={loaderData.page} regionId="engagementContent" />
        </div>
    );
}
```

### Real-World Examples

#### Homepage Example

```tsx
@PageType({
    name: 'Home Page',
    description: 'Main landing page with hero carousel, featured products, and help sections',
    supportedAspectTypes: [],
})
@RegionDefinition([
    {
        id: 'headerbanner',
        name: 'Header Banner Region',
        description: 'Region for promotional banners and hero content',
        maxComponents: 3,
    },
    {
        id: 'main',
        name: 'Main Content Region',
        description: 'Region for main content',
        maxComponents: 5,
    },
])
export class HomePageMetadata {}
```

#### Category Page Example

```tsx
@PageType({
    name: 'Category Listing',
    description: 'Category page with product grid and filters',
    supportedAspectTypes: ['category'],
})
@RegionDefinition([
    {
        id: 'banner',
        name: 'Category Banner',
        description: 'Hero banner for category pages',
        maxComponents: 1,
    },
])
export class CategoryPageMetadata {}
```

#### Search Page Example

```tsx
@PageType({
    name: 'Search Results',
    description: 'Search results page with product grid and refinements',
    supportedAspectTypes: ['search'],
})
@RegionDefinition([
    {
        id: 'searchHeader',
        name: 'Search Header Region',
        description: 'Content above search results',
        maxComponents: 2,
    },
])
export class SearchPageMetadata {}
```

### Key Points

- ✅ The metadata class must be exported from your route file
- ✅ Use `@PageType` in combination with `@RegionDefinition` to define regions
- ✅ Region IDs must match the `regionId` prop used in `<Region>` components
- ✅ The `supportedAspectTypes` determines which SFCC page types can use this route
- ❌ Don't add aspect types that don't make sense for your route
- ❌ Don't forget to export the metadata class

---

## Business Manager Integration

### Overview

When you use Page Designer in Salesforce B2C Commerce Business Manager, several steps happen behind the scenes to connect your configured pages with your application's routes. Understanding this workflow helps you troubleshoot issues and design better page templates.

### The Page Designer Workflow

#### 1. Page Configuration in Business Manager

Content managers use Business Manager to:

1. **Create a Page** - Navigate to Merchant Tools > Content > Page Designer
2. **Select Page Type** - Choose a page type that corresponds to a route's `supportedAspectTypes`
3. **Configure Regions** - Add components to regions defined in your route's `@RegionDefinition`
4. **Assign to Aspect** - Associate the page with a specific product, category, or content asset
5. **Publish** - Activate the page configuration

**Why Pages Need to Be Created:**

Pages must be explicitly created in Business Manager because:

- **Content Separation** - Separates content configuration from code deployment
- **Multi-Site Support** - Different sites can have different page configurations
- **Content Management** - Non-technical users can manage page content without code changes
- **Versioning** - Pages can be versioned, scheduled, and A/B tested
- **Fallback Hierarchy** - SFCC uses a fallback system (specific page → default page → hardcoded fallback)

#### 2. Runtime Page Resolution

When a user visits your application, the following happens:

```
User Request
    ↓
1. Route Loader Executes
    ↓
2. fetchPageWithComponentData() called
    ↓
3. ShopperExperience API Request
    ↓
4. SFCC Page Designer Service
    │
    ├─→ Finds page by pageId + aspect (e.g., pageId="pdp", productId="12345")
    ├─→ Checks for specific page configuration
    ├─→ Falls back to default page if not found
    └─→ Returns page structure with regions and components
    ↓
5. Response Contains:
    - Page metadata (ID, name, etc.)
    - Region definitions with component arrays
    - Component metadata (typeId, data attributes)
    ↓
6. Component Data Loading
    - For each component in page, loader is called
    - Component loaders fetch data in parallel
    - Returns map of componentId → Promise<data>
    ↓
7. React Rendering
    - Critical page regions prepare direct children as each region is actually rendered
    - Critical component instances without deferred data render inline and block that shell if their render tree suspends
    - Non-critical component modules load on demand through their local Suspense boundary
    - Deferred component data remains inside a component-local Suspense boundary, including in critical regions
    - Production SSR emits module hints and ordered styles only for component wrappers it actually reaches
    - Await resolves data promises
    - Components render with resolved data
```

#### 3. Page Metadata Generation

During your build process, the application generates metadata files that SFCC Page Designer uses. This metadata enables Business Manager to understand your components and pages.

**What Gets Generated:**

1. **Component Definitions** - Metadata for each Page Designer component
    - Component ID, name, description
    - Attribute definitions (props configuration)
    - Region definitions (nested regions)
    - Attribute types and validation rules

2. **Page Type Definitions** - Metadata for each annotated route
    - Page type name and description
    - Supported aspect types
    - Available regions and their constraints
    - Region metadata (maxComponents, descriptions)

**The Generation Process:**

The metadata generation happens automatically during your build process using specialized tools:

```bash
# During build, these steps occur:
npm run build

# Step 1: TypeScript compilation
# - Compiles your source code
# - Preserves decorator metadata via reflect-metadata

# Step 2: Metadata generation (sfnext generate-cartridge)
# - Scans compiled components and routes
# - Extracts @Component, @PageType, @RegionDefinition decorators
# - Reads @AttributeDefinition metadata
# - Generates JSON metadata files

# Step 3: Cartridge assembly
# - Copies metadata to cartridge directory structure
# - Organizes files by component/page type
```

**Generated File Structure:**

```
cartridges/app_storefront_next/cartridge/experience/
├── components/
│   ├── Content.hero.json          # Hero component metadata
│   ├── Content.product_carousel.json
│   ├── Content.grid.json
│   └── ...
└── pages/
    ├── pdp.json                         # Product detail page metadata
    ├── category.json                     # Category page metadata
    ├── homepage.json                     # Homepage metadata
    └── ...
```

**Example Component Metadata File:**

```json
{
  "id": "Content.hero",
  "name": "Hero Banner",
  "description": "Large hero banner with image, title, and CTA",
  "group": "content",
  "attributeDefinitions": [
    {
      "id": "title",
      "name": "Title",
      "description": "Hero banner title",
      "type": "string",
      "required": false,
      "defaultValue": "Welcome"
    },
    {
      "id": "imageUrl",
      "name": "Image URL",
      "type": "string",
      "required": true
    },
    {
      "id": "showCta",
      "name": "Show CTA Button",
      "type": "boolean",
      "defaultValue": true
    }
  ],
  "regionDefinitions": []
}
```

**Example Page Metadata File:**

```json
{
  "id": "pdp",
  "name": "Product Detail Page",
  "description": "Product detail page with product information, images, and recommendations",
  "aspectTypeIds": ["pdp"],
  "route": "/product/:productId",
  "regionDefinitions": [
    {
      "id": "promoContent",
      "name": "Promo Content Region",
      "description": "Promotional content region above main product content",
      "maxComponents": 1
    },
    {
      "id": "engagementContent",
      "name": "Engagement Content Region",
      "description": "Engagement content region for recommendations and related products",
      "maxComponents": 1
    }
  ]
}
```

### Understanding route and aspectTypeIds

The generated page metadata includes two critical fields that connect your application routes to Business Manager:

#### 1. The `route` Field

**Purpose:** Defines the URL pattern used for iframe rendering in Business Manager's Page Designer.

**How it's used:**

When content managers edit a page in Business Manager's Page Designer interface, the system needs to render a live preview of the page in an iframe. The `route` field tells Business Manager which URL to load for the preview.

```json
{
  "id": "pdp",
  "route": "/product/:productId",
  "aspectTypeIds": ["pdp"]
}
```

**Page Designer Preview Flow:**

```
Content Manager Opens Page in Business Manager
    ↓
Page Designer UI loads
    ↓
Reads page metadata (pdp.json)
    ↓
Gets "route": "/product/:productId"
    ↓
Replaces :productId with actual product ID (e.g., "12345")
    ↓
Loads in iframe: https://your-storefront.com/product/12345
    ↓
Storefront renders with Page Designer components
    ↓
Content Manager sees live preview
    ↓
Can drag/drop components and see changes in real-time
```

**Route Format:**

- Uses React Router parameter syntax (`:paramName`)
- Must match your actual route file structure
- Parameters are replaced with actual IDs from the page context

**Examples:**

```json
// Product detail page
{
  "route": "/product/:productId"
}
// Business Manager loads: /product/12345

// Category page
{
  "route": "/category/:categoryId"
}
// Business Manager loads: /category/mens-clothing

// Search page
{
  "route": "/search?q=:searchTerm"
}
// Business Manager loads: /search?q=shirts

// Content page
{
  "route": "/content/:contentId"
}
// Business Manager loads: /content/about-us

// Homepage (no parameters)
{
  "route": "/"
}
// Business Manager loads: /
```

#### 2. The `aspectTypeIds` Field

**Purpose:** Defines which SFCC aspect types this page template supports.

**How it's used:**

SFCC organizes content using "aspects" - the type of entity a page is associated with. The `aspectTypeIds` field tells Business Manager which aspect types can use this page template.

**Common Aspect Types:**

| Aspect Type | Description | Example Use Case |
|-------------|-------------|------------------|
| `pdp` | Product Detail Page | Individual product pages |
| `category` | Category Page | Category landing pages |
| `search` | Search Results | Search results pages |
| `storefront` | Storefront/Homepage | Main landing page |
| `content` | Content Page | CMS content pages |
| `folder` | Folder Page | Content folder pages |

**How Business Manager Uses aspectTypeIds:**

1. **Page Creation** - When creating a new page in Business Manager, only page templates with matching aspect types are shown
2. **Page Assignment** - Pages can only be assigned to aspects they support
3. **Automatic Selection** - SFCC automatically selects the correct page template based on aspect type

**Example Flow:**

```
Content Manager wants to create a product-specific page
    ↓
Opens Page Designer > Create New Page
    ↓
Selects aspect type: "Product"
    ↓
Business Manager shows page templates where aspectTypeIds includes "pdp"
    ↓
Content Manager selects "Product Detail Page" template
    ↓
Assigns to specific product (ID: 12345)
    ↓
Page is now associated with product 12345
    ↓
When user visits /product/12345, this page configuration is used
```

**Multiple Aspect Types:**

A single page template can support multiple aspect types:

```json
{
  "id": "content-page",
  "aspectTypeIds": ["content", "folder"],
  "route": "/content/:contentId"
}
```

This allows the same template to be used for both content pages and folder pages.

**No Aspect Type (Homepage):**

Homepage and other standalone pages typically have empty aspect types:

```json
{
  "id": "homepage",
  "aspectTypeIds": [],
  "route": "/"
}
```

### How route and aspectTypeIds Work Together

The two fields work together to enable the complete Page Designer experience:

```json
{
  "id": "pdp",
  "name": "Product Detail Page",
  "route": "/product/:productId",        // ← Used for iframe preview
  "aspectTypeIds": ["pdp"],              // ← Determines when this template is used
  "regionDefinitions": [...]
}
```

**Complete Workflow:**

1. **Development:** Developer adds `@PageType` decorator to route
   ```tsx
   @PageType({
       name: 'Product Detail Page',
       supportedAspectTypes: ['pdp'],
   })
   export class ProductPageMetadata {}
   ```

2. **Build:** Metadata generation creates pdp.json with route and aspectTypeIds
   ```json
   {
     "route": "/product/:productId",
     "aspectTypeIds": ["pdp"]
   }
   ```

3. **Deployment:** Cartridge uploaded to SFCC with metadata

4. **Business Manager Setup:**
   - Content Manager creates new page
   - Selects "Product" aspect type
   - Sees "Product Detail Page" template (matches aspectTypeIds)
   - Assigns to specific product (ID: 12345)

5. **Page Designer Preview:**
   - Business Manager reads route: `/product/:productId`
   - Replaces `:productId` with `12345`
   - Loads iframe: `https://storefront.com/product/12345`
   - Shows live preview with Page Designer components

6. **Runtime:**
   - User visits `/product/12345`
   - Route loader calls `fetchPageWithComponentData({ pageId: 'pdp', productId: '12345' })`
   - SFCC finds page assigned to product 12345
   - Returns page configuration
   - Page renders with configured components

### Route Configuration Best Practices

**✅ DO:**

- Match route to your actual React Router file structure (automatically done with cartridge generation scripts)
- Use standard parameter syntax (`:paramName`)
- Document route parameters in page description

**❌ DON'T:**

- Include query parameters in the metadata route (except for search pages)

**Examples:**

```tsx
// ✅ Good: Clear, simple route
@PageType({
    name: 'Product Detail Page',
    supportedAspectTypes: ['pdp'],
})
// Generated route: /product/:productId

// ✅ Good: Multiple parameters
@PageType({
    name: 'Product Variant Page',
    supportedAspectTypes: ['pdp'],
})
// Generated route: /product/:productId/:variantId

// ❌ Bad: Optional parameters
// Route: /product/:productId?
// Business Manager can't handle optional params

// ❌ Bad: Hard-coded values
// Route: /product/12345
// Can only preview one specific product
```

**How Business Manager Uses This Metadata:**

1. **Component Library** - Displays available components in the Page Designer UI
2. **Attribute Forms** - Generates configuration forms for component attributes
3. **Page Types** - Shows available page types when creating new pages
4. **Region Constraints** - Enforces maxComponents and other region rules
5. **Validation** - Validates component configurations against attribute definitions

**Metadata Generation Tools:**

The build process uses `storefront-next-dev` for metadata generation:

- **`sfnext generate-cartridge`** - Scans decorators and generates metadata
  - Location: `packages/storefront-next-dev/src/cartridge-services/generate-cartridge.ts`
  - Reads TypeScript decorators via reflect-metadata
  - Outputs JSON files matching SFCC Page Designer schema
  - Run via `pnpm cartridge:generate` in the template, or `sfnext generate-cartridge --project-directory ./` for on-demand generation

**Verifying Metadata Generation:**

After building, verify metadata was generated correctly:

```bash
# Check component metadata files exist
ls cartridges/app_storefront_next/cartridge/experience/components/

# Check page metadata files exist
ls cartridges/app_storefront_next/cartridge/experience/pages/

# View a specific component's metadata
cat cartridges/app_storefront_next/cartridge/experience/components/Content.hero.json

# View a page type's metadata
cat cartridges/app_storefront_next/cartridge/experience/pages/pdp.json
```

**Troubleshooting Metadata Generation:**

**Issue: Component not appearing in Business Manager**

1. Check decorator syntax is correct:
   ```tsx
   @Component('myComponent', {
       name: 'My Component',
       description: 'Description',
   })
   export class MyComponentMetadata {}
   ```

2. Verify metadata file was generated:
   ```bash
   ls cartridges/*/cartridge/experience/components/ | grep myComponent
   ```

3. Check for build errors:
   ```bash
   npm run build 2>&1 | grep -i "error\|warn"
   ```

**Issue: Page type not appearing in Business Manager**

1. Verify `@PageType` decorator is present on exported class:
   ```tsx
   @PageType({
       name: 'My Page',
       description: 'Page description',
       supportedAspectTypes: ['pdp'],
   })
   export class MyPageMetadata {}
   ```

2. Check metadata file exists:
   ```bash
   ls cartridges/*/cartridge/experience/pages/
   ```

3. Verify cartridge was uploaded to SFCC instance

**Issue: Attributes not configurable in Business Manager**

1. Ensure `@AttributeDefinition` decorators are on class properties:
   ```tsx
   @AttributeDefinition({
       name: 'Title',
       type: 'string',
   })
   title?: string;
   ```

2. Check attribute appears in generated metadata:
   ```bash
   cat cartridges/*/cartridge/experience/components/my-component.json | jq '.attributeDefinitions'
   ```

3. Verify attribute type is supported by SFCC Page Designer

#### 4. API Data Flow

```tsx
// In your route loader
export function loader(args: LoaderFunctionArgs) {
    return {
        page: fetchPageWithComponentData(args, {
            pageId: 'pdp',              // Page type identifier
            productId: params.productId, // Aspect-specific ID
        }),
    };
}

// fetchPageWithComponentData does:
// 1. Calls ShopperExperience.getPage() API
// 2. Receives page structure with components
// 3. Calls each component's loader function
// 4. Returns { page, componentData }
```

This example keeps a non-critical page region deferred. If any region rendered from this page is marked `critical`, make the route loader `async` and await `fetchPageWithComponentData()` as shown in [Critical Page Regions](#critical-page-regions).

**API Response Structure:**

```json
{
  "id": "pdp-product-12345",
  "name": "Product Detail Page",
  "aspectTypeId": "pdp",
  "regions": [
    {
      "id": "promoContent",
      "components": [
        {
          "id": "component-1",
          "typeId": "Content.hero",
          "data": {
            "title": "Summer Sale",
            "imageUrl": "/images/hero.jpg"
          }
        }
      ]
    },
    {
      "id": "engagementContent",
      "components": [
        {
          "id": "component-2",
          "typeId": "odyssey_base.product_carousel",
          "data": {
            "title": "You May Also Like"
          }
        }
      ]
    }
  ]
}
```

### Business Manager Setup Checklist

When deploying a new Page Designer-enabled route:

- [ ] Add `@PageType` decorator to route metadata class
- [ ] Define `@RegionDefinition` for all regions used in route
- [ ] Build and deploy cartridge with updated metadata
- [ ] Create page in Business Manager (Merchant Tools > Content > Page Designer)
- [ ] Select correct page type matching `supportedAspectTypes`
- [ ] Add components to regions
- [ ] Assign page to specific aspect (product, category, etc.) or set as default
- [ ] Test page rendering in storefront
- [ ] Verify component loaders are working correctly

---

## Troubleshooting

### Issue: Page not loading from Business Manager

**Symptoms:** Page regions are empty or page content not appearing

**Solutions:**
1. Check page exists in Business Manager (Merchant Tools > Content > Page Designer)
2. Verify `pageId` in loader matches Business Manager page ID
3. Check aspect type assignment (product, category, etc.)
4. Verify region IDs match between code and Business Manager configuration

### Issue: Component not rendering

**Symptoms:** Component doesn't appear on page

**Solutions:**
1. Check component is registered in `src/lib/registry.ts`
2. Verify default export exists
3. Check component typeId matches decorator
4. Verify region ID matches

```tsx
// Check registry
import { registry } from '@/lib/page-designer/registry';
console.log(registry.getComponent('myComponent')); // Should not be null
```

### Issue: Data not loading

**Symptoms:** `data` prop is undefined

**Solutions:**
1. Verify loader is exported correctly
2. Check loader is registered in component registry
3. Ensure componentData is passed to Region
4. Check component ID matches loader key

```tsx
// Debug: Check if loader is called
export const loader = {
    server: async ({ component }) => {
        console.log('Loader called for:', component.id);
        return await fetchData();
    },
};
```

### Issue: TypeScript errors with Region

**Symptoms:** Type error when using Region

**Solutions:**
1. Use discriminated union correctly (page OR component, not both)
2. Ensure page type matches `PageWithComponentData`
3. Component mode doesn't accept `fallbackElement` (synchronous)

```tsx
// ✅ Correct
<Region page={loaderData.page} regionId="main" />
<Region component={component} regionId="main" />

// ❌ Wrong - mixing modes
<Region page={page} component={component} regionId="main" />
```

### Issue: Nested regions not rendering

**Symptoms:** Layout components don't show nested content

**Solutions:**
1. Ensure component mode is used for nested regions
2. Check component object has `regions` array
3. Verify region ID exists in component

```tsx
// Debug: Log component structure
console.log('Component regions:', component?.regions);
console.log('Looking for region:', regionId);
```

### Issue: Performance problems

**Symptoms:** Slow page loads, janky interactions

**Solutions:**
1. Check fallback components are lightweight
2. Ensure loaders use parallel fetching
3. Verify memoization for expensive components
4. Check for unnecessary Promise wrappers

```tsx
// ✅ Parallel loading
const [data1, data2] = await Promise.all([fetch1(), fetch2()]);

// ❌ Sequential loading
const data1 = await fetch1();
const data2 = await fetch2();
```

### Issue: Context not available

**Symptoms:** `useComponentDataById` returns undefined

**Solutions:**
1. Verify ComponentDataProvider is created at page level
2. Check component ID exists in componentData map
3. Ensure you're within Region tree

```tsx
// Debug: Check context availability
const allData = useComponentData();
console.log('Available component data:', allData ? Object.keys(allData) : 'none');
```

---

## Quick Reference

### Component Checklist

- [ ] Default export is the main component
- [ ] Named `fallback` export exists
- [ ] Fallback is lightweight (no heavy logic)
- [ ] Metadata class with `@Component` decorator
- [ ] Props interface includes Page Designer props
- [ ] Loaders exported if data loading needed
- [ ] Component registered in registry
- [ ] Tests cover main functionality
- [ ] Tests cover fallback rendering
- [ ] Documentation updated

### Region Usage Checklist

- [ ] Use **page mode** at route level
- [ ] Use **component mode** for nested regions
- [ ] Don't mix page and component props
- [ ] Non-critical page mode: provide `fallbackElement` when a visible loading state is needed
- [ ] Critical page mode: await the page in the loader and omit the region-local `fallbackElement`
- [ ] Mark only initial-render/LCP regions as `critical`; nested component regions are included automatically
- [ ] Component mode: synchronous, no fallbackElement needed
- [ ] ComponentDataProvider created automatically by page mode

### Performance Checklist

- [ ] Fallback is minimal skeleton
- [ ] Loaders use parallel fetching
- [ ] Components use `memo` when appropriate
- [ ] No unnecessary async wrappers
- [ ] Data loading happens in loaders, not render
- [ ] No duplicate ComponentDataProviders

---

## Additional Resources

- [React Router - Await](https://reactrouter.com/en/main/components/await)
- [React - Suspense](https://react.dev/reference/react/Suspense)
- [React - memo](https://react.dev/reference/react/memo)
- [TypeScript - Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

---

*Last updated: 2026-02-03*
