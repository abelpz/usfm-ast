declare module '@tauri-apps/plugin-store' {
  export interface Store {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    save(): Promise<void>;
  }
  export function load(path: string, options?: { autoSave?: number }): Promise<Store>;
}
