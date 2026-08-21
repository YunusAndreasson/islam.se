// The AsyncStorage → expo-sqlite/kv-store move, tested with the two stores APART.
//
// jest.setup.js deliberately mocks both module ids onto ONE shared object, because that is
// the post-migration state every other suite is written against. This file is the
// exception: it mocks them as the two separate databases they really are, which is the
// only configuration in which the migration exists at all.
//
// ⚠️ WHY THIS SUITE EXISTS. The failure it guards is invisible everywhere else. A fresh
// simulator and a fresh test run both start empty, so a broken migration looks perfect in
// development and only surfaces on a real update, where it presents as: the settings reset
// to defaults, the reminders re-scheduled from those defaults, and — because lib/intro.ts
// reads the ABSENCE of the settings key as "this install predates the introduction" — the
// first-run wizard shown to every existing user at once.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLegacy = new Map<string, string>();
const mockKv = new Map<string, string>();
const mockFail = { legacyKeys: false };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockLegacy.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockLegacy.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockLegacy.delete(k)),
    multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, mockLegacy.get(k) ?? null])),
    getAllKeys: jest.fn(async () => {
      if (mockFail.legacyKeys) throw new Error('storage unavailable');
      return [...mockLegacy.keys()];
    }),
  },
}));

jest.mock('expo-sqlite/kv-store', () => {
  const kv = {
    getItem: jest.fn(async (k: string) => mockKv.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockKv.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockKv.delete(k)),
    multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, mockKv.get(k) ?? null])),
  };
  return { __esModule: true, default: kv, Storage: kv, AsyncStorage: kv };
});

const MARKER = 'storage:migratedFromAsyncStorage:v1';

/** A fresh copy of the module, so its one-time migration promise is un-memoised.
 *  `require`, not `import()`: a dynamic import is not executable under this Jest config. */
function freshStorage() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./storage') as typeof import('./storage')).storage;
}

beforeEach(() => {
  mockLegacy.clear();
  mockKv.clear();
  mockFail.legacyKeys = false;
});

describe('migration from AsyncStorage', () => {
  it('carries every existing key across on the first read', async () => {
    mockLegacy.set('prayerSettings:v1', '{"calculationMethod":"Egyptian"}');
    mockLegacy.set('introSeen:v1', '{"completed":true}');

    const storage = freshStorage();

    expect(await storage.getItem('prayerSettings:v1')).toBe('{"calculationMethod":"Egyptian"}');
    expect(mockKv.get('introSeen:v1')).toBe('{"completed":true}');
    expect(mockKv.get(MARKER)).toBeDefined();
  });

  it('runs once — a marked store is not re-copied', async () => {
    mockKv.set(MARKER, '2026-08-21T00:00:00.000Z');
    mockLegacy.set('introSeen:v1', '{"completed":true}');

    const storage = freshStorage();
    await storage.getItem('prayerSettings:v1');

    // Not copied by the eager pass. The lazy fallback in getItem is what would still find
    // it, and that is tested separately below — this asserts only that the marker stops
    // the sweep, which is what keeps the cost to a single launch.
    expect(mockKv.has('introSeen:v1')).toBe(false);
  });

  it('never clobbers a newer value with the legacy one', async () => {
    // The user changed a setting on this build; the pre-migration copy is stale. Copying
    // it over would silently undo their most recent change on every launch until the
    // marker landed.
    mockKv.set('prayerSettings:v1', '{"madhab":"hanafi"}');
    mockLegacy.set('prayerSettings:v1', '{"madhab":"shafi"}');

    const storage = freshStorage();

    expect(await storage.getItem('prayerSettings:v1')).toBe('{"madhab":"hanafi"}');
  });

  it('still serves the legacy value when the copy itself failed, and leaves the retry open', async () => {
    mockFail.legacyKeys = true;
    mockLegacy.set('prayerSettings:v1', '{"madhab":"hanafi"}');

    const storage = freshStorage();

    // The per-key fallback is the second line of defence: no marker was written, so the
    // sweep runs again next launch, and in the meantime nothing is lost.
    expect(await storage.getItem('prayerSettings:v1')).toBe('{"madhab":"hanafi"}');
    expect(mockKv.get('prayerSettings:v1')).toBe('{"madhab":"hanafi"}');
    expect(mockKv.has(MARKER)).toBe(false);
  });
});

describe('deletes reach both stores', () => {
  it('a removed key cannot be resurrected by the fallback', async () => {
    // The regression this pins: notifications.ts removes PRAYER_NOTIFICATION_IDS_KEY when
    // it cancels a schedule. If the delete only reached kv-store, the very next read would
    // fall back to the legacy copy and hand back ids for notifications that no longer
    // exist — so the cancel-and-reschedule path would quietly stop cancelling, and a user
    // who changed method or moved would keep getting alerts at the old times as well.
    mockLegacy.set('prayerNotificationIds:v1', '["a","b"]');

    const storage = freshStorage();
    await storage.getItem('prayerNotificationIds:v1');
    await storage.removeItem('prayerNotificationIds:v1');

    expect(await storage.getItem('prayerNotificationIds:v1')).toBeNull();
    expect(mockLegacy.has('prayerNotificationIds:v1')).toBe(false);
  });
});

describe('multiGet', () => {
  it('answers hits and misses from whichever store holds them', async () => {
    mockKv.set(MARKER, 'done');
    mockKv.set('introSeen:v1', '{"completed":true}');
    mockLegacy.set('prayerSettings:v1', '{"madhab":"shafi"}');

    const storage = freshStorage();

    expect(await storage.multiGet(['introSeen:v1', 'prayerSettings:v1', 'absent'])).toEqual([
      ['introSeen:v1', '{"completed":true}'],
      ['prayerSettings:v1', '{"madhab":"shafi"}'],
      ['absent', null],
    ]);
  });
});
