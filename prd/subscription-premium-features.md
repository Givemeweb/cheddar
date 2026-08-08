# PRD: Subscription & Premium Features (Frontend)

## Problem Statement

Cheddar currently offers all features for free with no monetization. There is no way to gate premium capabilities, validate in-app purchases, or manage subscription status. The user wants to add a subscription model without requiring email/password login — using anonymous authentication and receipt validation. The backend PRD (Supabase Edge Functions, anonymous auth, receipt validation, soft-delete migration) will be handled separately; this PRD covers only the frontend implementation.

## Solution

Add a complete subscription layer to the frontend that: (1) initializes anonymous authentication on app launch, (2) checks and caches subscription status from the backend, (3) gates premium features behind a `PremiumGate` component, (4) handles in-app purchase flows via `react-native-iap`, (5) supports "Restore Purchases" for cross-device access, and (6) gracefully handles offline usage with cached expiry dates.

## User Stories

1. As a new Cheddar user, I want to use the app immediately without creating an account, so that I can start tracking expenses with zero friction.
2. As a free-tier user, I want to see which features are locked and why, so that I understand the value of upgrading.
3. As a free-tier user, I want to tap a locked feature and see a clear paywall with pricing, so that I can decide whether to subscribe.
4. As a user considering subscribing, I want to see Monthly and Annual pricing options, so that I can choose the plan that fits me best.
5. As a user subscribing, I want the purchase flow to use native Apple/Google pay sheets, so that I feel secure and the experience feels familiar.
6. As a subscriber, I want premium features to unlock immediately after purchase, so that I don't have to wait or restart the app.
7. As a subscriber, I want to see my subscription status and expiry date in settings, so that I know when I'm billed next.
8. As a subscriber who got a new phone, I want to tap "Restore Purchases" and regain access without paying again, so that I don't lose my subscription.
9. As a subscriber switching devices, I want the app to automatically detect my subscription on first launch if possible, so that I don't have to hunt for a restore button.
10. As a subscriber on a flight with no internet, I want my premium features to keep working using cached status, so that I'm not penalized for being offline.
11. As a user whose subscription expired due to a failed payment, I want a grace period before losing access, so that I have time to fix my payment method.
12. As a user who cancelled their subscription, I want to keep my data and downgrade to free features, so that I'm not locked out of my historical transactions.
13. As a user who denied microphone permissions for voice-to-transaction, I want the app to guide me to settings, so that I can grant permissions later.
14. As a developer, I want the subscription status logic isolated in a testable module, so that I can verify premium gating without running the full app.
15. As a developer, I want purchase flows wrapped in a single module, so that I don't scatter `react-native-iap` calls across screens.
16. As a developer, I want the `PremiumGate` component to be the only place that decides if a feature is accessible, so that gating logic is centralized and consistent.
17. As a developer, I want subscription events tracked in Umami, so that I can measure conversion and churn without third-party analytics SDKs.
18. As a user in a region with different currencies, I want prices displayed in my local currency, so that I understand the actual cost.
19. As a user who encountered a purchase error, I want a clear message with a retry option, so that temporary network issues don't block me permanently.
20. As a user on the free tier, I want to see a subtle upgrade prompt in relevant screens (not annoying popups), so that I'm reminded of premium value contextually.
21. As a TestFlight beta tester, I want to use sandbox purchases without being charged real money, so that I can test the full flow.
22. As a developer, I want to mock the purchase flow in development, so that I can iterate quickly without connecting to App Store / Play Store.
23. As a user with multiple Apple IDs, I want the restore process to use the currently signed-in Apple ID, so that I don't accidentally restore someone else's purchases.
24. As a subscriber, I want to manage my subscription through the native system settings, so that I can cancel or change plans using familiar Apple/Google flows.

## Implementation Decisions

### Module Architecture

We will introduce **three deep modules** and **four shallow modules**:

#### 1. `subscription-core` service (deep)

Encapsulates the entire subscription status lifecycle: anonymous auth initialization, cached status management, polling Supabase, offline grace periods, and restore/migration coordination. Its public interface is:

```ts
interface SubscriptionCore {
  initialize(): Promise<void>;
  isPremium(): boolean;
  getExpiryDate(): Date | null;
  getTier(): 'free' | 'monthly' | 'annual';
  refreshStatus(): Promise<void>;
  getAnonymousUserId(): string | null;
  markRestored(): Promise<void>; // called after successful restore
}

// Singleton exported instance
export const subscriptionCore: SubscriptionCore;
```

