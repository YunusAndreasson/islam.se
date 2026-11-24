import { beforeEach, expect, it, jest } from '@jest/globals';
import { enqueueSetupEvent } from './index';
import { markSetupHandoff, recordSetup, type SetupInput } from './return-setup';
import { acknowledgeReceipts } from '@/widget/placement';
import { storage } from '../storage';
import { claimReminderRecovery, recordReminderDenial, markRemindersDisabled } from '../notification-hint';

jest.mock('./index', () => ({ enqueueSetupEvent: jest.fn() }));
jest.mock('@/widget/placement', () => ({ acknowledgeReceipts: jest.fn() }));
const first = Date.parse('2026-11-23T09:00:00Z');
const day = 86400_000;
const send = jest.mocked(enqueueSetupEvent);
const events = (name: string) => send.mock.calls.map(([args]) => args).filter(([e]) => e === name).map(([, props]) => props);
async function sample(offset: number, overrides: Partial<SetupInput> = {}) {
  return recordSetup({ at: first + offset, reason: 'resume', foreground: true, origin: 'other', exact: 'not_applicable',
    widget: { present: false, receipts: [] }, prayer: { auth: 'off', pending: 'none', alerts: [] }, ...overrides });
}
beforeEach(async () => {
  for (const key of ['returnSetup:v1', 'remindersDeclined:v1', 'remindersRecoveryShown:v1', 'remindersDeliberatelyDisabled:v1']) {
    await storage.removeItem(key);
  }
  await storage.setItem('analytics:firstOpen:v1', JSON.stringify({ install_kind: 'new', setupStartedAt: first }));
  jest.clearAllMocks();
  send.mockResolvedValue(true);
});

