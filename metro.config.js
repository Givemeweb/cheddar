const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { resolveAppVariant } = require("./scripts/appVariant");

const { appVariant: APP_VARIANT } = resolveAppVariant();

// Swapping the whole module keeps the unselected provider (and its native SDK
// imports) out of the bundle graph, not just out of the runtime branch.
const PAYMENT_PROVIDERS = {
  store: path.resolve(__dirname, "src/payments/selectPaymentProvider.ts"),
  satsale: path.resolve(__dirname, "src/payments/satsale/SatSaleProvider.tsx"),
};

const config = getDefaultConfig(__dirname);

// Add wasm support for expo-sqlite on web
config.resolver.sourceExts = [...config.resolver.sourceExts, 'wasm'];
// Serve .wasm files as binary assets, not as source to transform
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

// Block sql.js from native builds (only used for web)
// sql.js uses Node.js APIs that don't exist in React Native
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@payment-provider") {
    return context.resolveRequest(
      context,
      PAYMENT_PROVIDERS[APP_VARIANT],
      platform,
    );
  }
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

// Terser options for non-Hermes bundles. Hermes release builds skip Metro's
// minifier, so babel.config.js also strips console calls in production.
config.transformer.minifierConfig = {
  ...(config.transformer.minifierConfig ?? {}),
  compress: {
    ...((config.transformer.minifierConfig ?? {}).compress ?? {}),
    drop_console: true,
  },
};

module.exports = withNativeWind(config, { input: "./global.css" });
