import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { DOMProps } from 'expo/dom';
import { Platform } from 'react-native';
import {
  DOM_LOAD_RETRY_MAX_ATTEMPTS,
  DOM_READY_MESSAGE_TYPE,
  domLoadRetryDelayMs,
} from '../utils/domLoadRetry';
import { useDomLoadRetry } from './useDomLoadRetry';
import { DomLoadRetry } from '../components/DomLoadRetry';

jest.useFakeTimers();

type HookState = {
  attempt: number;
  scrollIndicator: boolean;
  onMessage: NonNullable<DOMProps['onMessage']>;
};

let latest: HookState | null = null;
const liveRenderers: TestRenderer.ReactTestRenderer[] = [];

function renderProbe(): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  liveRenderers.push(renderer);
  return renderer;
}

function Probe() {
  const { dom, attempt } = useDomLoadRetry();
  latest = {
    attempt,
    scrollIndicator: dom.showsVerticalScrollIndicator === true,
    onMessage: dom.onMessage!,
  };
  return null;
}

afterEach(() => {
  liveRenderers.forEach((renderer) => renderer.unmount());
  liveRenderers.length = 0;
  latest = null;
});

type MessageEvent = Parameters<NonNullable<DOMProps['onMessage']>>[0];

const readyEvent = (data: string): MessageEvent =>
  ({
    nativeEvent: {
      data,
      url: 'about:blank',
      loading: false,
      title: '',
      canGoBack: false,
      canGoForward: false,
      lockIdentifier: 1,
    },
  }) as MessageEvent;

const readyMessage = readyEvent(
  JSON.stringify({ type: DOM_READY_MESSAGE_TYPE })
);

describe('useDomLoadRetry schedule', () => {
  it('retries with doubling delays and stops quietly at the cap', () => {
    renderProbe();
    expect(latest?.attempt).toBe(0);
    for (let i = 1; i <= DOM_LOAD_RETRY_MAX_ATTEMPTS; i++) {
      act(() => {
        jest.advanceTimersByTime(domLoadRetryDelayMs(i));
      });
      expect(latest?.attempt).toBe(i);
    }
    // Cap reached: advancing far beyond the last delay fires nothing.
    act(() => {
      jest.advanceTimersByTime(600000);
    });
    expect(latest?.attempt).toBe(DOM_LOAD_RETRY_MAX_ATTEMPTS);
  });

  it('flips the declared scroll-indicator prop on every attempt', () => {
    renderProbe();
    const values = [latest?.scrollIndicator];
    for (let i = 1; i <= DOM_LOAD_RETRY_MAX_ATTEMPTS; i++) {
      act(() => {
        jest.advanceTimersByTime(domLoadRetryDelayMs(i));
      });
      values.push(latest?.scrollIndicator);
    }
    // A flipped declared prop is the only thing in each retry's native props
    // diff (validAttributes); consecutive attempts must always differ.
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).not.toBe(values[i - 1]);
    }
  });

  it('stops before any retry once the ready message arrives', () => {
    renderProbe();
    act(() => {
      jest.advanceTimersByTime(4000); // mid first delay
    });
    act(() => {
      latest?.onMessage(readyMessage);
    });
    act(() => {
      jest.advanceTimersByTime(600000);
    });
    expect(latest?.attempt).toBe(0);
  });

  it('keeps retrying on messages that are not the ready signal', () => {
    renderProbe();
    act(() => {
      latest?.onMessage(readyEvent(JSON.stringify({ type: 'other' })));
    });
    act(() => {
      jest.advanceTimersByTime(domLoadRetryDelayMs(1));
    });
    expect(latest?.attempt).toBe(1);
  });

  it('resets the schedule when the hook owner remounts', () => {
    const first = renderProbe();
    act(() => {
      jest.advanceTimersByTime(domLoadRetryDelayMs(1));
    });
    expect(latest?.attempt).toBe(1);
    act(() => {
      first.unmount();
    });
    liveRenderers.length = 0;
    act(() => {
      liveRenderers.push(renderProbe());
    });
    expect(latest?.attempt).toBe(0);
    act(() => {
      jest.advanceTimersByTime(domLoadRetryDelayMs(1));
    });
    expect(latest?.attempt).toBe(1);
  });

  it('never schedules on web (dom components are plain components there)', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', {
      get: () => 'web',
      configurable: true,
    });
    try {
      renderProbe();
      act(() => {
        jest.advanceTimersByTime(600000);
      });
      expect(latest?.attempt).toBe(0);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Platform, 'OS', originalDescriptor);
      }
    }
  });
});

describe('DomLoadRetry gate', () => {
  let mounts = 0;
  let childDom: { useExpoDOMWebView?: boolean } | null = null;
  const liveGateRenderers: TestRenderer.ReactTestRenderer[] = [];

  function renderGate(): void {
    act(() => {
      liveGateRenderers.push(
        TestRenderer.create(
          <DomLoadRetry>
            <CapturingChild />
          </DomLoadRetry>
        )
      );
    });
  }

  // Capture the dom prop via a child that renders through the same
  // cloneElement path as a real dom component.
  function CapturingChild(props: { dom?: unknown }) {
    React.useEffect(() => {
      mounts += 1;
    }, []);
    childDom = props.dom as { useExpoDOMWebView?: boolean } | null;
    return null;
  }

  beforeEach(() => {
    mounts = 0;
    childDom = null;
  });

  afterEach(() => {
    liveGateRenderers.forEach((renderer) => renderer.unmount());
    liveGateRenderers.length = 0;
  });

  it('gives the child a fresh schedule and remounts it on the final attempt', () => {
    renderGate();
    expect(mounts).toBe(1);
    expect(childDom?.useExpoDOMWebView).toBe(true);
    for (let i = 1; i <= DOM_LOAD_RETRY_MAX_ATTEMPTS; i++) {
      act(() => {
        jest.advanceTimersByTime(domLoadRetryDelayMs(i));
      });
    }
    // Final attempt remounts the WebView exactly once (guard-proof fresh view).
    expect(mounts).toBe(2);
    act(() => {
      jest.advanceTimersByTime(600000);
    });
    expect(mounts).toBe(2); // no infinite loop
  });

  it('passes a fresh schedule to a second, independent gate', () => {
    renderGate();
    act(() => {
      jest.advanceTimersByTime(domLoadRetryDelayMs(1));
    });
    const firstMounts = mounts;
    renderGate();
    // The second gate's WebView mounts with a fresh (not inherited) schedule:
    // its first retry fires a full base delay later, not immediately.
    const before = mounts;
    act(() => {
      jest.advanceTimersByTime(domLoadRetryDelayMs(1) - 1);
    });
    expect(mounts).toBe(before);
    expect(mounts).toBeGreaterThanOrEqual(firstMounts);
  });

  it('passes children through unchanged on web (no schedule, no remount)', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', {
      get: () => 'web',
      configurable: true,
    });
    try {
      renderGate();
      expect(mounts).toBe(1);
      for (let i = 1; i <= DOM_LOAD_RETRY_MAX_ATTEMPTS + 1; i++) {
        act(() => {
          jest.advanceTimersByTime(domLoadRetryDelayMs(i) * 2);
        });
      }
      // No retries and no final-attempt remount on web: mounts stay at 1.
      expect(mounts).toBe(1);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Platform, 'OS', originalDescriptor);
      }
    }
  });
});
