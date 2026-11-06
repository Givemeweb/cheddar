module.exports = function (api) {
  const isProduction = api.env("production");
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Hermes release builds skip Metro's JS minifier, so console stripping
      // has to happen here rather than in metro.config.js.
      ...(isProduction ? ["transform-remove-console"] : []),
      "react-native-reanimated/plugin",
    ],
  };
};