const APP_VARIANTS = {
  store: {
    bundleIdentifier: 'com.cheddar.app',
    package: 'com.cheddar.app',
  },
  satsale: {
    bundleIdentifier: 'com.cheddar.app.bee',
    package: 'com.cheddar.app.bee',
  },
};

/**
 * Resolves APP_VARIANT for app config, Metro, and native autolinking. All
 * three must agree, so an unknown value fails loudly instead of falling back
 * to the store build in only one of them.
 */
function resolveAppVariant(value = process.env.APP_VARIANT) {
  const appVariant = value ?? 'store';

  if (!Object.hasOwn(APP_VARIANTS, appVariant)) {
    throw new Error(
      `Unknown APP_VARIANT "${appVariant}". Use "store" or "satsale".`,
    );
  }

  return { appVariant, ...APP_VARIANTS[appVariant] };
}

module.exports = { resolveAppVariant };
