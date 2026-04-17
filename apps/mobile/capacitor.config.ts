import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.usfmtools.editor',
  appName: 'USFM Editor',
  webDir: 'dist',
  server: {
    /**
     * In production, `androidScheme` ensures assets are served from a local
     * scheme so cross-origin restrictions don't block IndexedDB fallbacks.
     */
    androidScheme: 'https',
  },
  plugins: {
    /**
     * SQLite plugin configuration.
     * `iosDatabaseLocation`: 'Library/LocalDatabase' avoids iCloud backup of
     * the (potentially large) source cache database.
     */
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/LocalDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false,
    },
    /**
     * Preferences (key-value) plugin.
     * Values are stored in SharedPreferences (Android) / NSUserDefaults (iOS).
     */
    Preferences: {},
    /**
     * Filesystem plugin — used for font file installation and project exports.
     */
    Filesystem: {},
    /**
     * Network plugin — detects WiFi vs. cellular vs. offline with higher
     * fidelity than `navigator.onLine` (e.g. captive portal detection).
     */
    Network: {},
  },
};

export default config;
