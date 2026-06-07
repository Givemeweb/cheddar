import { Platform } from "react-native";
import { subscriptionCore } from "./subscriptionCore";

export type SubscriptionEvent =
  | "paywall_viewed"
  | "paywall_dismissed"
  | "purchase_initiated"
  | "purchase_completed"
  | "purchase_failed"
  | "purchase_cancelled"
  | "restore_initiated"
  | "restore_completed"
  | "restore_failed"
  | "subscription_status_refreshed";

interface EventPayload {
  event: SubscriptionEvent;
  feature?: string;
  tier?: "monthly" | "annual" | null;
  platform: string;
  anonymousUserId: string | null;
  error?: string;
  timestamp: string;
}

// Umami tracking endpoint (configured via env)
const UMAMI_ENDPOINT = process.env.EXPO_PUBLIC_UMAMI_ENDPOINT ?? "";
const UMAMI_WEBSITE_ID = process.env.EXPO_PUBLIC_UMAMI_WEBSITE_ID ?? "";

/**
 * Track a subscription-related event in Umami analytics.
 * Events are sent asynchronously without blocking the UI.
 * Network errors during tracking are silently ignored.
 */
export async function trackSubscriptionEvent(
  event: SubscriptionEvent,
  context?: {
    feature?: string;
    tier?: "monthly" | "annual" | null;
    error?: string;
  },
): Promise<void> {
  const payload: EventPayload = {
    event,
    feature: context?.feature,
    tier: context?.tier ?? null,
    platform: Platform.OS,
    anonymousUserId: subscriptionCore.getAnonymousUserId(),
    error: context?.error,
    timestamp: new Date().toISOString(),
  };

  // Fire-and-forget: don't block UI for analytics
  sendEvent(payload).catch(() => {
    // Silently ignore tracking errors
  });
}

async function sendEvent(payload: EventPayload): Promise<void> {
  if (!UMAMI_ENDPOINT || !UMAMI_WEBSITE_ID) {
    // Umami not configured — log in dev mode only
    if (__DEV__) {
      console.log("[Umami]", payload.event, payload);
    }
    return;
  }

  const response = await fetch(`${UMAMI_ENDPOINT}/api/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "event",
      payload: {
        website: UMAMI_WEBSITE_ID,
        name: payload.event,
        data: {
          feature: payload.feature ?? "",
          tier: payload.tier ?? "",
          platform: payload.platform,
          anonymousUserId: payload.anonymousUserId ?? "",
          error: payload.error ?? "",
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Umami tracking failed: ${response.status}`);
  }
}
