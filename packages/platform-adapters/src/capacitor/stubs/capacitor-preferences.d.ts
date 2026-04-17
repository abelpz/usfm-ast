declare module '@capacitor/preferences' {
  export interface GetOptions { key: string; group?: string; }
  export interface SetOptions { key: string; value: string; group?: string; }
  export interface RemoveOptions { key: string; group?: string; }
  export interface ClearOptions { group?: string; }
  export interface GetResult { value: string | null; }
  export const Preferences: {
    get(options: GetOptions): Promise<GetResult>;
    set(options: SetOptions): Promise<void>;
    remove(options: RemoveOptions): Promise<void>;
    clear(options?: ClearOptions): Promise<void>;
  };
}
