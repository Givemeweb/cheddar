type ExpoConfig = {
  name: string;
  icon: string;
  ios: { bundleIdentifier: string };
  android: { package: string };
  extra: { appVariant: string };
};

function loadConfig(variant?: string): ExpoConfig {
  const previous = process.env.APP_VARIANT;
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;

  jest.resetModules();
  try {
    return require('../../app.config.js').expo as ExpoConfig;
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
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
});
