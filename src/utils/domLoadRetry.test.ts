import {
  DOM_LOAD_RETRY_BASE_DELAY_MS,
  DOM_LOAD_RETRY_MAX_ATTEMPTS,
  DOM_READY_MESSAGE_TYPE,
  domLoadRetryDelayMs,
  isDomReadyMessage,
  signalDomReady,
} from './domLoadRetry';

describe('domLoadRetryDelayMs', () => {
  it('doubles from the base delay: 8s, 16s, 32s, 64s, 128s', () => {
    expect(
      Array.from(
        { length: DOM_LOAD_RETRY_MAX_ATTEMPTS },
        (_unused, i) => domLoadRetryDelayMs(i + 1)
      )
    ).toEqual([
      DOM_LOAD_RETRY_BASE_DELAY_MS,
      DOM_LOAD_RETRY_BASE_DELAY_MS * 2,
      DOM_LOAD_RETRY_BASE_DELAY_MS * 4,
      DOM_LOAD_RETRY_BASE_DELAY_MS * 8,
      DOM_LOAD_RETRY_BASE_DELAY_MS * 16,
    ]);
  });

  it('is pure and deterministic', () => {
    expect(domLoadRetryDelayMs(1)).toBe(domLoadRetryDelayMs(1));
    expect(domLoadRetryDelayMs(2)).toBe(16000);
  });
});

describe('isDomReadyMessage', () => {
  it('accepts the ready message', () => {
    expect(
      isDomReadyMessage(JSON.stringify({ type: DOM_READY_MESSAGE_TYPE }))
    ).toBe(true);
  });

  it('rejects other messages and junk', () => {
    expect(isDomReadyMessage(JSON.stringify({ type: 'other' }))).toBe(false);
    expect(isDomReadyMessage('not json')).toBe(false);
    expect(isDomReadyMessage(null)).toBe(false);
    expect(isDomReadyMessage(undefined)).toBe(false);
    expect(isDomReadyMessage(42)).toBe(false);
  });
});

describe('signalDomReady', () => {
  const bridge = { postMessage: jest.fn() };
  // Fresh module per test: signalDomReady carries once-per-page-load state.
  const loadSignal = (): typeof signalDomReady =>
    require('./domLoadRetry').signalDomReady;

  beforeEach(() => {
    jest.resetModules();
    (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView =
      bridge;
    bridge.postMessage.mockClear();
  });

  it('posts the ready message exactly once per page load', () => {
    const signal = loadSignal();
    signal();
    signal();
    signal();
    expect(bridge.postMessage).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(bridge.postMessage.mock.calls[0][0]);
    expect(payload.type).toBe(DOM_READY_MESSAGE_TYPE);
    expect(isDomReadyMessage(bridge.postMessage.mock.calls[0][0])).toBe(true);
  });

  it('does nothing when the bridge interface is absent', () => {
    (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView =
      undefined;
    const signal = loadSignal();
    expect(() => signal()).not.toThrow();
    expect(bridge.postMessage).not.toHaveBeenCalled();
  });
});
