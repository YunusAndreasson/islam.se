// Two things about the Android prayer widget that expo-widgets 58 gives app.json no way to say.
//
// 1. HOW OFTEN IT RE-RENDERS ON ITS OWN. The plugin hard-codes android:updatePeriodMillis="0":
//    no periodic update at all, so a widget nobody refreshes keeps its last picture forever.
//    This widget picks the entry in force each time it renders (src/widget/android-snapshot),
//    so a render is all it needs to move "next prayer" on — and 30 minutes is the floor
//    Android allows. It wakes the device on that schedule and costs one small JS evaluation.
//
// 2. WHAT IT SAYS BEFORE THE FIRST RENDER. The library's placeholder string is the English
//    "Loading widget"; an app resource of the same name overrides it.
//
// ⚠️ LIST THIS BEFORE "expo-widgets" IN app.json's plugins. Dangerous mods run newest-first, so
// a plugin registered earlier runs LATER — after expo-widgets has written the widget-info XML
// that (1) edits. Listed after it, this would find no file and throw.
const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withDangerousMod, withStringsXml } = require('expo/config-plugins');

/** res/xml name expo-widgets gives a widget called PrayerTimesWidget (resourceNames.js). */
const WIDGET_INFO_XML = 'prayer_times_widget_info.xml';
/** Android's floor for updatePeriodMillis; anything lower is silently raised to it. */
const UPDATE_PERIOD_MS = 30 * 60 * 1000;
const INITIAL_TEXT = 'Läser in bönetider…';

/**
 * `xml` with its updatePeriodMillis set to `ms`. Throws when the attribute is missing — an
 * expo-widgets that stopped writing it has changed under us, and quietly shipping a widget
 * that never refreshes is the failure this plugin exists to prevent.
 */
function setUpdatePeriod(xml, ms) {
  const attribute = /android:updatePeriodMillis="\d+"/;
  if (!attribute.test(xml)) {
    throw new Error(
      `withPrayerWidgetAndroid: no android:updatePeriodMillis in ${WIDGET_INFO_XML}. ` +
        'expo-widgets has changed how it writes the widget info; see plugins/withPrayerWidgetAndroid.js.',
    );
  }
  return xml.replace(attribute, `android:updatePeriodMillis="${ms}"`);
}

function withPrayerWidgetAndroid(config) {
  config = withStringsXml(config, (stringsConfig) => {
    stringsConfig.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'expo_widgets_initial_layout', translatable: 'false' }, _: INITIAL_TEXT }],
      stringsConfig.modResults,
    );
    return stringsConfig;
  });
  return withDangerousMod(config, [
    'android',
    async (dangerousConfig) => {
      const file = path.join(
        dangerousConfig.modRequest.platformProjectRoot,
        'app/src/main/res/xml',
        WIDGET_INFO_XML,
      );
      if (!fs.existsSync(file)) {
        throw new Error(
          `withPrayerWidgetAndroid: ${file} does not exist. List this plugin BEFORE expo-widgets ` +
            'in app.json (dangerous mods run newest-first), and keep enableAndroid on.',
        );
      }
      fs.writeFileSync(file, setUpdatePeriod(fs.readFileSync(file, 'utf8'), UPDATE_PERIOD_MS));
      return dangerousConfig;
    },
  ]);
}

module.exports = withPrayerWidgetAndroid;
module.exports.setUpdatePeriod = setUpdatePeriod;
module.exports.UPDATE_PERIOD_MS = UPDATE_PERIOD_MS;
