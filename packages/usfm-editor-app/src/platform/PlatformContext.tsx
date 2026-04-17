import type { PlatformAdapter } from '@usfm-tools/platform-adapters';
import { createContext, useContext, type ReactNode } from 'react';

const PlatformContext = createContext<PlatformAdapter | null>(null);

export function PlatformProvider({
  adapter,
  children,
}: {
  adapter: PlatformAdapter;
  children: ReactNode;
}) {
  return <PlatformContext.Provider value={adapter}>{children}</PlatformContext.Provider>;
}

/**
 * Access the current platform adapter. Must be called inside a
 * `<PlatformProvider>`. Throws if no provider is found so misconfiguration
 * fails fast rather than silently.
 */
export function usePlatform(): PlatformAdapter {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error(
      'usePlatform() must be used inside <PlatformProvider>. ' +
        'Wrap your app root with <PlatformProvider adapter={...}>.',
    );
  }
  return ctx;
}

/**
 * Convenience hook that returns only the key-value adapter.
 * Useful when a component only needs settings storage.
 */
export function useKV() {
  return usePlatform().kv;
}

/**
 * Convenience hook that returns only the network adapter.
 */
export function useNetwork() {
  return usePlatform().network;
}
