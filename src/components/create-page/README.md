# createPage HOC

A higher-order component that creates complete page components with Suspense patterns and page key handling for React Router.

## Overview

The `createPage` HOC provides a complete page factory that handles common patterns for route components, including Suspense boundaries, page key management, and loader data integration.

## Quick Start

### Basic Usage

```tsx
import { use } from 'react';
import { createPage } from '@/components/create-page';

function MyView({ message, dataPromise }: { message: string; dataPromise: Promise<MyData> }) {
  const data = use(dataPromise);
  return <div>{data.message}</div>;
}

const MyPage = createPage({
  component: MyView,
  fallback: <div>Loading...</div>
});

export default MyPage;
```

### Page with Page Key

```tsx
import { use } from 'react';
import { createPage } from '@/components/create-page';

function CategoryView({ 
  category, 
  searchResult 
}: { 
  category: Promise<Category>; 
  searchResult: Promise<ProductSearchResult> 
}) {
  const categoryData = use(category);
  const searchResultData = use(searchResult);
  
  return (
    <div>
      <h1>{categoryData.name} ({searchResultData.total} products)</h1>
      {/* Category content */}
    </div>
  );
}

const CategoryPage = createPage({
  component: CategoryView,
  fallback: <CategorySkeleton />,
  getPageKey: (data) => data.categoryId
});

export default CategoryPage;
```

## API Reference

### `createPage<TLoaderData>(config)`

Creates a complete page component with Suspense and page key handling.

**Parameters:**
- `component`: The component to render when data is loaded (receives loader data as props)
- `fallback`: Fallback component to show while loading (default: `<div>Loading...</div>`)
- `getPageKey`: Optional function to get page key for navigation (automatically wraps in Fragment when provided)

**Returns:** A page component that handles Suspense and page key logic

