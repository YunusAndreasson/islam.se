// The Android manifest line that keeps touch breadcrumbs out of native crash reports. If it
// stops applying, Sentry Android goes back to recording a breadcrumb for every tap on a
// native view, and a native crash carries them past every filter in src/lib/sentry.ts.
const { describe, expect, it } = require('@jest/globals');

const { disableUserInteractionBreadcrumbs, USER_INTERACTION_BREADCRUMBS } = require('./withSentryAndroidBreadcrumbs');

const manifestWith = (metaData) => ({
  manifest: {
    $: {},
    application: [{ $: { 'android:name': '.MainApplication' }, ...(metaData ? { 'meta-data': metaData } : {}) }],
  },
});
const sentryEntries = (manifest) =>
  manifest.manifest.application[0]['meta-data'].filter((m) => m.$['android:name'] === USER_INTERACTION_BREADCRUMBS);

describe('disableUserInteractionBreadcrumbs', () => {
  it("switches Sentry Android's user-interaction breadcrumbs off on the application", () => {
    const manifest = manifestWith();
    disableUserInteractionBreadcrumbs(manifest);
    expect(USER_INTERACTION_BREADCRUMBS).toBe('io.sentry.breadcrumbs.user-interaction');
    expect(sentryEntries(manifest).map((m) => m.$)).toEqual([
      { 'android:name': 'io.sentry.breadcrumbs.user-interaction', 'android:value': 'false' },
    ]);
  });

  it('replaces an existing entry rather than adding a second, and leaves the rest alone', () => {
    const other = { $: { 'android:name': 'expo.modules.updates.ENABLED', 'android:value': 'true' } };
    const manifest = manifestWith([
      other,
      { $: { 'android:name': USER_INTERACTION_BREADCRUMBS, 'android:value': 'true' } },
    ]);
    disableUserInteractionBreadcrumbs(manifest);
    disableUserInteractionBreadcrumbs(manifest);
    expect(sentryEntries(manifest)).toHaveLength(1);
    expect(sentryEntries(manifest)[0].$['android:value']).toBe('false');
    expect(manifest.manifest.application[0]['meta-data']).toContainEqual(other);
  });
});
