// Keep the SatSale API tests independent of the developer's .env or shell.
// api.ts captures these two values in module constants at import time, so an
// exported staging URL would otherwise change the URLs asserted by the suite.
delete process.env.EXPO_PUBLIC_SATSALE_API_URL;
delete process.env.EXPO_PUBLIC_SATSALE_STAGING_API_URL;

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
