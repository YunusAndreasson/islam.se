const { withMainActivity } = require('expo/config-plugins');

const ACTIVITY = 'class MainActivity : ReactActivity() {';
const ENTRY = 'override fun onNewIntent(intent: android.content.Intent)';

function keepIncomingLink(contents) {
  if (contents.includes(ENTRY)) return contents;
  if (!contents.includes(ACTIVITY)) throw new Error('Expected the Expo Kotlin MainActivity template.');

  return contents.replace(ACTIVITY, `${ACTIVITY}
  ${ENTRY} {
    // Expo's delegate can receive this before its React host is ready. Keep the incoming
    // app link for React Native's initial URL lookup when Android restores an older task.
    if (intent.action == android.content.Intent.ACTION_VIEW && intent.data?.scheme == "islamse") {
      setIntent(intent)
    }
    super.onNewIntent(intent)
  }
`);
}

module.exports = function withAndroidLinkIntent(config) {
  return withMainActivity(config, (activity) => {
    activity.modResults.contents = keepIncomingLink(activity.modResults.contents);
    return activity;
  });
};
module.exports.keepIncomingLink = keepIncomingLink;
