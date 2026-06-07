import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getReceiptDataIOS,
  type ProductSubscription,
  type Purchase,
  type PurchaseError,
} from "react-native-iap";
import { Platform } from "react-native";

// Types

export interface Product {
  sku: string;
  localizedPrice: string;
  price: number;
  currency: string;
  description: string;
  title: string;
  period: "monthly" | "annual";
}

export interface PurchaseResult {
  success: boolean;
  receipt: string | null;
  transactionId: string | null;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  receipt: string | null;
  expiryDate: Date | null;
  platform?: "ios" | "android";
  error?: string;
}

export interface IAPBridge {
  initialize(): Promise<void>;
  getProducts(): Product[];
  purchaseMonthly(): Promise<PurchaseResult>;
  purchaseAnnual(): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
  getCurrentReceipt(): Promise<string | null>;
}

// SKU Configuration

const MONTHLY_SKU =
  process.env.EXPO_PUBLIC_IAP_MONTHLY_SKU ?? "cheddar_premium_monthly";
const ANNUAL_SKU =
  process.env.EXPO_PUBLIC_IAP_ANNUAL_SKU ?? "cheddar_premium_annual";

// Internal State

let _products: Product[] = [];
let _initialized = false;
let _listeners: Array<{ remove(): void }> = [];
let _pendingPurchase: Purchase | null = null;
let _pendingError: PurchaseError | null = null;
const _offerTokens: Map<string, string> = new Map();

// Helpers

function normalizeProduct(
  storeProduct: ProductSubscription,
  period: "monthly" | "annual",
): Product {
  return {
    sku: storeProduct.id,
    localizedPrice: storeProduct.displayPrice,
    price: storeProduct.price ?? 0,
    currency: storeProduct.currency,
    description: storeProduct.description,
    title: storeProduct.title,
    period,
  };
}

function setupListeners(): void {
  clearListeners();

  const updatedSub = purchaseUpdatedListener((purchase: Purchase) => {
    _pendingPurchase = purchase;
  });

  const errorSub = purchaseErrorListener((error: PurchaseError) => {
    _pendingError = error;
  });

  _listeners.push(updatedSub, errorSub);
}

function clearListeners(): void {
  _listeners.forEach((l) => l.remove());
  _listeners = [];
}

async function extractReceipt(purchase: Purchase): Promise<string | null> {
  if (Platform.OS === "ios") {
    try {
      return await getReceiptDataIOS();
    } catch {
      // Fallback to purchaseToken if receipt fails
      return purchase.purchaseToken ?? null;
    }
  }

  // Android
  return purchase.purchaseToken ?? null;
}

function waitForPurchase(
  timeoutMs = 60000,
): Promise<{ purchase: Purchase | null; error: PurchaseError | null }> {
  const start = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      if (_pendingPurchase) {
        const result = { purchase: _pendingPurchase, error: null };
        _pendingPurchase = null;
        _pendingError = null;
        resolve(result);
        return;
      }

      if (_pendingError) {
        const result = { purchase: null, error: _pendingError };
        _pendingPurchase = null;
        _pendingError = null;
        resolve(result);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        resolve({ purchase: null, error: null });
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });
}

async function doPurchase(sku: string): Promise<PurchaseResult> {
  _pendingPurchase = null;
  _pendingError = null;

  try {
    const appleRequest = { sku };
    const googleRequest =
      Platform.OS === "android"
        ? {
            skus: [sku],
            subscriptionOffers: [
              {
                sku,
                offerToken: _offerTokens.get(sku) ?? "",
              },
            ],
          }
        : { skus: [sku] };

    await requestPurchase({
      request: {
        apple: appleRequest,
        google: googleRequest,
      },
      type: "subs",
    });
  } catch (err) {
    // Synchronous rejection (e.g., E_USER_CANCELLED, E_NOT_PREPARED)
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      receipt: null,
      transactionId: null,
      error: errorMessage,
    };
  }

  const { purchase, error } = await waitForPurchase();

  if (error) {
    return {
      success: false,
      receipt: null,
      transactionId: null,
      error: error.message,
    };
  }

  if (!purchase) {
    return {
      success: false,
      receipt: null,
      transactionId: null,
      error: "Purchase timed out or was cancelled",
    };
  }

  const receipt = await extractReceipt(purchase);
  const transactionId = purchase.transactionId ?? null;

  // Finish the transaction so the platform removes it from the queue
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch {
    // Non-fatal: receipt is already extracted
  }

  return { success: true, receipt, transactionId };
}

// Native IAP Bridge Implementation

class NativeIAPBridge implements IAPBridge {
  async initialize(): Promise<void> {
    if (_initialized) return;

    await initConnection();
    setupListeners();

    const skus = [MONTHLY_SKU, ANNUAL_SKU];
    const fetched = await fetchProducts({ skus, type: "subs" });

    const subs: ProductSubscription[] = (fetched ?? []).filter(
      (p): p is ProductSubscription => p.type === "subs",
    );

    // Cache Android offer tokens for purchase flow
    for (const p of subs) {
      if (
        p.platform === "android" &&
        p.subscriptionOffers &&
        p.subscriptionOffers.length > 0
      ) {
        const token = p.subscriptionOffers[0].offerTokenAndroid;
        if (token) {
          _offerTokens.set(p.id, token);
        }
      }
    }

    _products = subs.map((p) => {
      const period: "monthly" | "annual" =
        p.id === ANNUAL_SKU ? "annual" : "monthly";
      return normalizeProduct(p, period);
    });

    _initialized = true;
  }

  getProducts(): Product[] {
    return _products;
  }

  async purchaseMonthly(): Promise<PurchaseResult> {
    return doPurchase(MONTHLY_SKU);
  }

  async purchaseAnnual(): Promise<PurchaseResult> {
    return doPurchase(ANNUAL_SKU);
  }

  async restorePurchases(): Promise<RestoreResult> {
    try {
      const purchases = await getAvailablePurchases();

      if (!purchases || purchases.length === 0) {
        return { success: false, receipt: null, expiryDate: null };
      }

      // Most recent purchase first
      const mostRecent = purchases.sort(
        (a, b) => b.transactionDate - a.transactionDate,
      )[0];

      const receipt = await extractReceipt(mostRecent);

      // Derive approximate expiry from transaction date + 30 days
      // (The server will provide the canonical expiry during validation)
      let expiryDate: Date | null = null;
      if (mostRecent.transactionDate) {
        expiryDate = new Date(
          mostRecent.transactionDate + 30 * 24 * 60 * 60 * 1000,
        );
      }

      return {
        success: true,
        receipt,
        expiryDate,
        platform: Platform.OS === "ios" ? "ios" : "android",
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        receipt: null,
        expiryDate: null,
        error: errorMessage,
      };
    }
  }

  async getCurrentReceipt(): Promise<string | null> {
    if (Platform.OS === "ios") {
      try {
        return await getReceiptDataIOS();
      } catch {
        return null;
      }
    }

    // Android — derive from available purchases
    try {
      const purchases = await getAvailablePurchases();
      if (purchases && purchases.length > 0) {
        const mostRecent = purchases.sort(
          (a, b) => b.transactionDate - a.transactionDate,
        )[0];
        return mostRecent.purchaseToken ?? null;
      }
    } catch {
      // Ignore
    }

    return null;
  }
}

// Singleton Export

export const iapBridge: IAPBridge = new NativeIAPBridge();

/**
 * Call during app teardown / unmount to release native resources.
 */
export function cleanupIAPBridge(): void {
  clearListeners();
  if (_initialized) {
    endConnection();
  }
  _initialized = false;
  _products = [];
  _offerTokens.clear();
}
