// The three-way permission mapping is small but load-bearing: it is the ONLY input to
// "may the map offer its location soft-ask?" (see lib/location-hint + components/map/
// LocationHint). Collapse 'undetermined' into 'denied' and the card never appears, so a
// user stuck on Stockholm's times is never offered the fix. Collapse the other way and
// the card keeps offering a button that — after a refusal — the OS will silently ignore.
//
// `granted: false` covers BOTH "not asked yet" and "refused", which is exactly why the
// status string has to be read as well; that subtlety is what this file pins down.
import { describe, expect, it } from '@jest/globals';

import { toLocationPermissionState } from './permission';

describe('toLocationPermissionState', () => {
  it('reads a granted permission as granted, whatever the status says', () => {
    expect(toLocationPermissionState({ granted: true, status: 'granted' })).toBe('granted');
    // expo-location reports granted:true with status 'granted'; the flag is the
    // authority, so a surprising status must not downgrade a real grant.
    expect(toLocationPermissionState({ granted: true, status: 'denied' })).toBe('granted');
  });

  it('separates a refusal from a question never asked', () => {
    // Refused: the in-app button can no longer do anything, so the card must stay away.
    expect(toLocationPermissionState({ granted: false, status: 'denied' })).toBe('denied');
    // Never asked: the one state where the soft-ask has something to offer.
    expect(toLocationPermissionState({ granted: false, status: 'undetermined' })).toBe(
      'undetermined',
    );
  });

  it('treats an absent or unrecognised status as still-askable', () => {
    // A thin permission object (older expo, or a platform that omits `status`) must not
    // read as a refusal — that would permanently suppress the card on a fresh install.
    expect(toLocationPermissionState({ granted: false })).toBe('undetermined');
    expect(toLocationPermissionState({ granted: false, status: 'something-new' })).toBe(
      'undetermined',
    );
  });
});