// An iPhone gallery visit used to count either as an add or as a negative exit.
it('leaves the gallery branch unknown on late return and keeps the independent reminder negative', async () => {
  await sample(0);
  await markSetupHandoff('widget', true);
  await sample(60000, { reason: 'background', foreground: false });
  await sample(day, { widget: { present: true, receipts: [] } });
  expect(events('Return Setup Checkpoint')).toEqual([expect.objectContaining({ cutoff: 'session_1', alert: 'no', widget: 'unknown' })]);
  expect(events('Prayer Widget Added')).toEqual([expect.objectContaining({ window: 'ambiguous' })]);
});
it('uses a dated provider receipt before finalising a suspended session and deduplicates resume', async () => {
  await sample(0);
  await sample(12000, { reason: 'background', foreground: false });
  const receipts = [{ seq: 1, at: first + 15000, added: true, pin: true, present: true }];
  await sample(day, { widget: { receipts, present: true } });
  await sample(day + 10000, { widget: { receipts, present: true } });
  expect(events('Prayer Widget Added')).toEqual([{ proof: 'android_pin_verified', window: 'session_1' }]);
  expect(events('Return Setup Checkpoint')).toEqual([expect.objectContaining({ alert: 'unknown', widget: 'yes' })]);
  expect(acknowledgeReceipts).toHaveBeenCalledWith(1);
});
it('requires an actual addition after a preexisting widget baseline and counts removal at day seven', async () => {
  const widget = { present: true, receipts: [] };
  await sample(0, { widget });
  await sample(10, { widget });
  expect(events('Prayer Widget Added')).toEqual([]);
  await sample(day);
  await sample(day + 1, { widget });
  await sample(7 * day);
  expect(events('Return Setup Checkpoint')).toContainEqual(expect.objectContaining({ cutoff: 'day_7', widget: 'no', ever_widget: 'yes' }));
});
it('does not carry an old alert or a late widget back across an unobserved cutoff', async () => {
  await sample(0);
  await sample(6 * day, { prayer: { auth: 'full', pending: 'some', alerts: [
    { key: 'fajr', fireAt: new Date(first + 6 * day + 60000), at: new Date(first + 6 * day + 60000) },
  ] } });
  await sample(8 * day, { widget: { receipts: [], present: true } });
  expect(events('Return Setup Checkpoint')).toContainEqual(expect.objectContaining({ cutoff: 'day_7', alert: 'unknown', widget: 'unknown', ever_alert: 'yes', ever_widget: 'unknown' }));
});
it('leaves a killed session unknown and retries offline delivery with the same ID and timestamp', async () => {
  send.mockResolvedValueOnce(false);
  await sample(0);
  const attempt = send.mock.calls[0];
  await sample(day);
  expect(send.mock.calls[1]).toEqual(attempt);
  expect(events('Return Setup Checkpoint')).toContainEqual(expect.objectContaining({ cutoff: 'session_1', alert: 'unknown', widget: 'unknown' }));
});
it('excludes old assignments and reads with no permission or widget evidence stay unknown', async () => {
  await storage.setItem('analytics:firstOpen:v1', JSON.stringify({ install_kind: 'new' }));
  await sample(0);
  expect(send).not.toHaveBeenCalled();
  await storage.setItem('analytics:firstOpen:v1', JSON.stringify({ install_kind: 'new', setupStartedAt: first }));
  await sample(0, { reason: 'background', foreground: false, prayer: { auth: 'unknown', pending: 'unknown', alerts: [] }, widget: { receipts: [], present: null } });
  await sample(day);
  expect(events('Return Setup Checkpoint')[0]).toMatchObject({ alert: 'unknown', widget: 'unknown' });
});
it('spends the recovery cap on one eligible visit after 24 hours and honours a deliberate disable', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(first);
  await recordReminderDenial();
  clock.mockRestore();
  expect(await claimReminderRecovery(first, () => true, first + 2 * day)).toBe(false);
  expect(await claimReminderRecovery(first + 1, () => true, first + day - 1)).toBe(false);
  expect(await claimReminderRecovery(first + 1, () => false, first + day)).toBe(false);
  expect(await Promise.all([1, 2].map(() => claimReminderRecovery(first + 1, () => true, first + day)))).toEqual([true, false]);
  await storage.removeItem('remindersRecoveryShown:v1');
  await markRemindersDisabled();
  expect(await claimReminderRecovery(first + 1, () => true, first + day)).toBe(false);
});
it('requires a live matching request across a bracketed cutoff and rejects a bracket interrupted by an OS excursion', async () => {
  const before = 7 * day - 1000;
  const after = 7 * day + 1000;
  const prayer = { auth: 'full', pending: 'some', alerts: [{ key: 'fajr', at: new Date(first + after + day), fireAt: new Date(first + after + day) }] } as const;
  const proof = { ...prayer, alerts: [...prayer.alerts] };
  await sample(0);
  await sample(before, { prayer: proof });
  await sample(after, { prayer: proof });
  expect(events('Return Setup Checkpoint')).toContainEqual(expect.objectContaining({ cutoff: 'day_7', alert: 'yes', evidence: 'bounded_interval' }));

  await storage.removeItem('returnSetup:v1');
  send.mockClear();
  await sample(before, { prayer: proof });
  await sample(after, { returned: true, prayer: proof });
  expect(events('Return Setup Checkpoint')).toContainEqual(expect.objectContaining({ cutoff: 'day_7', alert: 'unknown', evidence: 'incomplete' }));
});

// A continuously open map used to export only its baseline, so its first session
// appeared mature to the report while the reader was still on screen.
it('exports unchanged foreground activity while the first session is open', async () => {
  await sample(0);
  await sample(29 * 60000);
  expect(events('Return Setup Observed')).toHaveLength(2);
  expect(send.mock.calls.at(-1)?.[2]).toBe(first + 29 * 60000);
});

// A slow acknowledgement must never delay persisting the next lifecycle edge.
it('persists the exit while its earlier foreground observation is waiting for the server', async () => {
  let release: (accepted: boolean) => void = () => {};
  let started: () => void = () => {};
  const sending = new Promise<void>(resolve => { started = resolve; });
  send.mockImplementationOnce(() => new Promise<boolean>(resolve => { release = resolve; started(); }));
  const firstWrite = sample(0);
  await sending;
  const exitWrite = sample(1000, { reason: 'background', foreground: false });
  // This queued handoff is a barrier after the exit's storage mutation.
  const barrier = markSetupHandoff('widget', true);
  try {
    await barrier;
    const ledger = JSON.parse((await storage.getItem('returnSetup:v1'))!);
    expect(ledger.outbox).toHaveLength(2);
    expect(ledger.last.reason).toBe('background');
  } finally {
    release(true);
    await Promise.all([firstWrite, exitWrite]);
  }
});
