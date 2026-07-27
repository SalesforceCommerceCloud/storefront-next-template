# withSuspense HOC

A higher-order component that wraps components with Suspense boundaries for granular streaming in server-side rendering.

## Overview

The `withSuspense` HOC provides granular Suspense boundaries for individual components, enabling independent loading states and better user experience through progressive rendering.

## Quick Start

### Basic Usage

```tsx
import { use } from 'react';
import { withSuspense } from '@/components/with-suspense';

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <div>{user.name}</div>;
}

// Create a component with its own Suspense boundary
const UserProfileWithSuspense = withSuspense(UserProfile, {
  fallback: <div>Loading user...</div>
});

// Use it in your page
function MyPage() {
  return (
    <div>
      <UserProfileWithSuspense userPromise={userPromise} />
    </div>
  );
}
```

### Multiple Independent Components

```tsx
import { use } from 'react';
import { withSuspense } from '@/components/with-suspense';

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <div>{user.name}</div>;
}

function ProductList({ productsPromise }: { productsPromise: Promise<Product[]> }) {
  const products = use(productsPromise);
  return <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>;
}

function OrderSummary({ orderPromise }: { orderPromise: Promise<Order> }) {
  const order = use(orderPromise);
  return <div>Total: ${order.total}</div>;
}

// Create HOCs with individual Suspense boundaries
const UserProfileWithSuspense = withSuspense(UserProfile, {
  fallback: <div className="skeleton">Loading user...</div>
});

const ProductListWithSuspense = withSuspense(ProductList, {
  fallback: <div className="skeleton">Loading products...</div>
});

const OrderSummaryWithSuspense = withSuspense(OrderSummary, {
  fallback: <div className="skeleton">Loading order...</div>
});

// Use them independently for granular streaming
function MyPage() {
  return (
    <div>
      <UserProfileWithSuspense userPromise={userPromise} />
      <ProductListWithSuspense productsPromise={productsPromise} />
      <OrderSummaryWithSuspense orderPromise={orderPromise} />
    </div>
  );
}
```

## API Reference

### `withSuspense<TProps>(Component, config)`

Creates a higher-order component that wraps a component with Suspense boundary.

**Parameters:**
- `Component`: The component to wrap with Suspense
- `config.fallback`: Fallback component to show while loading (default: `<div>Loading...</div>`)

**Returns:** A higher-order component that wraps the provided component with Suspense

**Generic Types:**
- `TProps`: TypeScript type for the component props (must extend `Record<string, any>`)

## Use Cases

### 1. Granular Streaming Components

When you want different parts of a page to load independently:

```tsx
const HeaderWithSuspense = withSuspense(Header, {
  fallback: <HeaderSkeleton />
});

const ContentWithSuspense = withSuspense(Content, {
  fallback: <ContentSkeleton />
});

const SidebarWithSuspense = withSuspense(Sidebar, {
  fallback: <SidebarSkeleton />
});

function Page() {
  return (
    <div>
      <HeaderWithSuspense />
      <div className="flex">
        <SidebarWithSuspense />
        <ContentWithSuspense />
      </div>
    </div>
  );
}
```

### 2. Reusable Components with Loading States

For components that need their own loading states:

```tsx
const ProductCardWithSuspense = withSuspense(ProductCard, {
  fallback: <ProductCardSkeleton />
});

function ProductGrid({ products }: { products: Promise<Product[]>[] }) {
  return (
    <div className="grid">
      {products.map((productPromise, index) => (
        <ProductCardWithSuspense 
          key={index} 
          productPromise={productPromise} 
        />
      ))}
    </div>
  );
}
```

### 3. Conditional Loading Components

For components that may or may not need to load data:

```tsx
function OptionalContent({ 
  dataPromise, 
  shouldLoad 
}: { 
  dataPromise?: Promise<Data>; 
  shouldLoad: boolean 
}) {
  if (!shouldLoad || !dataPromise) return null;
  
  const data = use(dataPromise);
  return <div>{data.content}</div>;
}

const OptionalContentWithSuspense = withSuspense(OptionalContent, {
  fallback: <div>Loading optional content...</div>
});
```

## Best Practices

### 1. Meaningful Fallbacks

Use skeleton components that match the expected content structure:

```tsx
// ✅ Good: Skeleton matches content structure
const UserProfileWithSuspense = withSuspense(UserProfile, {
  fallback: (
    <div className="p-4 border rounded-lg animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
    </div>
  )
});

// ❌ Avoid: Generic loading message
const UserProfileWithSuspense = withSuspense(UserProfile, {
  fallback: <div>Loading...</div>
});
```

### 2. Consistent Loading States

Use consistent fallback patterns across similar components:

```tsx
const cardFallback = (
  <div className="p-4 border rounded-lg animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
  </div>
);

const UserCardWithSuspense = withSuspense(UserCard, { fallback: cardFallback });
const ProductCardWithSuspense = withSuspense(ProductCard, { fallback: cardFallback });
```

### 3. Type Safety

Always define proper TypeScript types for your components:

```tsx
interface UserProfileProps {
  userPromise: Promise<{ name: string; email: string }>;
}

function UserProfile({ userPromise }: UserProfileProps) {
  const user = use(userPromise);
  return <div>{user.name}</div>;
}

const UserProfileWithSuspense = withSuspense<UserProfileProps>(UserProfile, {
  fallback: <UserProfileSkeleton />
});
```

