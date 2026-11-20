# Content Carousel

`ContentCarousel` arranges Content Cards in a responsive row. It uses the shared `CarouselSection`; `HeroCarousel` remains the full-width campaign component.

```tsx
import ContentCarousel from '@/components/content-carousel';

<ContentCarousel
    title="This week's picks"
    itemsOnMobile={1.25}
    itemsOnTablet={2.25}
    itemsOnDesktop={4.25}
    spacing="small"
    items={[{
        id: 'campaign',
        layout: 'image',
        imageUrl: '/images/campaign.webp',
        imageAlt: 'Seasonal collection. Explore the collection.',
        imageAspectRatio: '3:4',
        buttonLink: '/search?q=seasonal',
    }]}
/>
```

| React prop | Default | Purpose |
|---|---|---|
| `itemsOnMobile` / `itemsOnTablet` / `itemsOnDesktop` | `1` / `2` / `4` | Visible card count; fractions reveal the next item |
| `titleVariant` | `default` | `section` uses the shared section-heading typography |
| `spacing` | `medium` | `small`, `medium`, or `large` gaps |
| `showNavigation` | `true` | Previous/next controls when multiple cards exist |
| `autoPlay` | `false` | Optional automatic advance |
| `autoPlayInterval` | `6000` | Advance interval in milliseconds; bounded to 1000–60000 |

Content Carousel and Image Banner are shared React components; they are not registered in the Page Designer palette. Existing page regions continue to accept the registered component types.

Content Card retains its existing Page Designer fields. Campaign/image layouts, category-row presentation, mobile Grid columns, carousel title styling/autoplay, and image-loading counts are React configuration, not additional authoring fields. Category Card and Categories expose `labelPosition`, `imageShape`, and `imageFit`.

Content Card supports `layout="image"` for linked artwork, `imageAspectRatio` (`4:3`, `3:4`, `1:1`, `16:9`, `auto`), overlay-copy `contentPosition`, `overlay` (`dark`, `light`, `none`), and a `badge` disclosure. Existing cards keep their previous defaults. Image-only cards need alternative text that conveys any words baked into the artwork; `buttonLink` links that artwork without adding a duplicate CTA.

Autoplay pauses on hover and keyboard focus, starts paused for reduced motion, and provides an explicit playback control. Multiple visible cards remain accessible. The carousel supplies responsive image hints and gives the first image high priority. Colors, fonts, and shape tokens come from the active theme.

See [Page Designer](./README-PAGE-DESIGNER.md) for component registration and critical-region rendering.

For standalone campaign artwork, use [Image Banner](./README-IMAGE-BANNER.md), which composes Content Card and exposes a full-image link and an optional disclosure label.

A shared Grid can hold image-only Content Cards for campaign tiles. Set `columns="4" columnsOnMobile="2"` for two columns below 1024px and four above. The optional mobile setting changes presentation only; `columns` still determines the number of Page Designer column regions. Existing Grids retain their previous layout when the mobile setting is omitted.

The shared Categories component supports `layout="row"`, `showHeading={false}`, `labelPosition="below"`, `imageShape="circle"`, and `imageFit="contain"` for a compact, horizontally scrollable category navigation row. Pass categories from Shopper Products via `data` or `categoriesPromise`; Category Card reads the image URL from each API category. Missing circular-card images use the neutral content placeholder. Grocery's homepage starts this deferred API request in its loader and does not provide category image fixtures.

Use Content Card `variant="campaign"` for compact campaign overlays with a shared heading preset and an underlined text CTA. Set `contentPosition`, `overlay`, and `imageAspectRatio` through component configuration. The variant uses Tailwind's spacing, font-weight, and color tokens; pages do not need footer, descendant-heading, or button class overrides.

Compact category rows select the Category Card `size="compact"` configuration. For `imageFit="contain"`, themes can set `--category-image-padding` and `--category-image-blend-mode` in their component source tokens (defaults: no inset, normal blending). Category imagery and destinations continue to come from category data; styling does not match hardcoded category IDs.

Header Search accepts `variant="filled"` for a muted, borderless input using semantic colors and Tailwind spacing. Grocery's logo height utilities read `--header-logo-height` and `--header-logo-height-desktop` from its header source tokens. Logo width/height props describe the asset's intrinsic dimensions.

Category Card and Categories support `labelPosition="above"` to place the plain category label before the image in visual and document order. `below` places it after the image; `overlay` remains the default. Collection settings apply to both API-loaded cards and authored Category Card children.
