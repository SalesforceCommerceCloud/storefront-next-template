# State Management

React Router fundamentally changes how you think about client-side state. Its `loader`/`action` pattern handles the most common use case for global state management libraries, such as [Redux](https://redux.js.org), [React Query](https://tanstack.com/query), or [Zustand](https://github.com/pmndrs/zustand): fetching server data and keeping it synchronized after mutations. Since React Router manages this natively, you typically don't need a separate library for such _remote state_.

**What this means in practice:** A server-centric model replaces the classic client-side fetch-on-mount, store-in-state, manually-invalidate cycle:

1. Route enters → `loader()` runs → data flows into component, for example, via the [`useLoaderData()`](https://reactrouter.com/api/hooks/useLoaderData) hook
2. User submits form → `action()` runs → React Router revalidates all loaders automatically

## State Types and Their Native Tools

| State Type                                                             | Description                                 | Native Tool                                          |
|------------------------------------------------------------------------|---------------------------------------------|------------------------------------------------------|
| [Server / Remote State](#server-state-via-loader-and-action)           | Data fetched from a server                  | `loader` + `useLoaderData`                           |
| [Mutations](#mutations-via-action-and-form)                            | Write operations to the server              | `action` + `Form`                                    |
| [Component-Local Mutations](#component-local-mutations-via-usefetcher) | Mutations without navigation                | `useFetcher`                                         |
| [Cross-Route Data](#cross-route-data-via-userouteloaderdata)           | Accessing another route's loader data       | `useRouteLoaderData`                                 |
| [Middleware Context](#middleware-context)                              | Request-scoped data injected before loaders | `context.set` / `context.get`                        |
| [Navigation State](#navigation-state)                                  | Current navigation in progress              | `useNavigation`                                      |
| [URL State](#url-state)                                                | State encoded in the URL                    | `useSearchParams`, `useParams`                       |
| [Persistent State](#persistent-state-via-cookies-and-sessions)         | State persisted across requests via cookies | `createCookie`, `createCookieSessionStorage`         |
| [Optimistic State](#optimistic-state)                                  | Temporary UI before server confirms         | `fetcher.formData`, `useNavigation`, `useOptimistic` |
| [Error State](#error-state)                                            | Loader/action errors per route              | `useRouteError`                                      |
| [React Primitives](#native-react-state-primitives)                     | Native React state management primitives    | `useState`, `useMemo`, Context API, etc.             |

## Server State via loader() and action()

This is the central state management pattern in React Router. It replaces client-side data fetching patterns, such as fetch-on-mount and manual cache invalidation, with a declarative, server-centric model.

- A `loader` runs on the server before the route renders. Its return value becomes the component's data via [`useLoaderData()`](https://reactrouter.com/api/hooks/useLoaderData).
- An `action` handles mutations. After it completes, React Router automatically revalidates all active loaders. React Router manages the data lifecycle entirely.

For [loader](README-DATA.md#loaders), [data classification](README-DATA.md#data-classification) (critical vs. non-critical), streaming patterns, [action processing](README-DATA.md#actions), and [resource routes](README-DATA.md#resource-routes), see [Data Fetching](README-DATA.md).

## Mutations via action() and Form

The `<Form>` component serializes form state into `FormData` and submits it to the route's `action`. After the action completes, React Router revalidates all active loaders automatically. This is the primary mutation pattern when the operation **_should trigger a navigation_** or a full-page state update.

For action arguments, validation patterns, and examples, see [Data Fetching](README-DATA.md#actions).

## Component-Local Mutations via useFetcher()

[`useFetcher`](https://reactrouter.com/api/hooks/useFetcher) triggers loaders and actions **_without causing navigation_**. It gives each component its own mutation lifecycle, making it suitable for inline edits, autosave, toggling, and any mutation that shouldn't change the URL.

From a state management perspective, each fetcher exposes its own lifecycle. `fetcher.state` exposes the mutation lifecycle while `fetcher.data` holds the action's return value. This enables per-component feedback (for example, inline validation errors) without global state.

For fetcher usage patterns and resource routes, see [Data Fetching](README-DATA.md#fetchers). For visual feedback patterns based on `fetcher.state`, see [Loading States](README-SUSPENSE.md#the-usefetcher-hook).

## Cross-Route Data via useRouteLoaderData()

[`useRouteLoaderData`](https://reactrouter.com/api/hooks/useRouteLoaderData) accesses the loader data of any currently active route by its route ID. This avoids prop-drilling when a child route needs data that a parent or sibling route already loaded.

A common use case is accessing root-level data, such as session, locale, or site configuration, from deeply nested routes without passing it through every intermediate layout. The route ID passed to `useRouteLoaderData` must match the route's `id` as defined in the route configuration. The hook returns `undefined` if the target route isn't currently active.

```jsx
// routes/root.tsx
export async function loader() {
  const user = await getUser();
  const locale = await getLocale();
  return { user, locale };
}

// routes/products/product-detail.tsx
import { useRouteLoaderData } from 'react-router';

export default function ProductDetail() {
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  return (
    <p>Welcome, {rootData?.user?.name}</p>
  );
}
```

## Middleware Context

Middleware context is React Router's mechanism for request-scoped dependency injection. Middlewares run in a pipeline _before_ loaders and actions, populating a typed context object with data that all downstream loaders and actions can access. This eliminates the need for loaders to independently resolve cross-cutting concerns such as sessions, app configuration, or API clients.

For middleware definition, pipeline ordering, and writing middleware functions, see [Data Fetching](README-DATA.md#middlewares).

> [!NOTE]
> Middleware context isn't the React Context API. While middleware context carries server-side data, it serves a distinct role from loaders. Middleware context operates in the request lifecycle (before render), is consumed by loaders and actions, and is scoped to a single request. The React [Context API](#shared-ui-state) operates in the render lifecycle and is consumed by components. Data from middleware context typically reaches components via the `loader` return value and `useLoaderData`.

## Navigation State

[`useNavigation`](https://reactrouter.com/api/hooks/useNavigation) exposes the global navigation state, useful for pending UI during route transitions.

```jsx
import { useNavigation } from 'react-router';

function GlobalSpinner() {
  const navigation = useNavigation();
  if (navigation.state === 'idle') {
    return null;
  }
  return <Spinner />;
}
```

`navigation.formData` is available during form submissions, enabling optimistic UI based on the submitted values before the server responds. For loading state patterns in detail, see [Loading States](README-SUSPENSE.md).

## URL State

The URL is a state container. Search parameters, path parameters, and the location object are reactive state sources that survive page refreshes, are shareable via links, and integrate with the browser's history stack.

### useSearchParams()

[`useSearchParams`](https://reactrouter.com/api/hooks/useSearchParams) reads and writes URL query parameters. It replaces `useState` for state that should be reflected in the URL, such as filters, pagination, sort order, or modal visibility.

**When to use `useSearchParams` over `useState`:** If the state should survive a page refresh, be shareable via URL, or be accessible to loaders (via `request.url`), it belongs in search params.

```jsx
import { useSearchParams } from 'react-router';

function ProductFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') ?? 'all';

  return (
    <select
      value={category}
      onChange={e => setSearchParams({ category: e.target.value })}>
      <option value="all">All</option>
      <option value="shoes">Shoes</option>
      <option value="bags">Bags</option>
    </select>
  );
}
```

### useParams()

[`useParams`](https://reactrouter.com/api/hooks/useParams) returns the dynamic path parameters for the current route. It's read-only and reactive, the component re-renders when the route changes.

```jsx
import { useParams } from 'react-router';

function ProductDetail() {
  const { productId } = useParams();
  // productId is derived from the URL, e.g., /products/:productId
}
```

## Persistent State via Cookies and Sessions

Sometimes, state must survive page refreshes and revisits without belonging to the URL. Examples include user preferences (theme, locale, dismissed banners), shopping cart identifiers, and authentication tokens. Cookies and server sessions are React Router's native mechanism for this kind of persistent state.

Unlike `useState` (transient) or `useSearchParams` (URL-visible), cookies travel with every HTTP request and are available in loaders and actions on the server. This behavior makes cookies a single source of truth that requires no client-side synchronization, avoids `localStorage` SSR issues, and works even before scripts load.

React Router provides [`createCookie`](https://reactrouter.com/explanation/sessions-and-cookies#cookies) for simple key-value cookies and [`createCookieSessionStorage`](https://reactrouter.com/explanation/sessions-and-cookies#sessions) for structured, typed session data. Both integrate directly with the `loader`/`action` lifecycle: cookies are read via `request.headers.get('Cookie')` and written via `Set-Cookie` response headers.

### When to Use Cookies vs. Sessions vs. URL State

| Criterion                   | Cookies (`createCookie`)  | Sessions (`createCookieSessionStorage`) | URL (`useSearchParams`)   |
|-----------------------------|---------------------------|-----------------------------------------|---------------------------|
| Survives page refresh       | Yes                       | Yes                                     | Yes                       |
| Shareable via link          | No                        | No                                      | Yes                       |
| Available in loaders        | Yes                       | Yes                                     | Yes (via `request.url`)   |
| Works without JS            | Yes                       | Yes                                     | Only with `<Form>`        |
| Structured / typed data     | Manual parsing            | Built-in typed API                      | String key-value pairs    |
| Security (httpOnly, signed) | Yes                       | Yes (with secrets)                      | No (user-visible)         |
| Best for                    | Simple preferences, flags | Auth, multi-field user state            | Filters, pagination, sort |

For details on cookies and sessions APIs, see [Data Fetching](README-DATA.md#cookies-and-sessions).

## Optimistic State

Optimistic UI updates the interface immediately, before the server confirms the mutation, and rolls back if the operation fails. React Router and React offer complementary approaches, each suited to a different kind of state.

### Via fetcher.formData (React Router)

`useFetcher` exposes the submitted `formData` while an action is in flight. This enables optimistic reads directly from the pending submission without additional state management. This pattern requires no extra hooks and works with any version of React. It's the idiomatic React Router approach for simple optimistic updates derived from the submitted form values.

```jsx
const fetcher = useFetcher();

const isComplete = fetcher.formData
  ? fetcher.formData.get("complete") === "true"
  : item.complete;

return (
  <fetcher.Form method="post" action="/api/toggle">
    <input type="hidden" name="complete" value={String(!item.complete)} />
    <button type="submit">
      {isComplete ? "✓ Complete" : "Mark complete"}
    </button>
  </fetcher.Form>
);
```

### Via useNavigation() (React Router / URL-Driven State)

When state is serialized into URL search parameters and updates trigger a `navigate()` call, `useNavigation()` provides a navigation-aware optimistic path. While a navigation is pending, `navigation.location` holds the target `Location` object. Reading the intended query parameters from that target reflects the user's action immediately, without any local state to manage.

```jsx
import { useNavigation } from 'react-router';

function Filters({ items }: { items: string[] }) {
  const navigation = useNavigation();

  // While a navigation is pending, read from the target URL.
  // Once it settles, fall back to the server-provided props.
  const effectiveItems = navigation.location
    ? new URLSearchParams(navigation.location.search).getAll('item')
    : items;

  return (
    <ul>
      {effectiveItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
```

This works because `navigation.location` is only defined while a navigation is in flight. It holds the destination URL, so the component can derive the optimistic state from the search params the router is navigating to. When the navigation completes, `navigation.location` becomes `undefined` in the same render cycle that delivers the fresh loader props. The ternary falls through to the new server data automatically.

Key properties of this pattern:

- **No local state** — nothing to sync, reset, or reconcile.
- **Survives the pending phase** — the optimistic value is read from the URL the router is navigating to, so it persists for the entire loader fetch.
- **Self-cleaning** — once the navigation settles, the component naturally falls back to the new props.

> [!NOTE]
> `useNavigation()` reflects _any_ in-flight navigation, not just the one the current component triggered. In practice this is acceptable: if a different navigation starts, the entire page is about to change anyway. For mutations that don't change the URL, prefer `fetcher.formData` or `useOptimistic` instead.

### Via useOptimistic() (React)

[`useOptimistic`](https://react.dev/reference/react/useOptimistic) applies a temporary state update that React automatically reverts once the underlying async operation settles. It's suited for more complex optimistic transformations where the optimistic state isn't a direct read from `formData` or the URL, for example, inserting a new item into a list.

```jsx
import { useOptimistic } from 'react';

function ProductList({ products }: { products: Product[] }) {
  const [optimisticProducts, addOptimistic] = useOptimistic(
    products,
    (state, newProduct: Product) => [...state, newProduct]
  );

  async function handleAdd(formData: FormData) {
    const name = formData.get('name') as string;
    addOptimistic({ id: 'temp', name }); // Immediate UI update
    await createProduct(name);           // Actual server call
  }

  return (
    <>
      <form action={handleAdd}>
        <input name="name" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {optimisticProducts.map(p => (
          <li key={p.id} style={{ opacity: p.id === 'temp' ? 0.5 : 1 }}>
            {p.name}
          </li>
        ))}
      </ul>
    </>
  );
}
```

## Error State

React Router treats errors from loaders and actions as a first-class route state. When a loader or action throws an error, React Router catches the error and renders the nearest [`ErrorBoundary`](https://reactrouter.com/start/framework/route-module#errorboundary) export in the route hierarchy.

[`useRouteError`](https://reactrouter.com/api/hooks/useRouteError) accesses the thrown error inside an `ErrorBoundary`. [`isRouteErrorResponse`](https://reactrouter.com/api/utils/isRouteErrorResponse) distinguishes between Response-based errors (thrown via `throw new Response(...)` or [`data()`](https://reactrouter.com/api/utils/data) with a non-2xx status in a loader/action) and unexpected exceptions. This enables differentiated error UIs, for example, a styled 404 page vs. a generic error fallback.

```jsx
// routes/products.tsx
import { useRouteError, isRouteErrorResponse } from 'react-router';

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div>
        <h1>{error.status}</h1>
        <p>{error.statusText}</p>
      </div>
    );
  }

  return <div>An unexpected error occurred.</div>;
}
```

## Native React State Primitives

The sections above cover state that React Router manages as part of the routing and data lifecycle. What remains to complete the picture, is state that lives entirely on the client, managed by React's own primitives. These are the built-in hooks and patterns for local component state, derived values, cross-component sharing, and integration with external stores.

### Local UI State

#### useState()

The baseline primitive for synchronous, isolated state within a single component. Use the [`useState`](https://react.dev/reference/react/useState) hook when exactly one component owns the state and you don't need to share it.

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

#### useReducer()

The [`useReducer`](https://react.dev/reference/react/useReducer) hook is preferable over `useState` when state transitions are complex, interdependent, or benefit from explicit action semantics.

```jsx
type State = { count: number; step: number };
type Action = { type: 'increment' } | { type: 'setStep'; payload: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'increment': return { ...state, count: state.count + state.step };
    case 'setStep':   return { ...state, step: action.payload };
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, { count: 0, step: 1 });
  return (
    <>
      <p>Count: {state.count}</p>
      <button onClick={() => dispatch({ type: 'increment' })}>+</button>
      <input
        type="number"
        value={state.step}
        onChange={e => dispatch({ type: 'setStep', payload: Number(e.target.value) })}
      />
    </>
  );
}
```

### Derived Local UI State

Derived state is any value you compute from existing state or props rather than store independently. It's a pure function of other state and has no source of truth of its own.

**Key rule:** Don't store derived values in `useState`. This creates a secondary source of truth and forces manual synchronization, which is a common source of bugs.

```jsx
// Bad: redundant state, sync required
const [fullName, setFullName] = useState(`${firstName} ${lastName}`);

// Good: computed inline, always in sync
const fullName = `${firstName} ${lastName}`;
```

#### useMemo()

[`useMemo`](https://react.dev/reference/react/useMemo) caches the result of an expensive computation and only recalculates it when one of its dependencies changes, preventing unnecessary recalculation on every render. Use this for expensive transformations, such as sorting, filtering, and aggregating, over arrays or objects.

**When to use `useMemo`:** For cheap computations, a plain variable in the render body is sufficient. Reserve `useMemo` for expensive computations or when referential stability is required (for example, as a dependency in `useEffect` or `memo`).

```jsx
// Plain variable: fine for cheap ops
const fullName = `${firstName} ${lastName}`;

// useMemo: justified for expensive ops or stable references
const filteredItems = useMemo(
  () => largeList.filter(item => item.active),
  [largeList]
);
```

#### useCallback()

[`useCallback`](https://react.dev/reference/react/useCallback) memoizes a function reference. Without it, every render creates a new function instance, which breaks referential equality checks in child components wrapped with [`memo`](https://react.dev/reference/react/memo).

```jsx
const handleDelete = useCallback((id: string) => {
  setProducts(prev => prev.filter(p => p.id !== id));
}, []); // stable reference — no unnecessary re-renders in React.memo children
```

**When `useCallback` isn't needed:** If `memo` doesn't wrap the receiving component, `useCallback` has no observable effect and only adds noise. Apply it specifically when passing callbacks to memoized components or as dependencies of other hooks (`useEffect`, `useMemo`) where referential stability matters.

### Shared UI State

[Context](https://react.dev/learn/passing-data-deeply-with-context) propagates state through the React tree without prop drilling. It's appropriate for state that changes infrequently and must be accessible across many components.

> [!NOTE]
> For request-scoped data that loaders and actions need (session, auth, config), see [Middleware Context](#middleware-context). The React Context API is for UI state shared across the component tree during rendering.

**Good use cases:** locale, user preferences, feature flags.

**Poor use cases:** high-frequency updates (for example, mouse position, real-time data), large state objects where many consumers only need a small slice.

#### Basic Setup

```jsx
// preferences-context.tsx
type PreferencesState = { density: 'compact' | 'comfortable'; setDensity: (d: 'compact' | 'comfortable') => void };
const PreferencesContext = createContext<PreferencesState | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable');

  return (
    <PreferencesContext.Provider value={{ density, setDensity }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return ctx;
}
```

> [!NOTE]
> Every context value change re-renders all its consumers, regardless of whether they use the changed part of the value. Mitigate this by splitting contexts. A component using, for example, only `PreferencesContext` will not re-render when `user` changes.

```jsx
// Instead of one large context:
<AppContext.Provider value={{ user, preferences, locale }} />

// Split into focused contexts:
<UserContext.Provider value={user} />
<PreferencesContext.Provider value={preferences} />
<LocaleContext.Provider value={locale} />
```

### Context Selector Pattern

When a context holds multiple values but a consumer only needs one slice, splitting contexts isn't always practical. Domain stores often have many fields and many consumers each needing different slices. The selector pattern addresses this demand by accepting a selector function and returning only the selected slice. Combined with [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore), subscriptions are per-slice: a consumer re-renders only when its slice changes.

The context holds a reference to an external store, not the state itself. The hook drives the subscription via `useSyncExternalStore`:

```jsx
const StoreLocatorContext = createContext<StoreApi<StoreLocatorState> | null>(null);

export function useStoreLocator<T>(selector: (state: StoreLocatorState) => T): T {
  const store = useContext(StoreLocatorContext);
  if (!store) {
    throw new Error('useStoreLocator must be used within StoreLocatorProvider');
  }
  const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
```

Consumers call the hook once per slice. The badge re-renders only when `isOpen` flips; the form re-renders only when `config` changes:

```jsx
function StoreLocatorBadge() {
  const isOpen = useStoreLocator((s) => s.isOpen);
  const close = useStoreLocator((s) => s.close);
  // ...
}

function StoreLocatorForm() {
  const config = useStoreLocator((s) => s.config);
  // ...
}
```

> [!NOTE]
> React's `useContext` doesn't support selectors natively — every consumer re-renders on any context value change. A selector hook that only wraps `useContext` is a convention and doesn't, by itself, skip renders. Actual render memoization requires either `useSyncExternalStore` (as shown earlier, which is tearing-safe and concurrent-mode correct), or `React.memo` on the consuming component, combined with a referentially stable selector result. For high-frequency updates on large domain stores, prefer the `useSyncExternalStore` approach.

### Global Client State via useSyncExternalStore()

[`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) integrates state that lives **outside the React tree**—vanilla JavaScript objects, browser APIs, or custom event emitters. It is concurrent-mode safe and does not require a Provider.

#### Building a Minimal Store

```typescript
// store.ts
type Listener = () => void;

function createStore<T>(initialState: T) {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    getSnapshot: () => state,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState: (updater: (prev: T) => T) => {
      state = updater(state);
      listeners.forEach(fn => fn());
    },
  };
}

export const cartStore = createStore({ items: [] as CartItem[] });
```

```typescript
// useCart.ts
import { useSyncExternalStore } from 'react';
import { cartStore } from './store';

export function useCart() {
  const state = useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getSnapshot,
  );

  return {
    items: state.items,
    addItem: (item: CartItem) =>
      cartStore.setState(s => ({ items: [...s.items, item] })),
  };
}
```

Every component calling `useCart()` subscribes automatically. No Provider, no wrapping component required.

#### Wrapping Browser APIs

The same pattern makes any browser API reactive:

```typescript
// useOnlineStatus.ts
const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

export const useOnlineStatus = () =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true // server snapshot (SSR)
  );
```

The same pattern applies to `matchMedia`, `localStorage`, `BroadcastChannel`, `visibilitychange`, and similar APIs.

#### Critical: getSnapshot Stability

`getSnapshot` must return a **referentially stable value** when state hasn't changed. Returning a new object on every call causes an infinite render loop.

```typescript
// WRONG — new object reference on every call
getSnapshot: () => ({ ...state })

// CORRECT — same reference when state is unchanged
getSnapshot: () => state
```

If you need derived/selected state, cache the result inside the store or use `useRef` for memoization.

#### Comparison: useSyncExternalStore() vs. Context API

| Criterion             | `useSyncExternalStore`         | Context API                             |
|-----------------------|--------------------------------|-----------------------------------------|
| State location        | Outside React (module scope)   | Inside React tree                       |
| Re-render granularity | Only subscribed components     | All consumers of the context            |
| Provider required     | No                             | Yes                                     |
| Concurrent Mode safe  | Yes (tearing-safe by design)   | Partially                               |
| Best for              | High-frequency or global state | Infrequently changing, tree-local state |

### Additional State Primitives

#### use(Promise)

Reads a Promise directly inside a component and integrates with `Suspense`. Eliminates the need for `useEffect`-based data fetching and loading state management. For declarative loading patterns with `use()` and `Suspense`, see [Loading States](README-SUSPENSE.md#the-use-and-suspense-pattern).

```jsx
import { use, Suspense } from 'react';

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise); // Suspends until resolved
  return <p>{user.name}</p>;
}

function App() {
  const userPromise = fetchUser(userId);
  return (
    <Suspense fallback={<Skeleton />}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  );
}
```

#### useTransition() and useDeferredValue()

`useTransition` marks state updates as non-urgent, keeping the UI responsive during heavy re-renders.

```jsx
const [isPending, startTransition] = useTransition();

function handleSearch(query: string) {
  startTransition(() => {
    setSearchResults(computeResults(query)); // Non-blocking update
  });
}
```

`useDeferredValue` defers the propagation of a rapidly changing value, similar to debouncing but integrated with React's concurrent scheduler.

```jsx
const deferredQuery = useDeferredValue(searchQuery);
// deferredQuery lags behind searchQuery during rapid input
const results = useMemo(() => search(deferredQuery), [deferredQuery]);
```

#### useActionState()

[`useActionState`](https://react.dev/reference/react/useActionState) manages the full lifecycle of an async action: pending status, return value, and error state. It replaces manual `useState` and `useTransition` wiring around actions. Listed here for completeness as a React primitive.

> [!NOTE]
> In the React Router framework, `useActionState` has no practical relevance. Route `action` + `Form` and `useFetcher` provide the same pending/error lifecycle and additionally trigger automatic loader revalidation after mutations. `useActionState` bypasses React Router's data lifecycle entirely, loaders aren't revalidated after a `useActionState` action completes. Even for purely client-side logic, a `clientAction` with `useFetcher` is preferable because it keeps the component within React Router's consistent data flow and avoids introducing a parallel mutation pattern.

### Basket quantity controls

`useBasketItemState` selects quantity and hydration state by SKU and fulfillment choice from a per-provider, read-only publication of the basket. Unrelated quantities and snapshot totals preserve the selected value's identity. The existing basket provider still owns loading, cookie reconciliation, and updates.

`useItemMutation` registers one native fetcher runtime with the basket publication provider while controls own active lines. The runtime and SKU selector live in the lazy control graph; the initial shell only publishes committed state. Native fetcher keys include basket identity, and one runtime monitors pending state. `useItemMutation` subscribes to one item's response and pending status. Duplicate controls share a handle; basket-id changes discard old handles and results. This avoids subscribing every quantity control to Router's full fetcher state.
