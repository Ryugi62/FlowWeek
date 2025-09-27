export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.(ts|js)', '**/*.(test|spec).(ts|js)'],
  collectCoverageFrom: ['src/**/*.(ts|js)', '!src/**/*.d.ts'],
};