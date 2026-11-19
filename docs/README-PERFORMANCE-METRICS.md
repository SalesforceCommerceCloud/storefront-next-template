# Performance Metrics

The application includes a built-in performance monitoring system that tracks and visualizes server-side and client-side operation timings. This feature helps developers understand request performance, identify bottlenecks, and optimize parallelization opportunities.

## Configuration

Performance metrics are controlled through feature flags in `config.server.ts`:

```json
{
    "performance": {
        "metrics": {
            "serverPerformanceMetricsEnabled": true,
            "clientPerformanceMetricsEnabled": true,
            "serverTimingHeaderEnabled": false
        }
    }
}
```

### Feature Flags

- **`serverPerformanceMetricsEnabled`** (default: `true`)
    - Enables performance tracking for server-side operations (SSR, API calls, authentication)
    - Logs detailed metrics after each server-side request completes

- **`clientPerformanceMetricsEnabled`** (default: `true`)
    - Enables performance tracking for client-side operations
    - Logs metrics for client-side navigations and API calls

- **`serverTimingHeaderEnabled`** (default: `false`)
    - When enabled, adds a [`Server-Timing`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing) HTTP header to responses
    - ⚠️ **Warning**: This **blocks** the response until all operations complete. Only enable for development/debugging.
    - The `auth.getPasswordResetToken` metric is never written to this header. The public password reset routes pad their response time so a known email can't be told from an unknown one, and this metric is the unpadded SLAS duration. It is still logged on the server.

## What Gets Tracked

The performance metrics system automatically tracks:

- **SSR Operations**: Total rendering time and middleware execution
- **Authentication**: Guest login, token refresh, and user authentication operations
- **API Calls**: All SCAPI requests with their class and method names
- **Timing Details**: Start time, end time, duration, and parallelization statistics

## Visualization Output

When enabled, performance metrics are logged to the console with a rich visualization showing:

1. **Header Section**: Request ID, URL, and total duration
2. **Timeline Visualization**: Visual bar chart showing when operations started, their duration, and overlap
3. **Time Markers**: Timeline scale showing milliseconds at regular intervals
4. **Operations List**: Each operation with its icon, name, duration, and timing range
5. **Summary Statistics**: Total operations, duration, sum of all operations, and parallelization percentage
6. **Category Breakdown**: Grouped statistics by operation type (AUTH, SSR, APICALL)

### Example Output

```
════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
🚀 Request server-1759770484104
📍 http://localhost:5173/
⏱️ 1409.27ms
⚠️  SSR timing shows total processing time. With streaming enabled, UI renders progressively before completion.
════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

Name                                        Duration    Timeline
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
                                                     0ms            282ms            564ms            846ms            1127ms            1409ms

⚡ ssr.total                                1409.27ms ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 0→1409ms
⚡ ssr.middleware                            693.77ms ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0→694ms
🔐 auth.guestLogin                          657.18ms ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0→657ms
🔐 auth.loginGuestUser                      656.71ms ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 1→657ms
🌐 apiCall.ShopperProducts.getCategory      437.84ms ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░ 693→1130ms
🌐 apiCall.ShopperSearch.productSearch      716.09ms ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ 693→1409ms
🌐 apiCall.ShopperProducts.getCategory      230.08ms ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓░░░ 1131→1362ms
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

📊 Summary:
   Total Operations: 7
   Total Duration: 1409.27ms
   Sum of All Operations: 4800.94ms
   Parallelization: 70.6%

📈 Breakdown by Category:
   ⚡ SSR: 2 ops, 2103.04ms total, 1051.52ms avg
   🔐 AUTH: 2 ops, 1313.89ms total, 656.95ms avg
   🌐 APICALL: 3 ops, 1384.01ms total, 461.34ms avg

════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
```

> [!TIP]
> The timeline visualization makes it easy to spot operations that could be parallelized. Look for operations with gaps in the timeline bars or those that start after others complete.

## Tracked Operation Types

Operations are categorized and displayed with distinct icons:

- **⚡ SSR**: Server-side rendering operations
- **🔐 AUTH**: Authentication and authorization operations
- **🌐 APICALL**: Salesforce Commerce API calls
- **💻 CLIENT**: Client-side operations

## Best Practices

1. **Development Only**: Keep metrics enabled during development to identify performance issues early
2. **Production**: Consider disabling or sampling metrics in production to reduce overhead
3. **Server-Timing Header**: Only enable `serverTimingHeaderEnabled` during debugging, as it blocks responses
4. **Review Regularly**: Check the timeline visualization periodically to ensure operations remain optimized
