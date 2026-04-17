declare module '@capacitor/network' {
  export interface NetworkStatus { connected: boolean; connectionType: string; }
  export interface PluginListenerHandle { remove(): Promise<void>; }
  export const Network: {
    getStatus(): Promise<NetworkStatus>;
    addListener(event: 'networkStatusChange', handler: (status: NetworkStatus) => void): Promise<PluginListenerHandle>;
    removeAllListeners(): Promise<void>;
  };
}
