# (Demo) Ratings & Reviews

Renders customer reviews on the PDP, the rating summary on the cart-item modal,
and the per-line "Rate & Review" affordance on order detail.

> **Demo / mock stub.** Ships with hard-coded fixture data — a reference
> implementation, not a production integration. The fixtures return the same
> reviews and form configuration regardless of product. To go live, replace the
> bodies of the four functions in `lib/api/reviews.server.ts` with calls into
> your reviews provider (Bazaarvoice, PowerReviews, Yotpo, Trustpilot, etc.).
> Types are stable, so consumers don't change.

## Data sources

`src/extensions/ratings-reviews/lib/api/reviews.server.ts` exports four
server-only functions:

- `getReviewsSummary(productId)` — lightweight summary (count, average,
  distribution, AI summary) for the rating display.
- `getReviews(productId)` — full reviews list + section config (sort options,
  search placeholder, etc.).
- `getWriteReviewForm(productId)` — labels and validation rules for the
  "Write a Review" form.
- `addReview(productId, review)` — persists a new review (mock store, in-memory).

Persistence note: the in-memory store lives only for the lifetime of the server
process. In serverless or multi-process deployments mock writes will not
survive restarts. Replace with real persistence before relying on it.

## UITargets

| Target ID | Mounted in | Purpose |
| --- | --- | --- |
| `sfcc.pdp.reviews.section` | `_app.product.$productId` | Full reviews accordion (summary + list + write-review modal). |
| `sfcc.pdp.reviews.summary` | `cart-item-modal/view` | Rating stars + count for compact product views (mounted on click — uses a resource route + `useFetcher`, not the loader). |
| `sfcc.account.orderDetail.lineReview` | `order-items-list` | Per-line "Rate & Review" CTA on order detail. |

## Loader integration

The PDP route (`src/routes/_app.product.$productId.tsx`) creates three deferred
Promises (`reviewsSummaryPromise`, `reviewsListPromise`, `writeReviewFormPromise`)
streamed to target wrappers via `useRouteLoaderData('routes/_app.product.$productId')`.
The account-order-detail route similarly defers `writeReviewFormPromise`.

The cart-item modal does **not** participate in SSR streaming (it mounts on
interaction). Its rating summary is fetched via `useFetcher` against the
`resource.reviews-summary` route in this extension.

All loader imports / fields and component mounts are bracketed by
`@sfdc-extension-block-start/-end SFDC_EXT_RATINGS_REVIEWS` markers so they're
stripped cleanly when the extension is uninstalled.

## Action route

`POST /resource/add-review` (extension route `action.add-review`) accepts a
`FormData` payload validated by `addReviewSchema` (Zod). Components submit via
`useFetcher`; the response envelope is `{ success, review? } | { success: false, error }`.

## Routes

- `routes/action.add-review.tsx` — POST a new review.
- `routes/resource.reviews-summary.ts` — GET a product's rating summary
  (used by the cart-item modal).
