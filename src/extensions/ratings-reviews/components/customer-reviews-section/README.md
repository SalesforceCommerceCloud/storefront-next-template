# Customer Reviews Section

How the reviews feature is wired and what it does.

## How components connect

```
PDP (_app.product.$productId)
  └── ProductReviewsProvider          ← wraps PDP content; owns reviews state & adapter calls
        ├── ProductInfo
        │     └── ProductRatingSummary   ← stars + count; below product description, beside image, above price; "See reviews" link takes the user to expanded accordion
        └── ProductAccordion / content
              └── CustomerReviewsSection ← this component: accordion + summary + list
                    ├── StarRating / StarRatingDistributions  ← summary card (rating + bars)
                    ├── AiInsightCard (lazy)                ← AI summary, shown on PDP load
                    └── ReviewCardsSection (lazy)              ← list + WriteReviewButton
                          ├── filter by rating, search, sort, pagination
                          └── WriteReviewButton → modal (WriteReviewModalContent)
                                └── on submit → addReview() from context
```

- **ProductReviewsProvider** lives on the PDP. It uses the **product content adapter** (`getReviewsSummary`, `getReviews`, `addReview`). UI only talks to the provider via **useProductReviews**.
- **ProductRatingSummary** (in ProductInfo) shows the compact rating; it calls **expandReviews()** so "See customer reviews" scrolls to and opens the accordion.
- **CustomerReviewsSection** is the main reviews block: accordion header uses summary; on expand it loads full list and renders **ReviewCardsSection** and **AiInsightCard**.
- **ReviewCardsSection** does filtering, search, sort, pagination and renders **ReviewCard**; it includes **WriteReviewButton**, whose modal uses **addReview()** to add a new review and update context.

## Features

- **Summary on load** – Lightweight `getReviewsSummary` (average, count, distribution, AI summary) for accordion header and PDP rating.
- **AI summary on PDP load** – AI summary is fetched with the summary and displayed on PDP load (lazy-loaded component, e.g. "Beta" badge).
- **Full list on expand** – Full reviews fetched when user opens the accordion (`loadReviewsIfNeeded`).
- **PDP rating + jump** – ProductRatingSummary (below product description, beside image, above price) shows stars/count; "See customer reviews" expands the reviews accordion.
- **Rating distribution** – Bar chart by star rating; clicking a bar filters the list.
- **Filter, search, sort** – Filter by star rating; keyword search; sort (e.g. most recent, highest/lowest rated, most helpful); optional "with photos only".
- **Pagination** – Paged list with configurable page size.
- **Write a review** – Modal form; submit calls adapter `addReview` and context **addReview** so the new review appears in the list.

## State management

- **ProductReviewsContext** (inside ProductReviewsProvider):
  - **reviewsSummary** / **reviewsSummaryLoading** – from `getReviewsSummary` on product change.
  - **reviews** / **reviewsLoading** – from `getReviews` when **loadReviewsIfNeeded** runs (e.g. accordion expanded).
  - **aiSummary** – from summary or full-list response.
  - **loadReviewsIfNeeded** – idempotent fetch of full list (used when accordion opens).
  - **addReview(review)** – appends review to `reviews` and calls adapter `addReview`.
  - **expandReviews** / **registerExpand** – so ProductRatingSummary can open the CustomerReviewsSection accordion without direct refs.

- **Local UI state** (not in context):
  - **CustomerReviewsSection**: accordion open/closed, selected rating filter for the distribution bar.
  - **ReviewCardsSection**: search query, sort, current page, "photos only" toggle; rating filter can be controlled by parent (distribution clicks) or internal.

Data flow: adapter (backend) ↔ ProductReviewsProvider ↔ useProductReviews() ↔ CustomerReviewsSection, ReviewCardsSection, ProductRatingSummary, WriteReviewModalContent.
