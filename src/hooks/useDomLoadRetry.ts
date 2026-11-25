import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { DOMProps } from 'expo/dom';
import {
  DOM_LOAD_RETRY_MAX_ATTEMPTS,
  domLoadRetryDelayMs,
  isDomReadyMessage,
} from '../utils/domLoadRetry';

// After mount, a dom WebView whose first load never starts stays blank for
// the whole session: nothing retries it (see
// docs/webview-blank-pie-diagnosis.md). This hook schedules capped, backed-off
// retries. The mechanism must survive RN's prop diffing, which only walks the
// view config's declared props: `showsVerticalScrollIndicator` IS declared on
// expo's DomWebView (DomWebViewModule.kt), so flipping it per attempt puts a
// real change in every diff -> updateProperties -> onAfterUpdateTransaction ->
// OnViewDidUpdateProps -> DomWebView.reload(). reload()'s guard
// (source?.uri != webView.url) re-fires loadUrl while the load never started
// and is a no-op once the page is up. Bumping an undeclared prop instead would
// be dropped from the diff and never fire anything.
//
// On web, 'use dom' components are ordinary components (no native WebView, no
// bridge): the ready signal could never arrive, so the schedule never runs
// there and the gate passes the child through unchanged.
export function useDomLoadRetry(): { dom: DOMProps; attempt: number } {
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web' || ready || attempt >= DOM_LOAD_RETRY_MAX_ATTEMPTS) {
      return;
    }
    const timer = setTimeout(
      () => setAttempt((current) => current + 1),
      domLoadRetryDelayMs(attempt + 1)
    );
    return () => clearTimeout(timer);
  }, [ready, attempt]);

  const onMessage = useCallback((event: { nativeEvent: { data: unknown } }) => {
    if (isDomReadyMessage(event?.nativeEvent?.data)) setReady(true);
  }, []);

  return {
    dom: {
      useExpoDOMWebView: true,
      // Declared native prop flipped per attempt: the only change in the
      // props diff, and the thing that makes OnViewDidUpdateProps fire.
      showsVerticalScrollIndicator: attempt % 2 === 1,
      onMessage,
    },
    attempt,
  };
}
