# Home Page: data flow aur styling

Ye file batati hai ke home page (`/`) par data kahan se aata hai, kaun si files use hoti hain, aur styling kaise lagti hai. Saare paths project root `dressup-sfnext-demo/` se hain.

## 1. Ek nazar mein

```
Browser request "/"
  -> src/routes.ts                         (file-based routes)
  -> src/root.tsx                          (<html>, theme/index.css load, providers)
  -> src/routes/_app.tsx                   (layout: Header + <Outlet/> + Footer)
       loader: categories, header banner, mega menu
       -> src/routes/_app._index.tsx       (HOME PAGE route)
            loader: page, searchResult, categories
```

Home page do loaders se data leta hai: pehle `_app.tsx` (layout) ka, phir `_app._index.tsx` (page) ka. Dono server par chalte hain (SSR), browser mein koi `useEffect` fetch nahi hota.

## 2. Data kahan se aata hai

### 2.1 Layout loader: `src/routes/_app.tsx`

| Data | Function | SCAPI API | Kahan dikhta hai |
|---|---|---|---|
| Root category + sub categories | `fetchCategory`, `fetchCategoriesByIds` in `src/lib/api/categories.server.ts` | Shopper Products `getCategory` / `getCategories` | Header ka navigation menu (New, Women, Men...) |
| Header component (announcement) | `fetchComponentWithComponentData({ componentId: 'header' })` in `src/lib/page-designer/component-loader.server.ts` | Shopper Experience (Page Designer) | Header ke upar announcement region |
| Mega menu component | `fetchComponentWithComponentData({ componentId: 'mega-menu' })` | Shopper Experience | Navigation ka mega menu |

Ye loader sirf pehli navigation par chalta hai (`shouldRevalidate() { return false }`), baad ki navigation mein dobara fetch nahi hota.

### 2.2 Home loader: `src/routes/_app._index.tsx`

| Loader field | Function | API | Await? | Kahan use hota hai |
|---|---|---|---|---|
| `page` | `fetchPageWithComponentData(args, { pageId: 'homepage' })` in `src/lib/page-designer/page-loader.server.ts` | Shopper Experience `getPage` (Page Designer ka page `homepage`) | **Haan** (critical) | `<Region regionId="headerbanner">` aur `<Region regionId="main">` |
| `searchResult` | `fetchCarouselProducts(...)` in `src/components/product-carousel/loaders.ts` -> `fetchSearchProducts` in `src/lib/api/search.server.ts` | Shopper Search `productSearch` (`cgid=root`, limit = `pages.home.featuredProductsCount` = 12, current currency) | Nahi (promise stream hota hai) | Featured Products carousel |
| `categories` | `fetchCategories(context, 'root', 1)` | Shopper Products `getCategories` | Nahi | Popular Categories section |
| `pageUrl`, `ogImageUrl` | `buildCanonicalUrl`, `hero01` | Local | n/a | SEO (`SeoMeta`) |

Rules jo CLAUDE.md se follow hote hain: critical data (page) `await` hota hai, baaki promise ke taur par stream hota hai taake page jaldi dikhe.

Revalidation: `src/lib/revalidation/routes/home.ts`. Add-to-cart jaise mutation ke baad home loader dobara nahi chalta; sirf currency badalne, shopper-context update, ya login/logout par chalta hai.

## 3. Page par kya render hota hai (upar se neeche)

`HomePage` component `src/routes/_app._index.tsx` mein hai. Page Designer ke 2 regions hain, aur har region ke `errorElement` mein **fallback content** hai jo tab dikhta hai jab Page Designer mein koi component set na ho.

```
<Header>                                 src/components/header/index.tsx
  announcement region (Page Designer)
  city selector strip                    src/components/delivery-promise/city-selector.tsx
  Logo | Navigation | Search | Icons
<main>
  <Region headerbanner critical>         src/components/region/index.tsx
     fallback: <HeroCarousel>            src/components/hero-carousel/index.tsx
               <ProductCarouselWithData> src/components/product-carousel/carousel.tsx
                    -> ProductTile       src/components/product-tile/index.tsx
                         -> ProductAvailabilitySummary (delivery date)
  <Region main>
     fallback: <PopularCategories>       src/components/home/popular-categories/
                    -> PopularCategory   src/components/home/popular-category/
               <ContentCard> x2          src/components/content-card/index.tsx  (Women, Men)
               <ContentCard> text-only   ("Style for Real Life")
<Footer>                                 src/components/footer/
```

### Page Designer vs fallback

