module.exports = {
  testMatch: ['**/__tests__/**/*.test.ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-crypto$': '<rootDir>/__tests__/mocks/expoCrypto.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__tests__/mocks/asyncStorage.ts',
  },
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
};
