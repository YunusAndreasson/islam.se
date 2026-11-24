const { it, expect } = require('@jest/globals');
const { report } = require('./return-setup-report');
it('retains missing installs, counts overlap once, and only credits incremental widgets against known alert negatives', async () => {
  const first = 1800000000;
  const open = id => ({ event: 'First Open', properties: { distinct_id: id, time: first, install_kind: 'new', flow_version: 'map_1', $os: 'iOS' } });
  const check = (id, alert, widget) => ({ event: 'Return Setup Checkpoint', properties: {
    distinct_id: id, time: first + 100, cutoff: 'session_1', alert, widget } });
  const events = ['a', 'b', 'c', 'd', 'qa'].map(open);
  events.push(check('a', 'yes', 'yes'), check('b', 'no', 'yes'), check('c', 'unknown', 'yes'), check('a', 'yes', 'yes'));
  const result = await report(events, (first + 2000) * 1000, new Set(['qa']));
  expect(result.all.session_1).toMatchObject({ missing_checkpoint: 1, current: { installs: 4, both: 1, union: 3,
    verified_reminders: { count: 1, rate: 0.25 }, incremental_widget: { count: 1, rate: 0.25, conditional_rate: 1 },
    unknown_alert: 2, unknown_widget: 1, alert_unknown_widget_yes: 1, bounds: { union: [0.75, 1] } } });
  expect(result.iOS.day_7.current.installs).toBe(0);
});
it('matures a witnessed exit for a non-returner, and a later foreground invalidates the exit if the app was killed', async () => {
  const time = 1800000000;
  const events = ['clean', 'killed'].map(id => ({ event: 'First Open', properties: { distinct_id: id, time, install_kind: 'new', flow_version: 'map_1' } }));
  function observe(id, sequence, alert, widget) {
    return { event: 'Return Setup Observed', properties: { distinct_id: id, time: time + sequence, window: 'session_1',
      sequence, auth: 'full', pending: 'some', widget: 'absent', endpoint_alert: alert, endpoint_widget: widget } };
  }
  events.push(observe('clean', 1, 'yes', 'no'), observe('killed', 2, 'unknown', 'unknown'), observe('killed', 1, 'yes', 'no'));
  const summary = (await report(events, (time + 2000) * 1000)).all.session_1;
  expect(summary.current.verified_reminders.count).toBe(1);
  expect(summary.current.unknown_alert).toBe(1);
  expect(summary.matured_observations).toBe(2);
  const daySeven = (await report(events, (time + 8 * 86400) * 1000)).all.day_7;
  expect(daySeven.current.unknown_alert).toBe(2);
  expect(daySeven.last_observed.verified_reminders.count).toBe(2);
});

it('keeps an install still open at minute 31 after activity at minute 29', async () => {
  const time = 1800000000;
  const properties = { time, distinct_id: 'one' };
  const rows = [{ event: 'First Open', properties: { ...properties, install_kind: 'new', flow_version: 'map_1' } },
    { event: 'Return Setup Observed', properties: { ...properties, time: time + 29 * 60, reason: 'resume', window: 'session_1', sequence: 2 } }];
  const session = (await report(rows, (time + 31 * 60) * 1000)).all.session_1;
  expect(session.current.installs).toBe(0);
  expect(session.still_open).toBe(1);
});

it('uses the witnessed time for a first-open denominator uploaded after day seven', async () => {
  const first = 1800000000;
  const properties = { time: first + 8 * 86400, distinct_id: 'offline' };
  const rows = [{ event: 'First Open', properties: { ...properties, setup_observed_at: first, install_kind: 'new', flow_version: 'map_1' } },
    { event: 'Prayer Reminder Verified', properties: { ...properties, setup_observed_at: first + 60, window: 'session_1' } }];
  const result = (await report(rows, properties.time * 1000)).all.day_7;
  expect(result.current.installs).toBe(1);
  expect(result.ever_verified.verified_reminders.count).toBe(1);
});

// The SDK open can arrive before the setup observer uploads its matching return.
it('invalidates the minute-one exit on a warm open at minute 29', async () => {
  const first = 1_800_000_000;
  const row = (event, minute, properties) => ({
    event, properties: { distinct_id: 'a', time: first + minute * 60, ...properties },
  });
  const rows = [
    row('First Open', 0, { flow_version: 'map_1', install_kind: 'new' }),
    row('Return Setup Observed', 1, { window: 'session_1', reason: 'background', sequence: 2,
      endpoint_alert: 'no', endpoint_widget: 'no' }),
  ];
  const at = async (minute, events) => (await report(events, (first + minute * 60) * 1000)).all.session_1;
  const warm = row('App Opened', 29, { launch: 'warm' });
  expect(await at(31, [...rows, warm])).toMatchObject({
    still_open: 1, current: { installs: 0, counts: { 'no/no': 0 } },
  });
  expect((await at(60, [warm, ...rows])).current.counts['unknown/unknown']).toBe(1);
  // Thirty minutes of inactivity ends the first visit. A distinct visit cannot erase its exit.
  const nextVisit = row('App Opened', 31, { launch: 'cold' });
  expect((await at(32, [...rows, nextVisit])).current.counts['no/no']).toBe(1);
});
