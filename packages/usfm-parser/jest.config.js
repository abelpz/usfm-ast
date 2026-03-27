const ciSmokeOnly = process.env.CI === 'true';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  passWithNoTests: true,
  testMatch: ciSmokeOnly
    ? [
        '<rootDir>/tests/ci-smoke.test.ts',
        '<rootDir>/tests/usfm-parser-contract.test.ts',
      ]
    : ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
};
