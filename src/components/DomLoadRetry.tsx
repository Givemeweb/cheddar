import { cloneElement, type ReactElement } from 'react';
import { Platform } from 'react-native';
import { DOM_LOAD_RETRY_MAX_ATTEMPTS } from '../utils/domLoadRetry';
import { useDomLoadRetry } from '../hooks/useDomLoadRetry';

// Owns ONE retry schedule for ONE dom WebView: render one gate around each
// 'use dom' component. Remounting the gate starts a fresh schedule with a
// fresh WebView (hook state lives and dies with the gate instance).
//
// On the final attempt the child remounts under a new key: a brand-new
// WebView has url == null, so the guard inside DomWebView.reload()
// (source?.uri != webView.url) cannot skip the load even when an earlier
// attempt failed after navigation (the failure where webView.url ends up
// equal to the source). The fresh view's own mount fires reload() and loads.
//
// On web, 'use dom' components are ordinary components (no native WebView, no
// bridge): the hook never schedules there, so the child is passed through
// with an inert dom prop - no retries, no remount, no flash.
export function DomLoadRetry({ children }: { children: ReactElement<any> }) {
  const { dom, attempt } = useDomLoadRetry();
  if (Platform.OS === 'web') {
    return children;
  }
  return cloneElement(children, {
    dom,
    key:
      attempt >= DOM_LOAD_RETRY_MAX_ATTEMPTS ? 'dom-load-remount' : undefined,
  });
}
