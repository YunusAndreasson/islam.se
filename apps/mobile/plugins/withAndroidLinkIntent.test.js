const { describe, expect, it } = require('@jest/globals');

const { keepIncomingLink } = require('./withAndroidLinkIntent');

describe('keepIncomingLink', () => {
  it('retains the incoming app link before passing the intent to the Expo delegate', () => {
    const activity = 'class MainActivity : ReactActivity() {\n  override fun onCreate() {}\n}';
    const patched = keepIncomingLink(activity);
    expect(patched).toContain('intent.data?.scheme == "islamse"');
    expect(patched.indexOf('setIntent(intent)')).toBeLessThan(patched.indexOf('super.onNewIntent(intent)'));
    expect(patched).toContain('override fun onCreate() {}');
    expect(keepIncomingLink(patched)).toBe(patched);
  });
});
