## Parent

[PRD: Subscription & Premium Features (Frontend)](/prd/subscription-premium-features.md)

## What to build

Create the Subscription settings screen and the full PaywallModal UI. This slice is pure frontend — all business logic is provided by earlier slices.

**Subscription Screen** (new route: `/subscription`):
- Current status card: large icon + "Active" / "Expired" / "Free Plan" label
- If active: show expiry date, tier badge (Monthly / Annual), and "Manage Subscription" button (deep-links to native subscription settings)
- If expired: show "Your subscription has expired" with re-subscribe pricing cards
- If free: show "You're on the Free Plan" with upgrade pricing cards
- Pricing cards: two side-by-side cards for Monthly and Annual, showing localized price + savings badge on Annual
- "Restore Purchases" button below pricing
- "Manage Subscription" button (iOS: `app-settings:` → Subscriptions, Android: Google Play Subscriptions page)

**PaywallModal** (reusable modal):
- Feature-specific headline: "Unlock Voice-to-Transaction", "Unlock Unlimited Accounts", etc.
- 3-4 bullet points of premium benefits (relevant to the feature that triggered it)
- Monthly / Annual toggle with Annual showing a "Save 20%" badge
- Large purchase button with localized price
- "Restore Purchases" text link below button
- Dismiss X button in top-right
- Uses app's existing design language (cheddar-yellow accents, dark/light theming via `useTheme`)

Both screens read from `iapBridge.getProducts()` for pricing and `subscriptionCore` for status.

## Acceptance criteria

- [ ] Subscription screen is accessible from the More tab menu
- [ ] Status card correctly shows Active / Expired / Free state
- [ ] Active state shows expiry date and tier badge
- [ ] Expired state shows re-subscribe pricing cards
- [ ] Free state shows upgrade pricing cards
- [ ] Pricing cards display correct localized prices from `iapBridge.getProducts()`
- [ ] Annual card shows a savings badge (e.g., "Save 20%")
- [ ] "Restore Purchases" button triggers restore flow
- [ ] "Manage Subscription" deep-links to native subscription settings on iOS and Android
- [ ] PaywallModal opens with feature-specific headline when triggered from `PremiumGate`
- [ ] PaywallModal shows Monthly/Annual toggle with correct prices
- [ ] PaywallModal purchase button triggers purchase flow
- [ ] PaywallModal dismisses on X tap or successful purchase
- [ ] All text uses i18n translation keys (new `subscription` namespace)
- [ ] Both screens respect dark/light theme via `useTheme`

## Blocked by

- #3 Purchase Flow & Immediate Unlock (needs purchase flow to wire buttons)
- #4 Restore Purchases & Cross-Device Migration (needs restore flow to wire buttons)
- #5 PremiumGate Integration (needs `PremiumGate` to trigger the paywall)
