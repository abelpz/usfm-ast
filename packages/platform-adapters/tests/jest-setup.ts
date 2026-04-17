/**
 * Jest setup for @usfm-tools/platform-adapters tests.
 * Mocks browser globals (localStorage, navigator, window events) in the
 * Node test environment so web adapter tests can run without a real browser.
 */

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------
const store: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string): string | null => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = String(value); },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (index: number): string | null => Object.keys(store)[index] ?? null,
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ---------------------------------------------------------------------------
// navigator.onLine mock
// ---------------------------------------------------------------------------
Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  writable: true,
});

// ---------------------------------------------------------------------------
// window event listeners mock
// ---------------------------------------------------------------------------
const eventListeners: Record<string, Array<() => void>> = {};

const windowMock = {
  addEventListener: (event: string, cb: () => void) => {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event]!.push(cb);
  },
  removeEventListener: (event: string, cb: () => void) => {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event]!.filter((fn) => fn !== cb);
    }
  },
  dispatchEvent: (event: { type: string } | Event) => {
    const type = (event as { type: string }).type;
    eventListeners[type]?.forEach((cb) => cb());
    return true;
  },
};

Object.defineProperty(global, 'window', {
  value: windowMock,
  writable: true,
});

// Reset localStorage store before each test.
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  Object.keys(eventListeners).forEach((k) => delete eventListeners[k]);
  (global.navigator as { onLine: boolean }).onLine = true;
});
