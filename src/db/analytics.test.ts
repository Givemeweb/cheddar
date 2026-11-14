import {
  getAnalyticsId,
  isAnalyticsEnabled,
  setAnalyticsEnabled,
} from './analytics';
import { isDatabaseReady, saveStore } from './tinybase';

// jest.setup mocks this module so other suites can import it without pulling
// TinyBase's ESM build. This suite exercises the real implementation.
jest.unmock('./analytics');

jest.mock('./tinybase', () => {
  const values: Record<string, unknown> = {};
  const store = {
    getValue: (key: string) => values[key],
    setValue: (key: string, value: unknown) => {
      values[key] = value;
    },
    delValue: (key: string) => {
      delete values[key];
    },
  };
  return {
    isDatabaseReady: jest.fn(() => true),
    getStore: jest.fn(() => store),
    saveStore: jest.fn(async () => {}),
  };
});

const saveStoreMock = saveStore as jest.Mock;
const isDatabaseReadyMock = isDatabaseReady as jest.Mock;

describe('analytics storage', () => {
  it('creates one anonymous id and reuses it', () => {
    const first = getAnalyticsId();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(getAnalyticsId()).toBe(first);
    expect(saveStoreMock).toHaveBeenCalled();
  });

  it('defaults to enabled and persists the opt-out', async () => {
    expect(isAnalyticsEnabled()).toBe(true);
    await setAnalyticsEnabled(false);
    expect(isAnalyticsEnabled()).toBe(false);
    await setAnalyticsEnabled(true);
    expect(isAnalyticsEnabled()).toBe(true);
  });

  it('rejects the opt-out when the database is not ready', async () => {
    isDatabaseReadyMock.mockReturnValueOnce(false);
    await expect(setAnalyticsEnabled(false)).rejects.toThrow(
      'Database not ready',
    );
  });
});
