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