This is a deep module because it hides the complexity of:
- Supabase anonymous auth session management
- Secure storage read/write (expo-secure-store for Keychain/Keystore)
- Cache staleness logic ("is cache > 24h old?")
- Offline grace period computation (cached expiry + 24h tolerance)
- Platform-specific receipt/token handling during restore
- Data migration coordination after cross-device restore

**State Machine (from prototype):**

```ts
type SubscriptionState = 
  | { status: 'unknown' }           // Initial, before initialize()
  | { status: 'free' }              // Confirmed non-subscriber
  | { status: 'premium'; expiry: Date; tier: 'monthly' | 'annual' }
  | { status: 'expired'; graceEnd: Date } // Payment failed, in grace period
  | { status: 'offline'; cachedExpiry: Date }; // No network, trusting cache
```

The `isPremium()` method returns `true` for both `'premium'` and `'offline'` states, and also during the grace period (`'expired'` if `graceEnd` is in the future).

**Cache Schema (stored in expo-secure-store + TinyBase backup):**

```ts
interface SubscriptionCache {
  anonymousUserId: string;
  status: 'free' | 'premium' | 'expired';
  tier: 'monthly' | 'annual' | null;
  expiryDate: string | null; // ISO 8601
  lastCheckedAt: string; // ISO 8601
  receiptToken: string | null; // Last known receipt for restore
}
```

#### 2. `iap-bridge` service (deep)

Encapsulates all `react-native-iap` interactions, platform-specific receipt extraction, and product normalization. Its public interface is:

```ts
interface Product {
  sku: string; // e.g., 'cheddar_premium_monthly'
  localizedPrice: string; // e.g., '$4.99'
  price: number; // e.g., 4.99
  currency: string; // e.g., 'USD'
  description: string;
  title: string;
  period: 'monthly' | 'annual';
}

interface PurchaseResult {
  success: boolean;
  receipt: string | null; // Apple receipt string or Google purchase token
  transactionId: string | null;
  error?: string;
}

interface RestoreResult {
  success: boolean;
  receipt: string | null;
  expiryDate: Date | null;
  error?: string;
}

interface IAPBridge {
  initialize(): Promise<void>;
  getProducts(): Product[];
  purchaseMonthly(): Promise<PurchaseResult>;
  purchaseAnnual(): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
  getCurrentReceipt(): Promise<string | null>;
}

// Singleton exported instance
export const iapBridge: IAPBridge;
```

This is a deep module because it hides:
- `react-native-iap` initialization and connection lifecycle
- Platform differences (Apple receipt JSON vs Google purchase token)
- SKU mapping (`cheddar_premium_monthly` / `cheddar_premium_annual`)
- Purchase sheet presentation and result handling
- Sandbox vs production detection
- Mock mode for development (`__DEV__` flag)

**Mock Mode (development):**

When `__DEV__` is true and no store connection is available, the bridge simulates purchases with a 1-second delay and returns a fake receipt. This allows rapid UI iteration without TestFlight.

#### 3. `PremiumGate` component (deep)

The single source of truth for feature gating. It reads from `subscription-core` and either renders children or a configurable fallback/paywall. Its public interface is:

```ts
type PremiumFeature = 
  | 'voice' 
  | 'unlimited_accounts' 
  | 'advanced_stats' 
  | 'backup'
  | 'subcategories'
  | 'alarms'
  | 'passcode';

interface PremiumGateProps {
  feature: PremiumFeature;
  children: React.ReactNode;
  fallback?: React.ReactNode; // Custom upsell UI
  showPaywallOnPress?: boolean; // If true, tapping fallback opens PaywallModal
}

export function PremiumGate(props: PremiumGateProps): React.ReactNode;
```

This is a deep module because it encapsulates:
- The complete feature-to-tier mapping (which features require premium)
- Subscription status reactivity (re-renders when status changes)
- Fallback UI generation (if no custom fallback provided)
- Paywall modal triggering
- Analytics event emission (Umami tracking of gate blocks)

**Feature Mapping:**

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

Note: Free tier users are limited to 3 accounts, 10 categories, basic monthly stats, and manual transaction entry only.

#### 4. `SubscriptionScreen` (shallow)

A new screen accessible from the More tab. Shows:
- Current subscription status card (active / expired / free)
- Expiry date (if active)
- Pricing cards for Monthly and Annual plans
- "Restore Purchases" button
- "Manage Subscription" link (opens native subscription settings)
- Upgrade/downgrade explanation

