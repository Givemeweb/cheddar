## Parent

[PRD: Subscription & Premium Features (Frontend)](/prd/subscription-premium-features.md)

## What to build

Implement offline mode and grace period handling so subscribers aren't penalized for lack of connectivity.

End-to-end behavior:
- When `subscriptionCore.refreshStatus()` fails due to network error, the module falls back to cached state
- If cached `expiryDate` is in the future → `isPremium()` returns `true` (trust the cache)
- If cached `expiryDate` is in the past but within 24 hours → `isPremium()` returns `true` (grace period)
- If cached `expiryDate` is in the past and beyond 24 hours → `isPremium()` returns `false` (truly expired)
- If no cache exists at all → `isPremium()` returns `false`
- A subtle "offline mode" indicator appears in the SubscriptionScreen when operating on stale cache
- The indicator shows when the status was last checked (e.g., "Last verified 2 days ago")

Daily polling strategy:
- On app launch: check `lastCheckedAt`. If older than 24 hours, trigger `refreshStatus()`
- On app foreground (after background): same staleness check
- Before accessing premium features: if cache is stale, trigger a silent refresh
- Pull-to-refresh on SubscriptionScreen: manual `refreshStatus()`
- All refreshes are non-blocking — UI remains responsive

Grace period for billing failures:
- When backend returns `'expired'` status with a `graceEnd` date, `isPremium()` returns `true` until that date
- The SubscriptionScreen shows "Payment issue — update your billing to keep Premium" warning
- After grace period ends, user downgrades to free features but keeps all data

## Acceptance criteria

- [ ] `isPremium()` returns `true` when cached expiry is in the future, even if offline
- [ ] `isPremium()` returns `true` during 24-hour grace period after expiry
- [ ] `isPremium()` returns `false` when cache is expired beyond grace period
- [ ] `isPremium()` returns `false` when no cache exists
- [ ] App launch triggers `refreshStatus()` only when cache is >24h old
- [ ] App foreground triggers `refreshStatus()` only when cache is >24h old
- [ ] Silent refresh before premium feature access is non-blocking
- [ ] SubscriptionScreen shows "Last verified X ago" indicator when using stale cache
- [ ] SubscriptionScreen shows billing warning during grace period
- [ ] Downgrade to free after grace period preserves all user data
- [ ] Umami event `subscription_status_refreshed` fires on every successful refresh
- [ ] Network errors during refresh are logged but not shown to user (silent fallback)

## Blocked by

- #1 Anonymous Auth & Subscription Core (needs `subscriptionCore` cache and refresh logic)
- #6 Subscription Screen & PaywallModal (needs SubscriptionScreen to show offline indicator)
