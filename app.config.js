const { resolveAppVariant } = require('./scripts/appVariant');

const {
  appVariant,
  bundleIdentifier,
  package: packageName,
} = resolveAppVariant();

module.exports = {
  expo: {
    name: 'Cheddar',
    slug: 'cheddar',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    scheme: 'cheddar',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'cover',
      backgroundColor: '#1E2125',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1E2125',
      },
      edgeToEdgeEnabled: true,
      package: packageName,
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      [
        'expo-router',
        {
          headers: {
            'Cross-Origin-Embedder-Policy': 'credentialless',
            'Cross-Origin-Opener-Policy': 'same-origin',
          },
        },
      ],
      'expo-sqlite',
      [
        'expo-image-picker',
        {
          microphonePermission: false,
        },
      ],
      '@react-native-community/datetimepicker',
      'expo-localization',
      'expo-sharing',
    ],
    extra: {
      appVariant,
    },
  },
};