This is shallow because it delegates all logic to `subscription-core` and `iap-bridge`.

#### 5. `PaywallModal` component (shallow)

A fullscreen or half-screen modal presented when a free user attempts to access a premium feature. Shows:
- Feature-specific headline (e.g., "Unlock Voice-to-Transaction")
- 3-4 bullet points of premium benefits
- Monthly / Annual toggle with savings badge
- Purchase button with localized price
- "Restore Purchases" link
- Dismiss button

This is shallow because it's pure UI — all data comes from props or `iap-bridge.getProducts()`.

#### 6. `PremiumBadge` component (shallow)

A small inline badge used throughout the UI to indicate premium-locked features. Shows a star icon or "PRO" label. Tapping it opens the PaywallModal.

#### 7. App-level integration (shallow)

Modifications to `app/_layout.tsx` and a new `SubscriptionProvider`:
- Call `subscriptionCore.initialize()` during app startup
- Call `subscriptionCore.refreshStatus()` on app foreground (if cache is stale)
- Provide subscription state via React Context for components that need it

### Freemium Feature Split

| Feature | Free Tier | Premium Tier |
|---------|-----------|--------------|
| Transaction entry | Unlimited | Unlimited |
| Accounts | Max 3 | Unlimited |
| Categories | Max 10 | Unlimited |
| Monthly stats | Basic | Basic |
| Total stats / trends | Locked | Advanced |
| Voice-to-transaction | Locked | Unlocked |
| Backup / restore | Locked | Unlocked |
| Subcategories | Locked | Unlocked |
| Alarms / reminders | Locked | Unlocked |
| Passcode / biometric | Locked | Unlocked |

### Anonymous Auth Flow

```
App Launch
    ↓
Check for stored anonymousUserId in SecureStore
    ↓
Exists? → Use existing Supabase session
Missing? → Call supabase.auth.signInAnonymously()
    ↓
Store anonymousUserId in SecureStore
    ↓
Check subscription cache
    ↓
Stale or missing? → Call Supabase Edge Function
    ↓
Update cache → Emit status change
```

### Restore Purchases Flow

```
User taps "Restore Purchases"
    ↓
iapBridge.restorePurchases() → gets receipt from Apple/Google
    ↓
Send receipt + newAnonymousUserId to Supabase Edge Function
    ↓
Backend validates receipt with Apple/Google server APIs
    ↓
Backend finds old anonymous user linked to this receipt
    ↓
Backend transfers subscription data to new anonymous user
    ↓
Backend marks old user as migrated (soft delete)
    ↓
Backend returns new subscription status to frontend
    ↓
Frontend updates cache → Unlocks premium features
```

### Daily Polling Strategy

The frontend does NOT rely on webhooks. Instead:

1. On app launch: check cache. If `lastCheckedAt` is older than 24 hours, call `refreshStatus()`.
2. On app foreground (after background): same staleness check.
3. Before accessing premium features: if cache is stale, trigger a silent refresh.
4. Pull-to-refresh on SubscriptionScreen: manual `refreshStatus()`.

This keeps the implementation simple while ensuring subscription status is never more than ~24 hours stale.

### Offline Mode

When `refreshStatus()` fails due to network error:
- If cached expiry exists and is in the future → grant premium (trust cache)
- If cached expiry exists but is in the past → check if within 24h grace period → grant if so
- If no cache or cache expired beyond grace → treat as free
- Show a subtle "offline mode" indicator in SubscriptionScreen

### Purchase Receipt Handling

After a successful purchase:
1. `iap-bridge` extracts the receipt/token
2. Frontend sends receipt + anonymousUserId to Supabase Edge Function
3. Backend validates with Apple/Google servers
4. Backend stores subscription record linked to anonymousUserId
5. Backend returns subscription status + expiry
6. Frontend updates `subscription-core` cache
7. Premium features unlock immediately

### Error Handling & Resilience

- **Store connection failed**: Show "Unable to connect to App Store / Play Store" with retry
- **Purchase cancelled by user**: Silent dismiss, no error
- **Purchase succeeded but backend validation failed**: Show "Processing your purchase..." spinner, retry validation up to 3 times with exponential backoff
- **Network error during restore**: Show "Check your connection and try again" with retry
- **No purchases found during restore**: Show "No previous purchases found for this account"
- **Receipt already used by another user**: Show "This purchase is already linked to another device. Contact support if you need help."
- **Platform-specific errors**: Map error codes to user-friendly messages (e.g., `E_USER_CANCELLED` → silent, `E_SERVICE_ERROR` → "App Store is temporarily unavailable")

