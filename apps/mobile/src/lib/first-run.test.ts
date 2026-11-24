import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { acknowledgeReminderGrant, recoverReminderGrant, reminderPlace, clearReminderDraft, firstReadingEventOnce, observeReadingVisit, readReminderDraft, reminderSelection, saveReminderDraft } from './first-run';
import { DEFAULT_SETTINGS } from './settings/types';
import { storage } from './storage';

const mask = { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false };
const now = Date.parse('2026-11-23T09:41:00+01:00');

// The accepted GPS snapshot survives a fresh fix; an explicit city is a different handoff.
it('recovers a Fajr-only GPS draft across one metre of drift, but never for a manual city', async () => {
  const place = (latitude: number, mode: string) => JSON.stringify({ mode, latitude, longitude: 13, method: 'Turkey' });
  await saveReminderDraft(place(55.60, 'gps'), mask);
  expect(await readReminderDraft(place(55.60001, 'gps'))).toEqual(mask);
  expect(await readReminderDraft(place(55.60001, 'manual'))).toBeNull();
});

describe('first reading handoff', () => {
  beforeEach(async () => { await clearReminderDraft(); await storage.removeItem('firstReadingVisit:v1'); });
  afterEach(() => { jest.restoreAllMocks(); });
  it('remembers the exact draft during the OS handoff only for the same place', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    await saveReminderDraft('berg-north', mask);
    expect(await readReminderDraft('berg-south')).toBeNull();
    expect(await readReminderDraft('berg-north')).toEqual(mask);
    clock.mockReturnValue(now + 30 * 60_000);
    expect(await readReminderDraft('berg-north')).toBeNull();
    await clearReminderDraft();
    expect(await readReminderDraft('berg-north')).toBeNull();
  });
  it('can clear an interrupted handoff after storage becomes writable again', async () => {
    await saveReminderDraft('malmö', mask);
    jest.spyOn(storage, 'removeItem').mockRejectedValueOnce(new Error('disk unavailable'));
    await clearReminderDraft();
    expect(await readReminderDraft('malmö')).toEqual(mask);
    await clearReminderDraft();
    expect(await readReminderDraft('malmö')).toBeNull();
  });
  it('discards malformed drafts', async () => {
    await storage.setItem('firstReadingDraft:v1', 'invalid');
    expect(await readReminderDraft('berg')).toBeNull();
    await storage.setItem('firstReadingDraft:v1', JSON.stringify({ savedAt: Date.now(), place: 'berg', prayers: { fajr: true } }));
    expect(await readReminderDraft('berg')).toBeNull();
  });
  it('leaves a failed analytics claim and an unreadable visit eligible for a later observation', async () => {
    const write = jest.spyOn(storage, 'setItem').mockRejectedValueOnce(new Error('disk busy'));
    const send = jest.fn();
    await firstReadingEventOnce('retry', send);
    expect(send).not.toHaveBeenCalled();
    write.mockRestore();
    await firstReadingEventOnce('retry', send);
    expect(send).toHaveBeenCalledTimes(1);
    jest.spyOn(storage, 'getItem').mockRejectedValueOnce(new Error('unavailable'));
    expect(await observeReadingVisit()).toBeNull();
    expect(await observeReadingVisit(now)).toBe('session_1');
  });
  // Process death after the preference write leaves an already-committed grant to acknowledge.
  it('acknowledges only the durable matching mask and retries a failed handoff removal', async () => {
    const fix = { latitude: 55.60587, longitude: 13.00073 };
    await storage.setItem('lastGpsCoords:v1', JSON.stringify(fix));
    const place = reminderPlace(DEFAULT_SETTINGS, fix);
    const committed = { ...DEFAULT_SETTINGS, notifications: reminderSelection(mask) };
    await saveReminderDraft(place, mask);
    await acknowledgeReminderGrant({ ...committed, notifications: reminderSelection(DEFAULT_SETTINGS.notifications.prayers) });
    expect(await readReminderDraft(place)).toEqual(mask);
    jest.spyOn(storage, 'removeItem').mockRejectedValueOnce(new Error('disk busy'));
    expect(await recoverReminderGrant(committed)).toBe(committed);
    expect(await readReminderDraft(place)).toEqual(mask);
    expect(await recoverReminderGrant(committed)).toBe(committed);
    expect(await readReminderDraft(place)).toBeNull();
  });
  it('keeps only the explicitly selected prayers and leaves the optional two off', () => {
    expect(reminderSelection(mask)).toMatchObject({ prayers: mask, enabled: true, lastThird: false, fajrWindowEnd: false,
      lead: DEFAULT_SETTINGS.notifications.lead, sound: DEFAULT_SETTINGS.notifications.sound });
  });
  it('deduplicates simultaneous observations and distinguishes a later visit', async () => {
    const send = jest.fn();
    await storage.removeItem('firstReadingEvent:v1:test');
    await Promise.all([firstReadingEventOnce('test', send), firstReadingEventOnce('test', send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await observeReadingVisit(now)).toBe('session_1');
    expect(await observeReadingVisit(now + 5 * 60_000)).toBe('session_1');
    expect(await observeReadingVisit(now + 35 * 60_000)).toBe('through_day_7');
    expect(await observeReadingVisit(now + 168 * 3600_000 + 1)).toBe('later');
  });
});