**Generic Types:**
- `TLoaderData`: TypeScript type for the loader data (inferred from your loader's return type)

## Use Cases

### 1. Complete Page Components

For full page components that need standard patterns:

```tsx
function ProductView({ 
  product, 
  category 
}: { 
  product: Promise<Product>; 
  category?: Promise<Category> 
}) {
  const productData = use(product);
  const categoryData = category ? use(category) : null;
  
  return (
    <div>
      <h1>{productData.name}</h1>
      {categoryData && <p>Category: {categoryData.name}</p>}
      {/* Product content */}
    </div>
  );
}

const ProductPage = createPage({
  component: ProductView,
  fallback: <ProductSkeleton />
});

export default ProductPage;
```

### 2. Pages with Page Key Management

For pages that need navigation transitions:

```tsx
function SearchView({ 
  searchTerm, 
  searchResult 
}: { 
  searchTerm: string; 
  searchResult: Promise<ProductSearchResult> 
}) {
  const searchResultData = use(searchResult);
  
  return (
    <div>
      <h1>Search results for "{searchTerm}"</h1>
      <p>Found {searchResultData.total} results</p>
      {/* Search results */}
    </div>
  );
}

const SearchPage = createPage({
  component: SearchView,
  fallback: <SearchSkeleton />,
  getPageKey: (data) => `search-${data.searchTerm}`
});

export default SearchPage;
```

### 3. Commerce Pages

For e-commerce pages with complex data requirements:

```tsx
function CategoryView({ 
  category, 
  searchResult, 
  refinements 
}: { 
  category: Promise<Category>; 
  searchResult: Promise<ProductSearchResult>; 
  refinements: Promise<Refinement[]> 
}) {
  const categoryData = use(category);
  const searchResultData = use(searchResult);
  const refinementsData = use(refinements);
  
  return (
    <div>
      <h1>{categoryData.name} ({searchResultData.total})</h1>
      <div className="flex">
        <RefinementsPanel refinements={refinementsData} />
        <ProductGrid products={searchResultData.hits} />
      </div>
    </div>
  );
}

const CategoryPage = createPage({
  component: CategoryView,
  fallback: <CategorySkeleton />
});

export default CategoryPage;
```

## Migration Guide

### Before (Manual Suspense + Await)

```tsx
export default function Category() {
  const { category: categoryPromise, searchResult: searchResultPromise } = useLoaderData();
  const location = useLocation();
  const pageKey = `${location.pathname}?${location.search}`;

  return (
    <Fragment key={pageKey}>
      <Suspense fallback={<CategorySkeleton />}>
        <Await resolve={Promise.all([categoryPromise, searchResultPromise])}>
          {([category, searchResult]) => (
            <div>
              {/* Category content */}
            </div>
          )}
        </Await>
      </Suspense>
    </Fragment>
  );
}
```

### After (createPage)

```tsx
function CategoryView({ category, searchResult }: { category: Promise<Category>; searchResult: Promise<ProductSearchResult> }) {
  const categoryData = use(category);
  const searchResultData = use(searchResult);
  return (
    <div>
      {/* Category content */}
    </div>
  );
}

export default createPage({
  component: CategoryView,
  fallback: <CategorySkeleton />
});
```

## Best Practices

### 1. Extract View Components

Separate data handling from presentation logic:

```tsx
// ✅ Good: Separate view component
function ProductView({ product, reviews }: { product: Promise<Product>; reviews: Promise<Review[]> }) {
  const productData = use(product);
  const reviewsData = use(reviews);
  
  return (
    <div>
      <ProductHeader product={productData} />
      <ProductImages images={productData.images} />
      <ProductReviews reviews={reviewsData} />
    </div>
  );
}

const ProductPage = createPage({
  component: ProductView,
  fallback: <ProductSkeleton />
});

// ❌ Avoid: Inline component definition
const ProductPage = createPage({
  component: ({ product, reviews }) => {
    const productData = use(product);
    const reviewsData = use(reviews);
    return <div>...</div>;
  },
  fallback: <ProductSkeleton />
});
```

### 2. Consistent Error Handling

Use consistent fallback components:

```tsx
// Define reusable fallback components
const PageSkeleton = () => <div className="animate-pulse">Loading page...</div>;
const ProductSkeleton = () => <div className="animate-pulse">Loading product...</div>;
const CategorySkeleton = () => <div className="animate-pulse">Loading category...</div>;

// Use them consistently
const ProductPage = createPage({
  component: ProductView,
  fallback: <ProductSkeleton />
});

const CategoryPage = createPage({
  component: CategoryView,
  fallback: <CategorySkeleton />
});
```

### 3. Page Key Generation

Generate page keys in loader functions for better performance:

```tsx
// ✅ Good: Generate page key in loader
async function loader({ request, params }) {
  const url = new URL(request.url);
  const pageKey = url.pathname + '?' + url.search;
  
  return {
    category: fetchCategory(params.categoryId),
    searchResult: fetchSearchResults(params.categoryId),
    pageKey
  };
}

const CategoryPage = createPage({
  component: CategoryView,
  fallback: <CategorySkeleton />,
  getPageKey: (data) => data.pageKey
});

// ❌ Avoid: Generating page key in component
const CategoryPage = createPage({
  component: CategoryView,
  fallback: <CategorySkeleton />
  // No getPageKey - will use location.pathname + location.search
});
```

### 4. Type Safety

Always define proper TypeScript types:

```tsx
interface CategoryPageData {
  category: Promise<Category>;
  searchResult: Promise<ProductSearchResult>;
  pageKey: string;
}

function CategoryView({ category, searchResult }: CategoryPageData) {
  const categoryData = use(category);
  const searchResultData = use(searchResult);
  return <div>...</div>;
}

const CategoryPage = createPage<CategoryPageData>({
  component: CategoryView,
  fallback: <CategorySkeleton />,
  getPageKey: (data) => data.pageKey
});
```

## Examples

### Basic Page with Promises

```tsx
import { use } from 'react';
import { createPage } from '@/components/create-page';

function BasicPageView({ 
  user, 
  posts 
}: { 
  user: Promise<{ id: string; name: string }>; 
  posts: Promise<Array<{ id: string; title: string }>> 
}) {
  const userData = use(user);
  const postsData = use(posts);
  
  return (
    <div>
      <h1>Welcome, {userData.name}!</h1>
      <ul>
        {postsData.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}

const BasicPage = createPage({
  component: BasicPageView,
  fallback: <div>Loading user data...</div>
});

export default BasicPage;
```

### E-commerce Category Page

```tsx
import { use } from 'react';
import { createPage } from '@/components/create-page';

function CategoryView({ 
  category, 
  searchResult 
}: { 
  category: Promise<Category>; 
  searchResult: Promise<ProductSearchResult> 
}) {
  const categoryData = use(category);
  const searchResultData = use(searchResult);
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">
        {categoryData.name} ({searchResultData.total} products)
      </h1>
      
      <div className="flex gap-8">
        <div className="w-64">
          <CategoryRefinements result={searchResultData} />
        </div>
        
        <div className="flex-1">
          <ProductGrid products={searchResultData.hits} />
          <CategoryPagination result={searchResultData} />
        </div>
      </div>
    </div>
  );
}

const CategoryPage = createPage({
  component: CategoryView,
  fallback: <CategorySkeleton />
});

export default CategoryPage;
```

### Product Page with Optional Data

```tsx
import { use } from 'react';
import { createPage } from '@/components/create-page';

function ProductView({ 
  product, 
  category,
  reviews 
}: { 
  product: Promise<Product>; 
  category?: Promise<Category>; 
  reviews?: Promise<Review[]> 
}) {
  const productData = use(product);
  const categoryData = category ? use(category) : null;
  const reviewsData = reviews ? use(reviews) : null;
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ProductImages images={productData.images} />
        
        <div>
          <h1 className="text-3xl font-bold mb-4">{productData.name}</h1>
          <p className="text-2xl font-semibold mb-4">${productData.price}</p>
          
          {categoryData && (
            <p className="text-sm text-gray-600 mb-4">
              Category: {categoryData.name}
            </p>
          )}
          
          <ProductDescription description={productData.description} />
          <AddToCartButton product={productData} />
        </div>
      </div>
      
      {reviewsData && (
        <div className="mt-12">
          <ProductReviews reviews={reviewsData} />
        </div>
      )}
    </div>
  );
}

const ProductPage = createPage({
  component: ProductView,
  fallback: <ProductSkeleton />
});

export default ProductPage;
```

### Search Page with Dynamic Page Key

```tsx
import { use } from 'react';
import { createPage } from '@/components/create-page';

function SearchView({ 
  searchTerm, 
  searchResult,
  filters 
}: { 
  searchTerm: string; 
  searchResult: Promise<ProductSearchResult>; 
  filters: Promise<Filter[]> 
}) {
  const searchResultData = use(searchResult);
  const filtersData = use(filters);
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">
        Search results for "{searchTerm}"
      </h1>
      
      <p className="text-gray-600 mb-8">
        Found {searchResultData.total} results
      </p>
      
      <div className="flex gap-8">
        <div className="w-64">
          <SearchFilters filters={filtersData} />
        </div>
        
        <div className="flex-1">
          <ProductGrid products={searchResultData.hits} />
          <SearchPagination result={searchResultData} />
        </div>
      </div>
    </div>
  );
}

const SearchPage = createPage({
  component: SearchView,
  fallback: <SearchSkeleton />,
  getPageKey: (data) => `search-${data.searchTerm}`
});

export default SearchPage;
```

## Page Key Generation

### Recommended Approach: Generate in Loader

For better performance and cleaner code, generate page keys in your loader functions:

```tsx
// ✅ Good: Generate page key in loader
function createPageKey(request: Request): string {
  const url = new URL(request.url);
  return url.pathname + '?' + url.search;
}

// In loader
async function loader({ request, params }) {
  return {
    category: fetchCategory(params.categoryId),
    searchResult: fetchSearchResults(params.categoryId),
    pageKey: createPageKey(request)
  };
}

// In route file
const CategoryPage = createPage({
  component: CategoryView,
  fallback: <CategorySkeleton />,
  getPageKey: (data) => data.pageKey
});
```

### Alternative: Use Location

If you don't provide a `getPageKey` function, the component will automatically use `location.pathname + location.search`:

```tsx
const CategoryPage = createPage({
  component: CategoryView,
  fallback: <CategorySkeleton />
  // No getPageKey - will use location.pathname + location.search
});
```

## Benefits

1. **Reduced Boilerplate** - Eliminates repetitive Suspense/Await code
2. **Consistent Patterns** - Standardizes how pages handle loading states
3. **Type Safety** - Full TypeScript support with proper data typing
4. **Reusability** - Easy to reuse patterns across different routes
5. **Maintainability** - Centralized logic for common patterns
6. **Better Performance** - Page key generation in loaders avoids unnecessary React re-renders
7. **Clean Exports** - Direct factory exports without unnecessary component wrappers
