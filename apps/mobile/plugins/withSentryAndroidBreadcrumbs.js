// The one native breadcrumb source the JS options cannot reach. src/lib/sentry.ts switches
// every other one off through the options @sentry/react-native passes to the native SDKs,
// but that bridge has no key for Sentry Android's user-interaction breadcrumbs, which are on
// by default: a "ui.click" or "ui.scroll" for every gesture on a native view with a resource
// id (MapLibre's compass, logo and attribution). JS reports cap breadcrumbs at zero, but
// a native crash leaves straight from the native SDK, so the switch has to be off at the
// source. Sentry Android reads this meta-data at init, before the React Native SDK applies
// its own options, and those options never set it.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const USER_INTERACTION_BREADCRUMBS = 'io.sentry.breadcrumbs.user-interaction';

/** Sets the meta-data on the manifest's application, in place; a second run replaces it. */
function disableUserInteractionBreadcrumbs(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, USER_INTERACTION_BREADCRUMBS, 'false');
  return manifest;
}

module.exports = function withSentryAndroidBreadcrumbs(config) {
  return withAndroidManifest(config, (androidConfig) => {
    disableUserInteractionBreadcrumbs(androidConfig.modResults);
    return androidConfig;
  });
};
module.exports.disableUserInteractionBreadcrumbs = disableUserInteractionBreadcrumbs;
module.exports.USER_INTERACTION_BREADCRUMBS = USER_INTERACTION_BREADCRUMBS;
