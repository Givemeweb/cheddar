// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  // Node scripts and the jest setup file run outside the app bundle, so they
  // legitimately use CommonJS and their host's globals.
  {
    files: ["scripts/**/*.js", "jest.setup.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        jest: "readonly",
      },
    },
  },
  // Jest module mocking requires runtime require() (resetModules + fresh
  // require, jest.mock factories), so plain imports cannot replace it here.
  {
    files: ["**/*.test.{js,jsx,ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