- Agar Salesforce Page Designer mein `homepage` page par components lage hain, to `<Region>` wahi dikhata hai (har component `src/components/**` mein `@Component(...)` decorator wala hota hai, jaise `hero-carousel`, `product-carousel`, `popular-categories`, `content-card`).
- Agar region khali ho ya page na mile, to `errorElement` ke andar likha hua hard-coded fallback render hota hai. Abhi screenshot mein jo dikh raha hai wo aksar yahi fallback hota hai.
- Hero slides ke images: `public/images/hero-01.webp` se `hero-04.webp` (import `/images/hero-0X.webp`). Text translation se aata hai.

### Text (i18n)

Home ka saara text `useTranslation('home')` se aata hai. Translations `src/locales/<locale>/translations.json` mein `home` key ke andar hain (en-US, en-GB, ka-GE...). Keys jaise `hero.slide1.title`, `featuredProducts.title`, `featuredContent.women.title`.

## 4. Styling kaise lagti hai

### 4.1 Kahan se load hoti hai

`src/root.tsx` `@/theme/index.css` ko link karta hai. `src/theme/index.css` in files ko order se import karta hai:

| File | Kaam |
|---|---|
| `tailwind.css` | Tailwind theme bridge: CSS variables ko utilities banata hai (`bg-background`, `text-foreground`, `rounded-ui`...), aur font `--font-sans: 'Sen', ...` |
| `tokens/core.css` | Asli colors: `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, status colors |
| `tokens/brand.css` | Market Street brand colors (`--brand-black`, `--brand-white-bone`...) aur hero overlay gradients |
| `tokens/header.css`, `sidebar.css`, `components.css`, `custom.css`, `status.css`, `swatch.css`, `agentic.css` | Alag alag hisson ke tokens |
| `animations.css` | Keyframes |
| `base.css` | Global base: `@font-face` (Sen, `public/fonts/sen-variable.woff2`), `body` background/text/font, `.section-container`, focus/cursor rules |
| `overrides/*.css` | `navigation.css`, `sonner.css`, `cart-sheet.css`, `store-locator.css`: specific components ke overrides |

### 4.2 Components par kaise lagti hai

- **Tailwind utility classes** direct JSX mein, jaise `pb-16 -mt-8` (home wrapper), `grid grid-cols-1 md:grid-cols-2 gap-6` (Women/Men cards).
- **Design tokens**, hard-coded color nahi: `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `text-primary-foreground`. Color badalna ho to `tokens/core.css` / `tokens/brand.css` mein variable badlen.
- **Shape tokens**: `rounded-ui`, `shadow-ui`, `border-ui` (Card, Button, Input...). Inhe override karne ke liye source variable `--ui-radius`, `--ui-shadow`, `--ui-border-width` badlen, bridge variable (`--radius-ui`) nahi. Detail: `docs/README-SHAPE-TOKENS.md`.
- **`.section-container`** (`base.css`): page ki content width: `px-4 sm:px-8 lg:px-16 max-w-screen-2xl mx-auto`. Hero ke dots/buttons, content cards aur header sab isi ke andar hain, is liye sab ek line mein aligned rehte hain.
- **`cn()`** (`src/lib/utils`) class names merge karta hai (conditional classes ke liye).
- **Breakpoints**: `sm`, `md`, `lg`, `xl`, `2xl`. Misal: hero height `h-[400px] md:h-[500px] lg:h-[600px]` (`hero-carousel/index.tsx`).
- **Hero text legibility**: `--hero-overlay-dark/light` gradients (`brand.css`) image aur text ke beech lagte hain.
- **Header**: colors `tokens/header.css` se (`bg-header-background`, `text-header-foreground`), sticky `top-0 z-50`.
- **ContentCard**: `showBackground`, `showBorder`, `cardFooterClassName`, `cardDescriptionClassName` props se look badalta hai; "Style for Real Life" card mein `[&_h3]:text-3xl ...` arbitrary selectors se heading/paragraph styling hoti hai.
- **Page Designer design mode** mein hi `@salesforce/storefront-next-runtime/design/styles.css` load hoti hai (`src/page-designer-init.tsx`).

## 5. Kuch badalna ho to kahan jayen

| Kaam | File |
|---|---|
| Featured products ki tadaad | `config.server.ts` -> `pages.home.featuredProductsCount` |
| Hero slides ka text | `src/locales/<locale>/translations.json` -> `home.hero.*` |
| Hero images | `public/images/hero-0X.webp` aur `HomePage` mein `heroSlides` |
| Featured products kis category se | `_app._index.tsx` -> `fetchCarouselProducts({ categoryId: 'root' })` |
| Popular categories ka parent | `fetchCategories(context, 'root', 1)` |
| Font | `src/theme/base.css` (`@font-face`) aur `tailwind.css` (`--font-sans`) |
| Colors | `src/theme/tokens/core.css`, `brand.css` |
| Page Designer se content badalna | Business Manager -> Page Designer -> page `homepage` (regions `headerbanner`, `main`) |
| Navigation categories | Business Manager catalog; depth `config.server.ts` -> `pages.navigation` |
