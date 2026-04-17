declare module '@capacitor/filesystem' {
  export enum Encoding { UTF8 = 'utf8' }
  export interface ReadFileResult { data: string | Blob; }
  export interface ReaddirResult { files: Array<string | { name: string }>; }
  export const Filesystem: {
    readFile(options: { path: string; encoding?: Encoding }): Promise<ReadFileResult>;
    writeFile(options: { path: string; data: string; encoding?: Encoding }): Promise<void>;
    stat(options: { path: string }): Promise<{ size: number; type: string }>;
    mkdir(options: { path: string; recursive?: boolean }): Promise<void>;
    readdir(options: { path: string }): Promise<ReaddirResult>;
    deleteFile(options: { path: string }): Promise<void>;
    rmdir(options: { path: string; recursive?: boolean }): Promise<void>;
    copy(options: { from: string; to: string }): Promise<void>;
  };
}
