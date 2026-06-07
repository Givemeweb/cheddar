// ---------------------------------------------------------------------------
// Web IAP Bridge Implementation
// ---------------------------------------------------------------------------
// Web does not support native IAP. In __DEV__ we return mock data;
// in production every method throws.
// ---------------------------------------------------------------------------

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

// SKU Configuration (same defaults as native)
const MONTHLY_SKU =
  process.env.EXPO_PUBLIC_IAP_MONTHLY_SKU ?? "cheddar_premium_monthly";
const ANNUAL_SKU =
  process.env.EXPO_PUBLIC_IAP_ANNUAL_SKU ?? "cheddar_premium_annual";

function getMockProducts(): Product[] {
  return [
    {
      sku: MONTHLY_SKU,
      localizedPrice: "$4.99",
      price: 4.99,
      currency: "USD",
      description: "Cheddar Premium Monthly",
      title: "Cheddar Premium Monthly",
      period: "monthly",
    },
    {
      sku: ANNUAL_SKU,
      localizedPrice: "$39.99",
      price: 39.99,
      currency: "USD",
      description: "Cheddar Premium Annual",
      title: "Cheddar Premium Annual",
      period: "annual",
    },
  ];
}

function getMockReceipt(): string {
  return `mock-receipt-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mock bridge (dev mode)

class MockIAPBridge implements IAPBridge {
  private _mockProducts: Product[] = getMockProducts();

  async initialize(): Promise<void> {
    await delay(1000);
  }

  getProducts(): Product[] {
    return this._mockProducts;
  }

  async purchaseMonthly(): Promise<PurchaseResult> {
    await delay(1000);
    return {
      success: true,
      receipt: getMockReceipt(),
      transactionId: `mock-tx-${Date.now()}`,
    };
  }

  async purchaseAnnual(): Promise<PurchaseResult> {
    await delay(1000);
    return {
      success: true,
      receipt: getMockReceipt(),
      transactionId: `mock-tx-${Date.now()}`,
    };
  }

  async restorePurchases(): Promise<RestoreResult> {
    await delay(1000);
    // In mock mode, simulate no previous purchases
    return {
      success: false,
      receipt: null,
      expiryDate: null,
    };
  }

  async getCurrentReceipt(): Promise<string | null> {
    return null;
  }
}

// Production web bridge (throws)

class WebIAPBridge implements IAPBridge {
  private _throw(): never {
    throw new Error("IAP is not supported on web");
  }

  async initialize(): Promise<void> {
    this._throw();
  }

  getProducts(): Product[] {
    this._throw();
  }

  async purchaseMonthly(): Promise<PurchaseResult> {
    this._throw();
  }

  async purchaseAnnual(): Promise<PurchaseResult> {
    this._throw();
  }

  async restorePurchases(): Promise<RestoreResult> {
    this._throw();
  }

  async getCurrentReceipt(): Promise<string | null> {
    this._throw();
  }
}

// Singleton Export

function createBridge(): IAPBridge {
  if (__DEV__) {
    return new MockIAPBridge();
  }
  return new WebIAPBridge();
}

export const iapBridge: IAPBridge = createBridge();

/**
 * No-op on web.
 */
export function cleanupIAPBridge(): void {
  // Nothing to clean up on web
}
