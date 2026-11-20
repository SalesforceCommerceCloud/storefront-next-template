# Image Banner

Image Banner displays campaign artwork at its intrinsic proportions, with an optional full-image link and disclosure label. It composes the shared Content Card image renderer.

```tsx
import ImageBanner from '@/components/image-banner';

<ImageBanner
    imageUrl={{ url: '/images/campaign-wide.webp', metaData: { width: 1600, height: 240 } }}
    imageAlt="Summer offer. Save on sparkling water."
    linkUrl="/c/drinks"
    disclosure="Sponsored"
/>
```

| Setting | Behavior |
|---|---|
| `imageUrl` | Main artwork; accepts an image URL or an `Image` object |
| `imageAlt` | Describes the offer, including words baked into the artwork |
| `linkUrl` | Optional destination for the whole image |
| `linkAriaLabel` | Optional accessible link label; otherwise the image alt names the link |
| `disclosure` | Optional merchant-supplied label, such as Sponsored |

Supply `metaData.width` and `metaData.height` to reserve the artwork's dimensions before loading. Local public asset URLs resolve through the production bundle. The same artwork is used at every viewport size. Image Banner supplies a default `100vw` width hint to DynamicImage, which generates responsive sources and DIS resizing for supported remote images. Local public artwork stays on the static asset pipeline. React consumers can override `imageWidths` for narrower slots.

Image Banner is a shared React component, without a Page Designer palette registration. An unconfigured banner renders a shared placeholder in design mode and nothing on the storefront.

Provide image alternative text describing the campaign. A linked banner without any accessible name renders nothing; the renderer adds no separate editor validation UI.

Use Content Card when the component needs authored headings, body copy, or a separate CTA. See [Content Carousel](./README-CONTENT-CAROUSEL.md) for card collections and [Page Designer](./README-PAGE-DESIGNER.md) for registration.
