const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Add wasm support for expo-sqlite on web
config.resolver.sourceExts = [...config.resolver.sourceExts, 'wasm'];

module.exports = withNativeWind(config, { input: "./global.css" });