### Environment Configuration

Add to `.env.example`:

```
EXPO_PUBLIC_API_URL=https://your-backend.com/api/v1
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_IAP_MONTHLY_SKU=cheddar_premium_monthly
EXPO_PUBLIC_IAP_ANNUAL_SKU=cheddar_premium_annual
```

### Localization

Add a new `subscription` namespace to `src/i18n/en.json` with keys for:
- All paywall headlines, bullet points, and CTAs
- Status labels ("Active", "Expired", "Free Plan")
- Error messages and retry prompts
- Pricing display formats
- Restore purchase flow text
- Subscription screen labels

## Testing Decisions

### What Makes a Good Test

Tests should verify **external behavior**, not implementation details. For `subscription-core`, this means asserting that calling `initialize()` followed by `isPremium()` returns the expected boolean — not that it uses `expo-secure-store` internally. For `iap-bridge`, this means asserting that `purchaseMonthly()` returns a receipt string — not that it calls `react-native-iap`'s `requestPurchase`. For `PremiumGate`, this means asserting that when `isPremium()` returns `false`, the fallback UI is rendered — not that specific internal state variables change.

### Modules to Test

1. **`subscription-core` service** — Mock Supabase auth and SecureStore. Test: initialization creates new anonymous user, cache read/write, `isPremium()` returns true for valid cached expiry, offline grace period logic, stale cache detection.
2. **`iap-bridge` service** — Mock `react-native-iap` module. Test: `getProducts()` returns normalized products, `purchaseMonthly()` returns receipt on success, `restorePurchases()` returns receipt when purchases exist, mock mode works in `__DEV__`.
3. **`PremiumGate` component** — Use React Native Testing Library. Test: renders children when `isPremium()` is true, renders fallback when false, calls Umami track function on block, opens PaywallModal when `showPaywallOnPress` is true.

### Prior Art

The codebase does not currently have unit tests. Follow Expo/React Native testing conventions using `@testing-library/react-native` and `jest`. Mock `react-native-iap`, `expo-secure-store`, and `@supabase/supabase-js` in tests.

## Out of Scope

- **Backend implementation** — Supabase Edge Functions, anonymous auth setup, receipt validation with Apple/Google server APIs, database schema for users/subscriptions, soft-delete migration logic. These are covered by the backend PRD.
- **Webhook handling** — Real-time server-to-server notifications from Apple/Google. The frontend uses polling only.
- **Family Sharing** — Disabled for MVP. Can be enabled in a future iteration.
- **Promotional offers / intro pricing** — Not implemented in MVP.
- **Cross-platform subscription sync** — If a user subscribes on iOS and opens on Android, they need to restore purchases separately. Full cross-platform sync requires backend linking of Apple + Google receipts.
- **Subscription gifting** — Not supported.
- **Team/organization plans** — Consumer individual plans only.
- **Web-specific IAP** — The web build will show a "Download the app to subscribe" message. Web IAP is complex and deferred.

## Further Notes

- `react-native-iap` must be installed and configured with Expo config plugin. Run `npx expo install react-native-iap` and add the plugin to `app.json`.
- `expo-secure-store` is required for caching the anonymous user ID and subscription status securely. It persists across app reinstalls on iOS (Keychain) but NOT across device changes.
- The `PremiumGate` component should use React Context or a simple subscription to `subscription-core` state changes so that UI updates immediately when a purchase completes.
- Consider adding a subtle "PRO" badge on premium-unlocked UI elements (e.g., voice button, backup menu item) to reinforce value for subscribers.
- The paywall should use the app's existing design language (cheddar-yellow accents, dark/light theming via `useTheme`) rather than generic store UI.
- On iOS, the "Manage Subscription" button should deep-link to `app-settings:` → Subscriptions. On Android, link to Google Play Subscriptions page.
- For TestFlight testing, create a dedicated test user in App Store Connect and use sandbox purchase flows. The `iap-bridge` should automatically detect sandbox environment and show "[SANDBOX]" indicators in debug builds.
- Umami events to track: `paywall_viewed`, `paywall_dismissed`, `purchase_initiated`, `purchase_completed`, `purchase_failed`, `purchase_cancelled`, `restore_initiated`, `restore_completed`, `restore_failed`, `subscription_status_refreshed`.
