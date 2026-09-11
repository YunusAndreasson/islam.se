// Expo's default Metro config, wrapped by Sentry. Resolution is unchanged; the wrapper
// stamps every bundle and its source map with a shared debug ID, which is how Sentry
// matches a minified stack trace to the map uploaded for it — by the native build phase
// for store builds, and by `pnpm sentry:sourcemaps` after an OTA update.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
