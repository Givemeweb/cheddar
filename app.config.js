const { resolveAppVariant } = require('./scripts/appVariant');
const { parseReleaseTag } = require('./scripts/releaseVersion');

const {
  appVariant,
  bundleIdentifier,
  package: packageName,
} = resolveAppVariant();

// Release tags set both values (see scripts/releaseVersion.js). Local builds
// keep the original 1.0.0 / 1 pair when neither variable is present.
const versionDefined = process.env.APP_VERSION !== undefined;
const versionCodeDefined = process.env.APP_VERSION_CODE !== undefined;

if (versionDefined !== versionCodeDefined) {
  throw new Error('APP_VERSION and APP_VERSION_CODE must be set together.');
}

let version = '1.0.0';
let versionCode = 1;

if (versionDefined) {
  const versionFromEnv = process.env.APP_VERSION;
  const versionCodeFromEnv = process.env.APP_VERSION_CODE;
  let release;

  try {
    release = parseReleaseTag(`satsale-v${versionFromEnv}`);
  } catch (error) {
    throw new Error(
      `APP_VERSION "${versionFromEnv}" is invalid: ${error.message}`,
    );
  }

  if (versionCodeFromEnv !== String(release.versionCode)) {
    throw new Error(
      `APP_VERSION_CODE "${versionCodeFromEnv}" does not match APP_VERSION "${release.version}" (expected ${release.versionCode}).`,
    );
  }

  version = release.version;
  versionCode = release.versionCode;
}

module.exports = {
  expo: {
    name: 'Cheddar',
    slug: 'cheddar',
    version,
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
      versionCode,
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
