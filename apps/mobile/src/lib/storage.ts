// The app's key-value store, and the one-time move off AsyncStorage.
//
// Everything the app persists is small and flat — the settings blob, the intro flag, the
// two hint records, the last GPS fix, the scheduled-notification bookkeeping — so a
// key-value store is the whole requirement. What changed is WHOSE key-value store:
// `expo-sqlite/kv-store` is Expo's own, backed by the same SQLite the SDK already ships,
// which retires a third-party native module (@react-native-async-storage/async-storage)
// from the build.
//
// ⚠️ THE ONLY THING THAT MATTERS HERE IS THAT NOBODY LOSES THEIR DATA. kv-store does not
// read AsyncStorage's database — they are two separate files. A plain import swap would
// therefore hand every existing user an empty store, which does not read as "settings
// reset": `intro.ts` treats the ABSENCE of the settings key as "this install predates the
// introduction", so the first-run wizard would appear in front of every user on an
// ordinary update, and their reminders would silently re-schedule from defaults.
//
// So the swap is defended twice, because the failure is invisible in development (a fresh
// simulator has nothing to migrate, and every test starts empty):
//
//   1. AN EAGER ONE-TIME COPY. The first call to any method below awaits `ensureMigrated`,
//      which copies every AsyncStorage key that kv-store does not already hold and then
//      writes a marker. It is a handful of short strings, so this costs one extra tick on
//      the first launch after the update and nothing afterwards.
//   2. A PER-KEY LAZY FALLBACK. If that copy ever fails — storage error, a key written by
//      an older build after the marker landed — a read that misses in kv-store still asks
//      AsyncStorage, and writes what it finds through. The marker is only set on success,
//      so a failed migration simply retries on the next launch.
//
// `removeItem` and `clear` therefore have to reach BOTH stores. Deleting from kv-store
// alone would let the lazy fallback resurrect the value on the next read — which for
// PRAYER_NOTIFICATION_IDS_KEY means reviving a list of notification ids that no longer
// exist, i.e. the cancel-and-reschedule path quietly stops cancelling.
//
// AsyncStorage stays a dependency for exactly one release cycle: it is the SOURCE of the
// migration, and removing it before the fleet has run it is how the data is lost. Once
// released, delete the fallback path, drop the package, and the sync reads kv-store
// offers (`getItemSync`) become available to the splash gate — which today holds the
// native splash purely to wait for two async reads (see ./splash).
import AsyncStorage from '@react-native-async-storage/async-storage';
import KV from 'expo-sqlite/kv-store';

/** Set once the eager copy has completed. Its presence is what makes the copy one-time. */
const MIGRATION_MARKER = 'storage:migratedFromAsyncStorage:v1';

let migration: Promise<void> | null = null;

/**
 * Copy anything AsyncStorage still holds that kv-store does not.
 *
 * Deliberately does NOT overwrite: a key present in kv-store is newer by definition (this
 * build wrote it), and clobbering it with the legacy value would undo the user's most
 * recent change every launch until the marker landed.
 */
async function runMigration(): Promise<void> {
  try {
    if ((await KV.getItem(MIGRATION_MARKER)) !== null) return;
    const keys = await AsyncStorage.getAllKeys();
    const legacy = keys.filter((k) => k !== MIGRATION_MARKER);
    if (legacy.length > 0) {
      const pairs = await AsyncStorage.multiGet(legacy);
      for (const [key, value] of pairs) {
        if (value === null) continue;
        if ((await KV.getItem(key)) !== null) continue;
        await KV.setItem(key, value);
      }
    }
    await KV.setItem(MIGRATION_MARKER, new Date().toISOString());
  } catch {
    // Leave the marker unset so the next launch tries again, and let the per-key fallback
    // below carry this session. Never rethrow: a storage hiccup must not stop the app from
    // reading its settings.
  }
}

function ensureMigrated(): Promise<void> {
  migration ??= runMigration();
  return migration;
}

/**
 * The pre-migration store's answer for a key kv-store does not hold, written through so the
 * next read is a hit. Split out so a caller that ALREADY knows kv-store missed does not ask
 * it a second time — see multiGet.
 */
async function fromLegacy(key: string): Promise<string | null> {
  const legacy = await AsyncStorage.getItem(key);
  if (legacy !== null) await KV.setItem(key, legacy).catch(() => undefined);
  return legacy;
}

/**
 * Read a key, falling back to the pre-migration store and writing through what it finds.
 * A `null` means neither store has it.
 */
async function getItem(key: string): Promise<string | null> {
  await ensureMigrated();
  const current = await KV.getItem(key);
  return current !== null ? current : fromLegacy(key);
}

async function setItem(key: string, value: string): Promise<void> {
  await ensureMigrated();
  await KV.setItem(key, value);
}

/** Removes from BOTH stores — see the header on why half a delete is worse than none. */
async function removeItem(key: string): Promise<void> {
  await ensureMigrated();
  await KV.removeItem(key);
  await AsyncStorage.removeItem(key).catch(() => undefined);
}

/**
 * Reads many keys, and only the misses pay for the legacy lookup.
 *
 * No claim here about round trips: `SQLiteStorage.multiGet` is itself
 * `Promise.all(keys.map(getItemAsync))`, so it is one query per key either way. What this
 * does avoid is asking kv-store TWICE for a key it has already said it does not have —
 * which is the whole reason the miss path calls `fromLegacy` rather than `getItem`. It
 * matters because the first caller is the splash gate: lib/splash holds the native splash
 * until the settings and intro reads land, so every redundant query is time the reader
 * spends looking at a static image.
 */
async function multiGet(keys: readonly string[]): Promise<[string, string | null][]> {
  await ensureMigrated();
  const pairs = await KV.multiGet([...keys]);
  return Promise.all(
    pairs.map(
      async ([key, value]) =>
        [key, value !== null ? value : await fromLegacy(key)] as [string, string | null],
    ),
  );
}

export const storage = { getItem, setItem, removeItem, multiGet };