### 4. Performance Considerations

- Use `withSuspense` for components that truly need independent loading
- Avoid over-wrapping components that don't benefit from separate Suspense boundaries
- Consider the user experience when components load at different times

## Examples

### E-commerce Product Page

```tsx
import { use } from 'react';
import { withSuspense } from '@/components/with-suspense';

function ProductHeader({ productPromise }: { productPromise: Promise<Product> }) {
  const product = use(productPromise);
  return (
    <div>
      <h1>{product.name}</h1>
      <p className="text-2xl font-bold">${product.price}</p>
    </div>
  );
}

function ProductImages({ imagesPromise }: { imagesPromise: Promise<Image[]> }) {
  const images = use(imagesPromise);
  return (
    <div className="grid grid-cols-2 gap-4">
      {images.map(image => (
        <img key={image.id} src={image.url} alt={image.alt} />
      ))}
    </div>
  );
}

function ProductReviews({ reviewsPromise }: { reviewsPromise: Promise<Review[]> }) {
  const reviews = use(reviewsPromise);
  return (
    <div>
      <h3>Reviews ({reviews.length})</h3>
      {reviews.map(review => (
        <div key={review.id}>{review.text}</div>
      ))}
    </div>
  );
}

// Create HOCs with individual Suspense boundaries
const ProductHeaderWithSuspense = withSuspense(ProductHeader, {
  fallback: <div className="h-16 bg-gray-200 animate-pulse rounded"></div>
});

const ProductImagesWithSuspense = withSuspense(ProductImages, {
  fallback: <div className="h-64 bg-gray-200 animate-pulse rounded"></div>
});

const ProductReviewsWithSuspense = withSuspense(ProductReviews, {
  fallback: <div className="h-32 bg-gray-200 animate-pulse rounded"></div>
});

// Use them in the product page
function ProductPage() {
  const { product, images, reviews } = useLoaderData();
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <ProductHeaderWithSuspense productPromise={product} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <ProductImagesWithSuspense imagesPromise={images} />
        <ProductReviewsWithSuspense reviewsPromise={reviews} />
      </div>
    </div>
  );
}
```

### Dashboard with Multiple Data Sources

```tsx
import { use } from 'react';
import { withSuspense } from '@/components/with-suspense';

function UserStats({ statsPromise }: { statsPromise: Promise<UserStats> }) {
  const stats = use(statsPromise);
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="p-4 bg-blue-50 rounded">
        <h3>Total Orders</h3>
        <p className="text-2xl font-bold">{stats.totalOrders}</p>
      </div>
      <div className="p-4 bg-green-50 rounded">
        <h3>Total Spent</h3>
        <p className="text-2xl font-bold">${stats.totalSpent}</p>
      </div>
      <div className="p-4 bg-purple-50 rounded">
        <h3>Favorite Category</h3>
        <p className="text-2xl font-bold">{stats.favoriteCategory}</p>
      </div>
    </div>
  );
}

function RecentOrders({ ordersPromise }: { ordersPromise: Promise<Order[]> }) {
  const orders = use(ordersPromise);
  return (
    <div>
      <h3>Recent Orders</h3>
      <ul className="space-y-2">
        {orders.map(order => (
          <li key={order.id} className="p-2 border rounded">
            Order #{order.id} - ${order.total}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Recommendations({ recommendationsPromise }: { recommendationsPromise: Promise<Product[]> }) {
  const recommendations = use(recommendationsPromise);
  return (
    <div>
      <h3>Recommended for You</h3>
      <div className="grid grid-cols-2 gap-4">
        {recommendations.map(product => (
          <div key={product.id} className="p-2 border rounded">
            {product.name}
          </div>
        ))}
      </div>
    </div>
  );
}

// Create HOCs
const UserStatsWithSuspense = withSuspense(UserStats, {
  fallback: <div className="grid grid-cols-3 gap-4"><div className="h-20 bg-gray-200 animate-pulse rounded"></div><div className="h-20 bg-gray-200 animate-pulse rounded"></div><div className="h-20 bg-gray-200 animate-pulse rounded"></div></div>
});

const RecentOrdersWithSuspense = withSuspense(RecentOrders, {
  fallback: <div className="h-32 bg-gray-200 animate-pulse rounded"></div>
});

const Recommendations = withSuspense(Recommendations, {
  fallback: <div className="h-40 bg-gray-200 animate-pulse rounded"></div>
});

// Dashboard page
function Dashboard() {
  const { stats, orders, recommendations } = useLoaderData();
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      <UserStatsWithSuspense statsPromise={stats} />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <RecentOrdersWithSuspense ordersPromise={orders} />
        <Recommendations recommendationsPromise={recommendations} />
      </div>
    </div>
  );
}
```

## Benefits

1. **Granular Streaming** - Individual components can load independently
2. **Better UX** - Users see content as it becomes available
3. **Reusability** - Components can be reused with their own loading states
4. **Type Safety** - Full TypeScript support
5. **Performance** - Only necessary components re-render when their data loads
6. **Flexibility** - Mix and match components with different loading patterns
