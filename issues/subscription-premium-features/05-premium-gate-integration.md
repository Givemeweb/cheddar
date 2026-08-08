## Parent

[PRD: Subscription & Premium Features (Frontend)](/prd/subscription-premium-features.md)

## What to build

Build the `PremiumGate` component and integrate it across all premium features in the app. This is the single source of truth for feature gating.

End-to-end behavior:
- `PremiumGate` wraps any feature UI and conditionally renders children (if premium) or a fallback (if free)
- The feature-to-tier mapping is centralized:

```ts
const FEATURE_REQUIREMENTS: Record<PremiumFeature, 'free' | 'premium'> = {
  voice: 'premium',
  unlimited_accounts: 'premium',
  advanced_stats: 'premium',
  backup: 'premium',
  subcategories: 'premium',
  alarms: 'premium',
  passcode: 'premium',
};
```

Integration points across the app:
1. **Voice-to-transaction**: Wrap the mic FAB in `PremiumGate` with `feature: 'voice'` — free users see a locked mic icon that opens paywall on tap
2. **Accounts**: Enforce 3-account limit in the accounts screen and account creation flow. Free users see "Upgrade to add more accounts" when at limit
3. **Categories**: Enforce 10-category limit in category management. Free users see upgrade prompt when at limit
4. **Stats**: Advanced stats screen (total stats, trends) wrapped in `PremiumGate` with `feature: 'advanced_stats'`
5. **Backup**: All backup menu items wrapped in `PremiumGate` with `feature: 'backup'`
6. **Subcategories**: Subcategory toggle in configuration wrapped in `PremiumGate` with `feature: 'subcategories'`
7. **Alarms**: Alarm settings wrapped in `PremiumGate` with `feature: 'alarms'`
8. **Passcode**: Passcode settings wrapped in `PremiumGate` with `feature: 'passcode'`

The default fallback UI shows a lock icon + "Upgrade to Premium" text. Tapping it opens the `PaywallModal` (built in this slice as a minimal shell — full design in Slice 6).

Free-tier limits:
- Max 3 accounts (enforced at creation time)
- Max 10 categories total (enforced at creation time)
- Basic monthly stats only (advanced stats screen blocked)

## Acceptance criteria

- [ ] `PremiumGate` component exists with `feature`, `children`, `fallback`, and `showPaywallOnPress` props
- [ ] Mic FAB is gated: free users see locked icon that opens paywall on tap
- [ ] Account creation blocked at 3 accounts for free users with upgrade prompt
- [ ] Category creation blocked at 10 categories for free users with upgrade prompt
- [ ] Advanced stats screen is fully gated (navigation or content blocked)
- [ ] Backup menu items are gated in the More tab
- [ ] Subcategories toggle is gated in configuration
- [ ] Alarm settings are gated in configuration
- [ ] Passcode settings are gated in configuration
- [ ] Premium users see all features unlocked without any prompts
- [ ] `PremiumGate` re-renders automatically when subscription status changes
- [ ] Umami event `paywall_viewed` fires when paywall opens
- [ ] Umami event `paywall_dismissed` fires when paywall closes without purchase

## Blocked by

- #2 IAP Bridge & Product Catalog (needs product data for paywall pricing)
- #3 Purchase Flow & Immediate Unlock (needs purchase flow to complete the paywall)
