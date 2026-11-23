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

// MapLibre stays on Vulkan, like Skia (one GPU API for map and overlay, the
// combination measured on 2026-11-22). 13.7.1 carries the Vulkan fixes behind the
// production faults: non-blocking SurfaceView resize (ISLAM-SE-2, #4705),
// recoverable swapchain rebuilds (#4730) and the Adreno 600-series workaround
// extended to all texture sampling (#4666; ISLAM-SE-M was an Adreno 642L).
it('uses the Vulkan map renderer on Android', () => {
  expect(nativeProperty('nativeVariant')).toBe('vulkan');
});
