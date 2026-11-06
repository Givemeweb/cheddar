type ExpoConfig = {
  name: string;
  icon: string;
  version: string;
  ios: { bundleIdentifier: string };
  android: { package: string; versionCode: number };
  extra: { appVariant: string };
};

function loadConfig(
  variant?: string,
  env: Record<string, string | undefined> = {},
): ExpoConfig {
  const previousVariant = process.env.APP_VARIANT;
  const previousEnv = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );

  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  jest.resetModules();
  try {
    return require('../../app.config.js').expo as ExpoConfig;
  } finally {
    if (previousVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previousVariant;

    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('app config variants', () => {
  it('defaults to the store package', () => {
    const config = loadConfig();

    expect(config.android.package).toBe('com.cheddar.app');
    expect(config.ios.bundleIdentifier).toBe('com.cheddar.app');
    expect(config.extra.appVariant).toBe('store');
    expect(config.name).toBe('Cheddar');
    expect(config.icon).toBe('./assets/icon.png');
  });

  it('uses the bee package for the SatSale build', () => {
    const config = loadConfig('satsale');

    expect(config.android.package).toBe('com.cheddar.app.bee');
    expect(config.ios.bundleIdentifier).toBe('com.cheddar.app.bee');
    expect(config.extra.appVariant).toBe('satsale');
  });

  it('keeps the same name and icon for both builds', () => {
    const store = loadConfig('store');
    const satsale = loadConfig('satsale');

    expect(satsale.name).toBe(store.name);
    expect(satsale.icon).toBe(store.icon);
  });

  it('rejects an unknown variant', () => {
    expect(() => loadConfig('unknown')).toThrow('Unknown APP_VARIANT');
  });

  it('uses the release version and version code from the environment', () => {
    const config = loadConfig('satsale', {
      APP_VERSION: '1.2.3',
      APP_VERSION_CODE: '10203',
    });

    expect(config.version).toBe('1.2.3');
    expect(config.android.versionCode).toBe(10203);
  });

  it('keeps the default version for local builds', () => {
    const config = loadConfig('store', {
      APP_VERSION: undefined,
      APP_VERSION_CODE: undefined,
    });

    expect(config.version).toBe('1.0.0');
    expect(config.android.versionCode).toBe(1);
  });

  it('rejects a half-configured release version', () => {
    expect(() =>
      loadConfig('satsale', {
        APP_VERSION: '1.2.3',
        APP_VERSION_CODE: undefined,
      }),
    ).toThrow('must be set together');

    expect(() =>
      loadConfig('satsale', {
        APP_VERSION: undefined,
        APP_VERSION_CODE: '10203',
      }),
    ).toThrow('must be set together');
  });

  it('rejects version codes that do not match the version', () => {
    for (const versionCode of ['0', '2147483648', '1e3', '10204']) {
      expect(() =>
        loadConfig('satsale', {
          APP_VERSION: '1.2.3',
          APP_VERSION_CODE: versionCode,
        }),
      ).toThrow('does not match APP_VERSION');
    }
  });

  it('rejects empty release variables instead of falling back', () => {
    expect(() =>
      loadConfig('satsale', {
        APP_VERSION: '',
        APP_VERSION_CODE: '',
      }),
    ).toThrow('APP_VERSION');
  });
});
