## Parent

[PRD: Subscription & Premium Features (Frontend)](/prd/subscription-premium-features.md)

## What to build

Add Umami analytics tracking for all subscription funnel events and localize all new user-facing text.

**Umami Analytics:**

Create a lightweight `trackSubscriptionEvent` function that sends events to Umami. Track these events:

| Event | When it fires |
|-------|---------------|
| `paywall_viewed` | PaywallModal opens |
| `paywall_dismissed` | PaywallModal closes without purchase |
| `purchase_initiated` | Native pay sheet opens |
| `purchase_completed` | Purchase + backend validation succeed |
| `purchase_failed` | Purchase fails after all retries |
| `purchase_cancelled` | User cancels native pay sheet |
| `restore_initiated` | User taps "Restore Purchases" |
| `restore_completed` | Restore + backend migration succeed |
| `restore_failed` | Restore fails (no purchases, network, etc.) |
| `subscription_status_refreshed` | `refreshStatus()` succeeds |

Each event includes context: `feature` (which feature triggered the paywall), `tier` (monthly/annual), `platform` (ios/android), and `anonymousUserId`.

**Localization:**

Add a new `subscription` namespace to `src/i18n/en.json` covering:
- Paywall: headlines, benefit bullets, CTA buttons, dismiss text
- SubscriptionScreen: status labels, expiry formatting, pricing labels, restore button, manage subscription
- Error messages: all purchase/restore error states with retry prompts
- PremiumGate fallback: "Upgrade to Premium", "Unlock this feature"
- Free tier limits: "Free plan: 3 accounts max", "Free plan: 10 categories max"

The `subscription` namespace should follow the same structure as existing namespaces (e.g., `transactions`, `backup`).

## Acceptance criteria

- [ ] `trackSubscriptionEvent` function exists and sends events to Umami
- [ ] All 10 subscription events fire at the correct moments in the user flow
- [ ] Each event payload includes `feature`, `tier`, `platform`, and `anonymousUserId`
- [ ] Events are batched or sent asynchronously without blocking UI
- [ ] Network errors during tracking are silently ignored (no user-facing impact)
- [ ] `src/i18n/en.json` contains a new `subscription` namespace
- [ ] All paywall text is localized via `t('subscription.paywall...')`
- [ ] All subscription screen text is localized via `t('subscription.screen...')`
- [ ] All error messages are localized via `t('subscription.error...')`
- [ ] All premium gate fallback text is localized via `t('subscription.gate...')`
- [ ] Free tier limit messages are localized via `t('subscription.limits...')`
- [ ] No hardcoded English strings remain in subscription-related components
- [ ] Existing i18n setup (`useTranslation` from `react-i18next`) is used consistently

## Blocked by

- #5 PremiumGate Integration (needs paywall triggers to track `paywall_viewed`/`dismissed`)
- #6 Subscription Screen & PaywallModal (needs UI elements to localize)
