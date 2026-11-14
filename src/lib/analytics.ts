import Constants from 'expo-constants';
import { getLocales } from 'expo-localization';
import { Dimensions, Platform } from 'react-native';
import { getAnalyticsId, isAnalyticsEnabled } from '../db/analytics';

const UMAMI_URL = process.env.EXPO_PUBLIC_UMAMI_URL?.replace(/\/+$/, '');
const WEBSITE_ID = process.env.EXPO_PUBLIC_UMAMI_WEBSITE_ID;

/** Screen the user last focused, so events attribute to the right page. */
let currentScreen = '/';

const APP_NAME = 'cheddar';
const RAW_VARIANT = (
  Constants.expoConfig?.extra as { appVariant?: unknown } | undefined
)?.appVariant;
const VARIANT = typeof RAW_VARIANT === 'string' ? RAW_VARIANT : 'store';

type AnalyticsData = Record<string, string | number | boolean>;

const normalizeScreen = (screen: string) =>
  screen.startsWith('/') ? screen : `/${screen}`;

/**
 * Umami's browser/os/device dims come from parsing the user agent, which is
 * meaningless for native apps (CFNetwork / okhttp). Send them explicitly;
 * on web the real browser UA is parseable, so let Umami do it.
 */
const deviceProps = () => {
  switch (Platform.OS) {
    case 'web':
      return {};
    case 'ios':
      return { browser: 'App', os: 'iOS', device: 'mobile' };
    case 'android':
      return { browser: 'App', os: 'Android', device: 'mobile' };
    default:
      return { browser: 'App', os: Platform.OS, device: 'desktop' };
  }
};

/**
 * Umami only registers events with a browser-like User-Agent (RN's default
 * bare "okhttp" gets a 200 `{"beep":"boop"}` but is silently dropped), so send
 * a platform-realistic browser UA. Browsers refuse to let fetch override the
 * UA header, so on web send none — the real one already parses correctly.
 */
const USER_AGENT = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
};

const NATIVE_USER_AGENT =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? USER_AGENT[Platform.OS]
    : undefined;

const send = (event: {
  name?: string;
  url: string;
  screen?: string;
  data?: AnalyticsData;
}) => {
  try {
    // No-op (silent) when not configured — dev builds and previews skip.
    if (!UMAMI_URL || !WEBSITE_ID) return;
    // Opt-out stops everything, including the anonymous id.
    if (!isAnalyticsEnabled()) return;

    const id = getAnalyticsId();
    if (!id) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    fetch(`${UMAMI_URL}/api/send`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(NATIVE_USER_AGENT ? { 'user-agent': NATIVE_USER_AGENT } : {}),
      },
      // Server expects Umami's v2 wrapped format: {type, payload}.
      body: JSON.stringify({
        type: 'event',
        payload: {
          website: WEBSITE_ID,
          id,
          name: event.name,
          url: event.url,
          hostname: 'app',
          language: getLocales()[0]?.languageCode ?? 'en',
          screen: event.screen,
          ...deviceProps(),
          data: {
            ...event.data,
            platform: Platform.OS,
            app: APP_NAME,
            variant: VARIANT,
          },
        },
      }),
    })
      .then((response) => {
        if (__DEV__ && !response.ok) {
          console.warn(
            `[analytics] Umami rejected ${event.name ?? 'pageview'} (${response.status})`,
          );
        }
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn('[analytics] Umami request failed', error);
        }
      })
      .finally(() => clearTimeout(timeout));
  } catch (error) {
    // Analytics must never break the app; still surface bugs in dev builds.
    if (__DEV__) {
      console.warn('[analytics] Failed to build the Umami payload', error);
    }
  }
};

/** Page view. Fires from the root layout on every pathname change. */
export const trackScreenView = (screen: string) => {
  currentScreen = normalizeScreen(screen);
  const { width, height } = Dimensions.get('screen');
  send({
    url: currentScreen,
    screen: `${Math.round(width)}x${Math.round(height)}`,
  });
};

/**
 * Custom event, attributed to the last focused screen unless `screen` is
 * passed explicitly (mount-time events can beat the root tracker).
 */
export const trackEvent = (
  name: string,
  data?: AnalyticsData,
  screen?: string,
) => {
  if (__DEV__ && data) {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.length > 40) {
        console.warn(
          `[analytics] "${key}" looks like free text; review the ${name} payload.`,
        );
      }
    }
  }

  send({
    name,
    url: screen ? normalizeScreen(screen) : currentScreen,
    data,
  });
};
