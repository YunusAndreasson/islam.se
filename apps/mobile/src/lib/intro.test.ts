// The introduction gate, and the one rule in it that is easy to get wrong twice.
//
// `decideIntroStatus` is pure so the UPGRADE rule can be pinned without React, storage or
// a router: an install that already has settings on disk must NOT be walked through a
// first-run wizard on an ordinary update. Getting that backwards is not a crash — it is
// every existing user opening the app after an update and being asked, again, where they
// live. The kind of regression that only shows up in review complaints.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { completeIntro, decideIntroStatus, loadIntroStatus } from './intro';
import { SETTINGS_STORAGE_KEY } from './settings/store';

const INTRO_KEY = 'introSeen:v1';
const SETTINGS_BLOB = JSON.stringify({ calculationMethod: 'Turkey' });

describe('decideIntroStatus', () => {
  it('runs the introduction on a device with nothing stored at all', () => {
    expect(decideIntroStatus(null, null)).toBe('pending');
  });

  it('skips it for an install that predates the introduction', () => {
    // The upgrade path. There is no intro record — this build is the first that writes
    // one — but the settings blob proves the app has been used before, so the wizard has
    // nothing to tell this person that they have not already answered for themselves.
    expect(decideIntroStatus(null, SETTINGS_BLOB)).toBe('done');
  });

  it('never repeats itself once a record exists', () => {
    expect(decideIntroStatus(JSON.stringify({ completed: true }), null)).toBe('done');
    expect(decideIntroStatus(JSON.stringify({ completed: true }), SETTINGS_BLOB)).toBe('done');
  });

  it('treats an unparseable intro record as "already seen"', () => {
    // The record is only ever asked one question — has this device been through it? — so a
    // truncated blob still answers it. Erring toward 'done' is deliberate: showing the
    // introduction twice is a worse failure than skipping it once, and Inställningar →
    // Visa introduktionen igen is always there.
    expect(decideIntroStatus('{"completed":tr', null)).toBe('done');
    // An EMPTY string is different: AsyncStorage returns null for a missing key, so this
    // can only be a failed half-write, and the flow has demonstrably not run.
    expect(decideIntroStatus('', null)).toBe('pending');
  });
});

describe('the persisted record', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('is pending on a fresh install and done after the flow finishes', async () => {
    expect(await loadIntroStatus()).toBe('pending');
    await completeIntro();
    expect(await AsyncStorage.getItem(INTRO_KEY)).not.toBeNull();
    expect(await loadIntroStatus()).toBe('done');
  });

  it('is done for an upgrading user, without them touching anything', async () => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, SETTINGS_BLOB);
    expect(await loadIntroStatus()).toBe('done');
  });

  it('lets the user through when storage cannot be read at all', async () => {
    jest.mocked(AsyncStorage.multiGet).mockRejectedValueOnce(new Error('storage unavailable'));

    // The map is the app, and it must always be reachable. An unreadable device must not
    // be able to trap someone behind a wizard — so a failed read resolves to 'done'
    // rather than defaulting to 'pending' the way the hint stores do (a hint that
    // reappears is a nuisance; a wizard you cannot get past is a broken app).
    expect(await loadIntroStatus()).toBe('done');
  });

  it('does not throw when the record cannot be written', async () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));

    // Best-effort: the worst case is the introduction being offered once more.
    await expect(completeIntro()).resolves.toBeUndefined();
  });

  // Why there is no persisted replay, pinned so nobody "fixes" it back in. Clearing the
  // record cannot make the introduction run on the next launch: anyone who can reach
  // Inställningar → Visa introduktionen igen necessarily has a settings blob, and the
  // upgrade rule reads that as 'done'. Replay is therefore an in-session flip in
  // ./intro-context, and this asserts the storage-level fact that forces it.
  it('cannot be re-armed by clearing the record, because settings already exist', async () => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, SETTINGS_BLOB);
    await completeIntro();

    await AsyncStorage.removeItem(INTRO_KEY);

    expect(await loadIntroStatus()).toBe('done');
  });
});
