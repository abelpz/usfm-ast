declare module '@tauri-apps/plugin-fs' {
  export enum BaseDirectory {
    Audio = 1,
    Cache = 2,
    Config = 3,
    Data = 4,
    LocalData = 5,
    Document = 6,
    Download = 7,
    Picture = 8,
    Public = 9,
    Video = 10,
    Resource = 11,
    Temp = 12,
    AppConfig = 13,
    AppData = 14,
    AppLocalData = 15,
    AppCache = 16,
    AppLog = 17,
    Desktop = 18,
    Executable = 19,
    Font = 20,
    Home = 21,
    Runtime = 22,
    Template = 23,
  }

  export interface FsOptions {
    baseDir?: BaseDirectory;
  }

  export function readFile(path: string, options?: FsOptions): Promise<Uint8Array>;
  export function writeFile(path: string, data: Uint8Array, options?: FsOptions): Promise<void>;
  export function readTextFile(path: string, options?: FsOptions): Promise<string>;
  export function writeTextFile(path: string, data: string, options?: FsOptions): Promise<void>;
  export function exists(path: string, options?: FsOptions): Promise<boolean>;
  export function mkdir(path: string, options?: { recursive?: boolean } & FsOptions): Promise<void>;
  export function readDir(path: string, options?: FsOptions): Promise<Array<{ name?: string }>>;
  export function remove(path: string, options?: { recursive?: boolean } & FsOptions): Promise<void>;
  export function copyFile(src: string, dest: string, options?: FsOptions): Promise<void>;
}
