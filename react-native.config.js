const { resolveAppVariant } = require('./scripts/appVariant');

const { appVariant } = resolveAppVariant();

/**
 * React Native module autolinking is evaluated by Expo at native build time.
 * The SatSale build has no RevenueCat SDK, so keep it out of the generated
 * Android and iOS projects for that variant.
 */
module.exports = {
  dependencies:
    appVariant === 'satsale'
      ? {
          'react-native-purchases': {
            platforms: {
              android: null,
              ios: null,
            },
          },
        }
      : {},
};
