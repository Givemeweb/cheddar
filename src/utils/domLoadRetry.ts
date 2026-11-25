// Self-healing load for expo 'use dom' components (see
// docs/webview-blank-pie-diagnosis.md): a WebView whose first load never
// starts stays blank forever - the native side has no retry. The retry works
// by flipping the DECLARED native prop showsVerticalScrollIndicator inside the
// component's `dom` prop: each flip is a real change in RN's props diff
// (validAttributes), so it reaches the native view, where every prop update
// fires OnViewDidUpdateProps -> reload(), whose guard only calls loadUrl while
// webView.url differs from the source. So a dead WebView is reloaded and an
// already-loaded one is a no-op (no flicker on healthy loads).

// First check happens after this delay: short enough to feel responsive,
// long enough that a slow-but-healthy Metro load (multi-MB dev bundle) is
// never interrupted by a retry.
export const DOM_LOAD_RETRY_BASE_DELAY_MS = 8000;
// A handful of attempts, doubling backoff (8s, 16s, 32s, 64s, 128s), then
// stop quietly: no infinite loop, no error UI.
export const DOM_LOAD_RETRY_MAX_ATTEMPTS = 5;

export function domLoadRetryDelayMs(attempt: number): number {
  return DOM_LOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

// The load-started signal: each dom component posts this from inside the
// WebView once the real DOM bundle is running (not just a page shell), and
// the native side stops retrying on receipt.
export const DOM_READY_MESSAGE_TYPE = 'cheddar:dom-ready';

export function isDomReadyMessage(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  try {
    const parsed = JSON.parse(data);
    return parsed?.type === DOM_READY_MESSAGE_TYPE;
  } catch {
    return false;
  }
}

// Page-side (runs inside the dom WebView; globalThis === window there, where
// the ReactNativeWebView javascript interface is always present). Module state
// keeps it once-per-page-load, so retries that reload the page re-signal.
let signaled = false;

export function signalDomReady(): void {
  if (signaled) return;
  signaled = true;
  const bridge = (globalThis as {
    ReactNativeWebView?: { postMessage?: (data: string) => void };
  }).ReactNativeWebView;
  bridge?.postMessage?.(JSON.stringify({ type: DOM_READY_MESSAGE_TYPE }));
}
