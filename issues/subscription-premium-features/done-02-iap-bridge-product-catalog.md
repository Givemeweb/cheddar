## Parent

[PRD: Subscription & Premium Features (Frontend)](/prd/subscription-premium-features.md)

## What to build

Create the IAP bridge module that encapsulates all `react-native-iap` interactions and normalizes platform-specific purchase data into a clean, testable interface.

End-to-end behavior:
- `iapBridge.initialize()` connects to the App Store / Play Store and fetches available subscription products
- `iapBridge.getProducts()` returns two normalized products: Monthly and Annual, each with localized price strings
- `iapBridge.purchaseMonthly()` and `iapBridge.purchaseAnnual()` present the native purchase sheet and return a receipt/token on success
- `iapBridge.restorePurchases()` queries the user's purchase history and returns the most recent valid receipt
- In `__DEV__` mode with no store connection, the bridge simulates purchases with a 1-second delay and returns a fake receipt

The module exposes a singleton with this interface:

```ts
interface Product {
  sku: string;
  localizedPrice: string;
  price: number;
  currency: string;
  description: string;
  title: string;
  period: 'monthly' | 'annual';
}

interface PurchaseResult {
  success: boolean;
  receipt: string | null;
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
```

SKU mapping is read from environment variables:
- `EXPO_PUBLIC_IAP_MONTHLY_SKU` (default: `cheddar_premium_monthly`)
- `EXPO_PUBLIC_IAP_ANNUAL_SKU` (default: `cheddar_premium_annual`)

The module handles platform differences:
- iOS: extracts Apple receipt JSON from `react-native-iap` purchase response
- Android: extracts Google purchase token
- Web: not supported — returns mock data in dev, throws in production

## Acceptance criteria

- [ ] `react-native-iap` is installed with Expo config plugin configured in `app.json`
- [ ] `iapBridge.initialize()` connects to store and fetches products without error
- [ ] `getProducts()` returns exactly 2 products (monthly + annual) with localized prices
- [ ] `purchaseMonthly()` presents native pay sheet and returns receipt on success
- [ ] `purchaseAnnual()` presents native pay sheet and returns receipt on success
- [ ] `restorePurchases()` returns receipt when previous purchases exist
- [ ] `restorePurchases()` returns `success: false` when no previous purchases exist
- [ ] Mock mode works in `__DEV__`: purchases succeed instantly with fake receipt
- [ ] SKU values are read from environment variables with sensible defaults
- [ ] Platform-specific receipt formats are handled correctly (iOS receipt JSON vs Android token)
- [ ] Purchase cancellation by user returns `success: false` without throwing

## Blocked by

None - can start immediately
