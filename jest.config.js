/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'jest-expo/ios',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^test-renderer$': '<rootDir>/node_modules/react-test-renderer',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
