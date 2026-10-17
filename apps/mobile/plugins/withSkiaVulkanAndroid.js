// Skia 3 requires Vulkan 1.1; MapLibre declares Vulkan 1.0.3. Resolve the
// manifest merger conflict using the stricter requirement so unsupported devices
// are filtered by Play rather than receiving an app with blank Skia canvases.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withSkiaVulkanAndroid(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const features = manifest['uses-feature'] ?? [];
    let vulkan = features.find((feature) => feature.$['android:name'] === 'android.hardware.vulkan.version');
    if (!vulkan) {
      vulkan = { $: { 'android:name': 'android.hardware.vulkan.version' } };
      features.push(vulkan);
    }
    vulkan.$['android:version'] = '0x401000';
    vulkan.$['android:required'] = 'true';
    vulkan.$['tools:replace'] = 'android:version';
    manifest['uses-feature'] = features;
    return androidConfig;
  });
};
