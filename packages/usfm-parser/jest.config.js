module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  passWithNoTests: true,
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['performance'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
};
