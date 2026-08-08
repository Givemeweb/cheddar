## Parent

[PRD: Subscription & Premium Features (Frontend)](/prd/subscription-premium-features.md)

## What to build

Implement the "Restore Purchases" flow that allows users to regain premium access on a new device without paying again. This triggers the backend soft-delete migration pattern.

End-to-end behavior:
- User taps "Restore Purchases" button (in paywall or settings)
- `iapBridge.restorePurchases()` queries Apple/Google for purchase history and returns the receipt
- The receipt + current `anonymousUserId` is sent to the Supabase Edge Function (`POST /subscriptions/restore`)
- The backend validates the receipt, finds the old anonymous user linked to this receipt, transfers subscription data to the new user, and marks the old user as migrated (soft delete)
- The backend returns the new subscription status to the frontend
- Frontend updates `subscriptionCore` cache → premium unlocks
- If no purchases are found, show "No previous purchases found for this account"
- If the receipt is already linked to another active user, show "This purchase is already linked to another device. Contact support if you need help."

Auto-restore on first launch:
- On first app launch (no local subscription cache), silently attempt to restore purchases in the background
- If a subscription is found, unlock premium without user interaction
- If nothing is found, show nothing — user can manually restore later
- This auto-restore should be fast and non-blocking (don't delay app startup)

## Acceptance criteria

- [x] "Restore Purchases" button triggers `iapBridge.restorePurchases()`
- [x] Receipt + anonymousUserId sent to backend restore endpoint
- [x] Backend soft-delete migration updates subscription to new user
- [x] Frontend cache updates and premium unlocks after successful restore
- [x] "No previous purchases found" message shown when appropriate
- [x] "Already linked to another device" message shown for duplicate receipt
- [x] Auto-restore runs silently on first launch when no cache exists
- [x] Auto-restore is non-blocking (app remains usable during the attempt)
- [x] Network error during restore shows retry option
- [x] Umami event `restore_initiated` fires when user taps restore
- [x] Umami event `restore_completed` fires after successful backend response
- [x] Umami event `restore_failed` fires on validation or network failure

## Blocked by

- #3 Purchase Flow & Immediate Unlock (needs the backend validation endpoint and receipt handling patterns)
