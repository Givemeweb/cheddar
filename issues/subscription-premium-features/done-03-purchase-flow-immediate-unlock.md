## Parent

[PRD: Subscription & Premium Features (Frontend)](/prd/subscription-premium-features.md)

## What to build

Wire the purchase flow end-to-end: user taps a price button in the paywall → native pay sheet opens → purchase succeeds → receipt is sent to the backend for validation → subscription status updates → premium features unlock immediately.

End-to-end behavior:
- A `PurchaseButton` component (or inline paywall CTA) calls `iapBridge.purchaseMonthly()` or `purchaseAnnual()`
- On success, the receipt is sent to a Supabase Edge Function (`POST /subscriptions/validate`) along with the `anonymousUserId`
- The backend validates the receipt with Apple/Google server APIs, stores the subscription record, and returns the subscription status + expiry date
- The frontend receives the response, updates `subscriptionCore` cache, and emits a status change
- Any component reading `isPremium()` re-renders immediately with the new state
- On failure, a clear error message is shown with a retry option

Error handling:
- Store connection failure → "Unable to connect to App Store / Play Store. Please try again."
- User cancels purchase → silent dismiss, no error
- Purchase succeeds but backend validation fails → "Processing your purchase..." with auto-retry (up to 3 times, exponential backoff)
- Network error during validation → "Check your connection and try again."

The slice also includes a minimal `PaywallModal` shell that can trigger this flow — just enough UI to test the purchase button. The full paywall design is in a later slice.

## Acceptance criteria

- [ ] Tapping a purchase button opens the native Apple/Google pay sheet
- [ ] Successful purchase sends receipt + anonymousUserId to the backend validation endpoint
- [ ] Backend response updates `subscriptionCore` cache with new expiry date
- [ ] `isPremium()` returns `true` immediately after successful validation
- [ ] Components gated by `isPremium()` re-render automatically when status changes
- [ ] Backend validation failure triggers auto-retry with exponential backoff (max 3 attempts)
- [ ] User cancellation is handled silently (no error alert)
- [ ] All error states show user-friendly messages with retry option
- [ ] Umami event `purchase_initiated` fires when pay sheet opens
- [ ] Umami event `purchase_completed` fires after successful validation
- [ ] Umami event `purchase_failed` fires after final retry failure

## Blocked by

- #1 Anonymous Auth & Subscription Core (needs `subscriptionCore` and anonymous user ID)
- #2 IAP Bridge & Product Catalog (needs `iapBridge` purchase functions)
