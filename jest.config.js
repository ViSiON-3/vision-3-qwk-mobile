// Engine-phase Jest config: pure-TypeScript logic runs in a Node environment
// via babel-jest (babel-preset-expo). React Native component tests will be
// added later as a separate `jest-expo` project.
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  testMatch: ['**/src/**/*.test.ts', '**/src/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
