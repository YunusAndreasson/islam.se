// The Vulkan line the Android manifest must carry. Skia 3 draws through Vulkan 1.1; if this
// stops applying, the manifest merger keeps MapLibre's 1.0.3 and Play installs the app on
// devices where every Skia canvas — the map's wash and prayer lines, the Moon — is blank.
const { describe, expect, it } = require('@jest/globals');

const { requireVulkan11, VULKAN_1_1 } = require('./withSkiaVulkanAndroid');

const vulkanOf = (manifest) =>
  manifest['uses-feature'].filter((f) => f.$['android:name'] === 'android.hardware.vulkan.version');

describe('requireVulkan11', () => {
  it("raises MapLibre's Vulkan 1.0.3 declaration to a required 1.1, replacing rather than adding", () => {
    const manifest = {
      $: {},
      'uses-feature': [
        { $: { 'android:name': 'android.hardware.vulkan.version', 'android:version': '0x400003' } },
        { $: { 'android:name': 'android.hardware.location.gps', 'android:required': 'false' } },
      ],
    };
    requireVulkan11(manifest);
    const vulkan = vulkanOf(manifest);
    expect(vulkan).toHaveLength(1);
    expect(vulkan[0].$).toEqual({
      'android:name': 'android.hardware.vulkan.version',
      'android:version': VULKAN_1_1,
      'android:required': 'true',
      // Without tools:replace the merger reports a conflict with MapLibre's own manifest.
      'tools:replace': 'android:version',
    });
    expect(manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    // Unrelated features are left exactly as they were.
    expect(manifest['uses-feature'][1].$).toEqual({
      'android:name': 'android.hardware.location.gps',
      'android:required': 'false',
    });
  });

  it('declares the feature when nothing else does', () => {
    const manifest = { $: {} };
    requireVulkan11(manifest);
    expect(vulkanOf(manifest)).toHaveLength(1);
    expect(vulkanOf(manifest)[0].$['android:version']).toBe(VULKAN_1_1);
  });

  it('encodes Vulkan 1.1 the way Android reads it (major << 22 | minor << 12)', () => {
    expect(Number(VULKAN_1_1)).toBe((1 << 22) | (1 << 12));
  });
});
