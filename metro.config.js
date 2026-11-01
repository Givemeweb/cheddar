const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Add wasm support for expo-sqlite on web
config.resolver.sourceExts = [...config.resolver.sourceExts, 'wasm'];
// Serve .wasm files as binary assets, not as source to transform
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

// Block sql.js from native builds (only used for web)
// sql.js uses Node.js APIs that don't exist in React Native
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Block sql.js and its dependencies from native platforms
  if (platform !== 'web' && (moduleName === 'sql.js' || moduleName.startsWith('sql.js/'))) {
    return { type: 'empty' };
  }
  // Block node: protocol imports on native platforms
  if (platform !== 'web' && moduleName.startsWith('node:')) {
    return { type: 'empty' };
  }
  // Use default resolution for everything else
  return context.resolveRequest(context, moduleName, platform);
};

// Strip console.* calls from release bundles. Metro only runs the minifier for
// production builds, so development keeps its logs.
config.transformer.minifierConfig = {
  ...(config.transformer.minifierConfig ?? {}),
  compress: {
    ...((config.transformer.minifierConfig ?? {}).compress ?? {}),
    drop_console: true,
  },
};

module.exports = withNativeWind(config, { input: "./global.css" });