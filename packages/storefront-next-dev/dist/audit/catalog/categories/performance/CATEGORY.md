# Performance

## Purpose and boundaries

Use Playhouse summary, Opportunities, LCP, TBT, third-party, document, and network artifacts as measured evidence. Inspect source only to explain measured symptoms or delivered response policy; never recreate Playhouse algorithms. The exception is `performance/server-request-waterfall`, which maps server-render network calls from source because Playhouse can't see inside the server.

## Investigation sequence

Inspect every rule, compare representative and outlier cells, then trace measured symptoms to source.

## Evidence and redaction

Cite artifact name, JSON pointer/value, page, and line-addressable source where used.

## Severity and blind spots

Uncollected and authenticated pages remain explicit coverage gaps. Header policy requires a representative sanitized HAR with trustworthy response type and size evidence.
Public-resource caching does not establish that personalized or API responses are safe for shared caches.
