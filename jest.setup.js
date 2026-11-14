// Keep the SatSale API tests independent of the developer's .env or shell.
// api.ts captures these two values in module constants at import time, so an
// exported staging URL would otherwise change the URLs asserted by the suite.
delete process.env.EXPO_PUBLIC_SATSALE_API_URL;
delete process.env.EXPO_PUBLIC_SATSALE_STAGING_API_URL;

// Analytics must never reach the network from tests. Clearing the config makes
// every tracking call a no-op; the storage module is mocked below so importing
// analytics does not pull TinyBase's ESM build into Jest.
delete process.env.EXPO_PUBLIC_UMAMI_URL;
delete process.env.EXPO_PUBLIC_UMAMI_WEBSITE_ID;
delete process.env.EXPO_PUBLIC_UMAMI_DASHBOARD_URL;

jest.mock('./src/db/analytics', () => ({
  getAnalyticsId: () => 'test-analytics-id',
  isAnalyticsEnabled: () => true,
  setAnalyticsEnabled: jest.fn(async () => {}),
}));

// EXPO_PUBLIC_* values can be inlined at transform time, so deleting the env
// vars above is not enough on its own. Fail any accidental network call.
global.fetch = jest.fn(() =>
  Promise.reject(new Error('Network access is not allowed in tests')),
);

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    exists: true,
    size: 1024,
  })),
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  const memory = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key) => memory[key] ?? null),
      setItem: jest.fn(async (key, value) => {
        memory[key] = value;
      }),
      removeItem: jest.fn(async (key) => {
        delete memory[key];
      }),
    },
  };
});
