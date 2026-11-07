// Skia 3 requires Vulkan 1.1; MapLibre declares Vulkan 1.0.3. Resolve the
// manifest merger conflict using the stricter requirement so unsupported devices
// are filtered by Play rather than receiving an app with blank Skia canvases.
const { withAndroidManifest } = require('expo/config-plugins');

/** Vulkan 1.1 as Android encodes it: major << 22 | minor << 12. */
const VULKAN_1_1 = '0x401000';

/** Declares Vulkan 1.1 as a required feature on the app manifest, in place. */
function requireVulkan11(manifest) {
  manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const features = manifest['uses-feature'] ?? [];
  let vulkan = features.find((feature) => feature.$['android:name'] === 'android.hardware.vulkan.version');
  if (!vulkan) {
    vulkan = { $: { 'android:name': 'android.hardware.vulkan.version' } };
    features.push(vulkan);
  }
  vulkan.$['android:version'] = VULKAN_1_1;
  vulkan.$['android:required'] = 'true';
  vulkan.$['tools:replace'] = 'android:version';
  manifest['uses-feature'] = features;
  return manifest;
}

module.exports = function withSkiaVulkanAndroid(config) {
  return withAndroidManifest(config, (androidConfig) => {
    requireVulkan11(androidConfig.modResults.manifest);
    return androidConfig;
  });
};
module.exports.requireVulkan11 = requireVulkan11;
module.exports.VULKAN_1_1 = VULKAN_1_1;
