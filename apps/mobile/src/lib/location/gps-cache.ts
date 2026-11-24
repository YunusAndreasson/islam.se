// The last GPS fix, kept on disk.
//
// Its first job is the visible one: seed the map with a coordinate on launch so prayer
// times are on screen before a new fix lands (or at all, offline). Its second job is the
// reason it lives out here rather than inside LocationProvider — the background refresh
// (lib/notification-refresh) runs with no React, no provider and no chance to ask the OS
// for a position, so this cache is the only coordinate it has. One key, read by both.
//
// Written fire-and-forget: a fix that fails to persist costs the next launch a moment of
// the Stockholm fallback, which is exactly what the app shows before any fix anyway.
import { isValidLatLng } from '@/lib/coordinates';
import type { LatLng } from '@/lib/prayer-times';
import { storage } from '@/lib/storage';

const GPS_CACHE_KEY = 'lastGpsCoords:v1';
const FALLBACK_CHOICE = JSON.stringify('first-run-default');

// A dismissed candidate and an ordinary cache miss have different semantics.
// A later explicitly accepted GPS fix replaces the choice in the same record.
export function keepGpsFallback() {
  return storage.setItem(GPS_CACHE_KEY, FALLBACK_CHOICE);
}

export async function allowsAutomaticGps() {
  return await storage.getItem(GPS_CACHE_KEY) !== FALLBACK_CHOICE;
}

/** The cached fix, or null if there is none, it is unreadable, or it is corrupt. */
export async function readCachedFix(): Promise<LatLng | null> {
  try {
    const raw = await storage.getItem(GPS_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidLatLng(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Remember a fix for the next launch and for the background refresh. Never throws. */
export function writeCachedFix(coords: LatLng): void {
  void storage.setItem(GPS_CACHE_KEY, JSON.stringify(coords)).catch(() => undefined);
}
