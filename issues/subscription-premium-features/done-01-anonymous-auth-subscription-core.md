## Parent

[PRD: Subscription & Premium Features (Frontend)](/prd/subscription-premium-features.md)

## What to build

Create the foundational subscription status module that manages anonymous authentication and cached premium state. This is the deepest module in the subscription layer — everything else depends on it.

End-to-end behavior:
- On app launch, `subscriptionCore.initialize()` checks `expo-secure-store` for a stored `anonymousUserId`
- If none exists, it calls `supabase.auth.signInAnonymously()`, gets the new user ID, and persists it securely
- It then reads the subscription cache (also from secure storage) and determines the user's tier
- `subscriptionCore.isPremium()` returns a boolean that gates all premium features
- `subscriptionCore.refreshStatus()` calls a Supabase Edge Function to validate the current subscription
- If the network call fails, it falls back to cached state with offline grace period logic

The module exposes a singleton with this interface:

```ts
interface SubscriptionCore {
  initialize(): Promise<void>;
  isPremium(): boolean;
  getExpiryDate(): Date | null;
  getTier(): 'free' | 'monthly' | 'annual';
  refreshStatus(): Promise<void>;
  getAnonymousUserId(): string | null;
  markRestored(): Promise<void>;
}
```

Internal state machine (from prototype):

```ts
type SubscriptionState = 
  | { status: 'unknown' }
  | { status: 'free' }
  | { status: 'premium'; expiry: Date; tier: 'monthly' | 'annual' }
  | { status: 'expired'; graceEnd: Date }
  | { status: 'offline'; cachedExpiry: Date };
```

Cache schema stored in `expo-secure-store`:
- `anonymousUserId`: string
- `status`: 'free' | 'premium' | 'expired'
- `tier`: 'monthly' | 'annual' | null
- `expiryDate`: ISO 8601 string or null
- `lastCheckedAt`: ISO 8601 string
- `receiptToken`: string or null

A `SubscriptionProvider` React Context wraps the app root in `_layout.tsx` to make subscription state available to all components.

## Acceptance criteria

- [ ] `subscriptionCore.initialize()` creates a new anonymous Supabase user on first launch and stores the ID in secure storage
- [ ] On subsequent launches, `initialize()` reuses the stored anonymous user ID
- [ ] `isPremium()` returns `false` before `initialize()` is called
- [ ] `isPremium()` returns `false` when cache shows `'free'` status
- [ ] `isPremium()` returns `true` when cache shows `'premium'` with future expiry
- [ ] `isPremium()` returns `true` during grace period (`'expired'` with `graceEnd` in future)
- [ ] `isPremium()` returns `true` in `'offline'` state with cached expiry in future
- [ ] `refreshStatus()` calls the Supabase Edge Function and updates cache on success
- [ ] `refreshStatus()` on network error falls back to cached state without crashing
- [ ] `SubscriptionProvider` wraps the app root and provides subscription state via React Context
- [ ] `expo-secure-store` and `@supabase/supabase-js` are installed and listed in `package.json`
- [ ] Environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) are documented in `.env.example`

## Blocked by

None - can start immediately
