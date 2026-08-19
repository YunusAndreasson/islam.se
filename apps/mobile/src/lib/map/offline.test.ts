// The cache cap is one call, and its whole risk is that it silently does nothing — either by
// throwing on a phone that cannot take it, or by being set to a value that helps nobody.
import { describe, expect, it, jest } from '@jest/globals';
import { OfflineManager } from '@maplibre/maplibre-react-native';

import { AMBIENT_CACHE_BYTES, ensureBasemapCache } from './offline';

const manager = OfflineManager as unknown as {
  setMaximumAmbientCacheSize: jest.Mock<(bytes: number) => Promise<void>>;
};

describe('ensureBasemapCache', () => {
  it('gives MapLibre a cap big enough to be worth having', async () => {
    manager.setMaximumAmbientCacheSize.mockClear();
    expect(await ensureBasemapCache()).toBe(true);
    expect(manager.setMaximumAmbientCacheSize).toHaveBeenCalledWith(AMBIENT_CACHE_BYTES);
    // mbgl's own default is 50 MB, shared with every tile the map has ever drawn — a cap at
    // or below that would leave the country view competing with it and losing.
    expect(AMBIENT_CACHE_BYTES).toBeGreaterThan(50 * 1024 * 1024);
  });

  // Setting the cap is an optimisation. A phone that refuses it (no disk, a locked database)
  // must still get a map, so the failure is swallowed — but it is REPORTED, so a caller that
  // wants to know is not lied to.
  it('reports failure instead of taking the screen down with it', async () => {
    manager.setMaximumAmbientCacheSize.mockRejectedValueOnce(new Error('database is locked'));
    expect(await ensureBasemapCache()).toBe(false);
  });
});
