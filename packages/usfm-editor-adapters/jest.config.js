module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest-setup.ts'],
  // Resolve workspace packages to source so tests always track TS edits
  // without requiring a prior `build` step.
  moduleNameMapper: {
    '^@usfm-tools/door43-rest$': '<rootDir>/../usfm-door43-rest/src/index.ts',
    '^@usfm-tools/types$': '<rootDir>/../shared-types/src/index.ts',
    '^@usfm-tools/editor-adapters$': '<rootDir>/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
