// Jest's module resolver for this app: Reanimated's, with React Native's own behind it.
//
// Reanimated 4 ships its Jest support as a resolver (it makes Reanimated and Worklets load
// their JS implementations under test instead of the native ones) plus `setUpTests()`. Its
// guide says to set that resolver directly — but `resolver` is a single slot and the preset
// (jest-expo, through @react-native/jest-preset) already fills it with React Native's.
// Naming Reanimated's alone would silently drop that one, so they are chained here.
const path = require('node:path');

const reanimatedResolver = require('react-native-reanimated/jest/resolver');
// A dependency of jest-expo, not of this app, so it is resolved from there.
const reactNativeResolver = require(
  require.resolve('@react-native/jest-preset/jest/resolver.js', {
    paths: [path.dirname(require.resolve('jest-expo/package.json'))],
  }),
);

// (request, options) => resolved path — Jest's synchronous resolver signature.
module.exports = (request, options) =>
  reanimatedResolver(request, {
    ...options,
    defaultResolver: (innerRequest, innerOptions) =>
      reactNativeResolver(innerRequest, { ...innerOptions, defaultResolver: options.defaultResolver }),
  });
