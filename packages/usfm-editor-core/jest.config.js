module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest-setup-door43.ts'],
  moduleNameMapper: {
    '^@usfm-tools/editor-adapters$': '<rootDir>/../usfm-editor-adapters/src/index.ts',
    '^@usfm-tools/usj-core$': '<rootDir>/../usfm-usj-core/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          baseUrl: '../..',
          paths: {
            '@usfm-tools/editor-adapters': ['packages/usfm-editor-adapters/src/index.ts'],
            '@usfm-tools/usj-core': ['packages/usfm-usj-core/src/index.ts'],
          },
        },
      },
    ],
  },
};
