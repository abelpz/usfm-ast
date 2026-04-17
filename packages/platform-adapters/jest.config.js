module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest-setup.ts'],
  moduleNameMapper: {
    '^@usfm-tools/types$': '<rootDir>/../shared-types/src/index.ts',
    '^@usfm-tools/platform-adapters$': '<rootDir>/src/index.ts',
    '^@usfm-tools/platform-adapters/web$': '<rootDir>/src/web/index.ts',
    '^@tauri-apps/plugin-store$': '<rootDir>/src/tauri/stubs/tauri-plugin-store.d.ts',
    '^@tauri-apps/plugin-fs$': '<rootDir>/src/tauri/stubs/tauri-plugin-fs.d.ts',
    '^@capacitor/preferences$': '<rootDir>/src/capacitor/stubs/capacitor-preferences.d.ts',
    '^@capacitor/network$': '<rootDir>/src/capacitor/stubs/capacitor-network.d.ts',
    '^@capacitor/filesystem$': '<rootDir>/src/capacitor/stubs/capacitor-filesystem.d.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
