// The one line of native widget config this app owns. If it stops applying, the Android
// widget never re-renders on its own and keeps showing a prayer that has passed.
const { describe, expect, it } = require('@jest/globals');

const { setUpdatePeriod, UPDATE_PERIOD_MS } = require('./withPrayerWidgetAndroid');

const INFO = `<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="250dp"
  android:updatePeriodMillis="0"
  android:widgetCategory="home_screen" />`;

describe('setUpdatePeriod', () => {
  it('replaces expo-widgets\' "never" with the half-hour Android floor', () => {
    const next = setUpdatePeriod(INFO, UPDATE_PERIOD_MS);
    expect(next).toContain('android:updatePeriodMillis="1800000"');
    expect(next).not.toContain('android:updatePeriodMillis="0"');
    // Nothing else in the provider XML is touched.
    expect(next.replace('1800000', '0')).toBe(INFO);
  });

  it('refuses an XML without the attribute rather than shipping a widget that never refreshes', () => {
    expect(() => setUpdatePeriod('<appwidget-provider />', UPDATE_PERIOD_MS)).toThrow(
      /no android:updatePeriodMillis/,
    );
  });
});
