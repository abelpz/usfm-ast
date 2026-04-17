/**
 * Capacitor key-value adapter backed by `@capacitor/preferences`.
 *
 * `Preferences.get/set/remove` are async wrappers around:
 * - Android: SharedPreferences
 * - iOS: NSUserDefaults
 *
 * NOTE: Only available inside a Capacitor runtime.
 */
import type { KeyValueAdapter } from '../interfaces/kv-adapter';

export class CapacitorKeyValueAdapter implements KeyValueAdapter {
  private readonly group: string | undefined;

  /**
   * @param group Optional preference group (namespace). When set, all keys are
   *   scoped to this group (Capacitor Preferences `group` option).
   */
  constructor(group?: string) {
    this.group = group;
  }

  async get(key: string): Promise<string | null> {
    const { Preferences } = await import('@capacitor/preferences');
    const result = await Preferences.get({ key, ...(this.group ? { group: this.group } : {}) });
    return result.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value, ...(this.group ? { group: this.group } : {}) });
  }

  async remove(key: string): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key, ...(this.group ? { group: this.group } : {}) });
  }

  async clear(): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.clear({ ...(this.group ? { group: this.group } : {}) });
  }

  /** Capacitor preferences are async-only — always returns null. Use `get()` for reliable reads. */
  getSync(_key: string): string | null {
    return null;
  }
}
