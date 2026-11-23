const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const semver = require('semver');

const { expo } = require('../../app.json');
const binding = '@maplibre/maplibre-react-native';
const entry = expo.plugins.find((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === binding);
const overrides = Array.isArray(entry) ? entry[1].android : {};
const root = dirname(require.resolve('../../app.json'));
const defaults = readFileSync(join(root, 'node_modules', binding, 'android/gradle.properties'), 'utf8');

function nativeProperty(key) {
  return overrides[key] ?? defaults.split(`org.maplibre.reactnative.${key}=`)[1]?.split('\n')[0];
}

// ISLAM-SE-P/N: a detached map could retain a mailbox for its old renderer.
// Native 13.7.1 retires that mailbox and actor when the renderer resets (#4686).
it('builds with the Android renderer mailbox lifecycle fix', () => {
  expect(semver.gte(nativeProperty('nativeVersion'), '13.7.1')).toBe(true);
});

// ISLAM-SE-M: the Adreno crash was in vkCmdBeginRenderPass on MapLibre's
// renderer. Skia's separate Vulkan feature requirement cannot select this AAR.
it('uses the OpenGL map renderer on Android', () => {
  expect(nativeProperty('nativeVariant')).toBe('opengl');
});
