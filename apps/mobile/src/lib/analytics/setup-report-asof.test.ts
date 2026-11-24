import { expect, it, jest } from '@jest/globals';
import { storage } from '../storage';
import { enqueueSetupEvent } from './index';
import { recordSetup } from './return-setup';
import { report } from '../../../scripts/return-setup-report';

jest.mock('./index', () => ({ enqueueSetupEvent: jest.fn() }));

// A later checkpoint used to make the same historical query count an open session as mature.
it('keeps the minute-31 denominator stable after a checkpoint arrives at minute 65', async () => {
  const first = Date.parse('2026-11-23T09:00:00Z');
  const minute = 60_000;
  const rows: { event: string; properties: Record<string, unknown> }[] = [];
  function push(event: string, at: number, properties: Record<string, unknown>) {
    rows.push({ event, properties: { distinct_id: 'one', time: at / 1000, ...properties } });
  }
  jest.mocked(enqueueSetupEvent).mockImplementation(async ([event, properties], _id, at) => {
    push(event, at, { ...properties, setup_observed_at: Math.floor(at / 1000) });
    return true;
  });
  await storage.setItem('analytics:firstOpen:v1', JSON.stringify({ install_kind: 'new', setupStartedAt: first }));
  push('First Open', first, { install_kind: 'new', flow_version: 'map_1' });
  function observe(offset: number, reason: 'resume' | 'background') {
    return recordSetup({ at: first + offset * minute, reason, foreground: reason === 'resume', returned: reason === 'resume',
      exact: 'not_applicable', origin: 'other', prayer: { auth: 'off', pending: 'none', alerts: [] },
      widget: { present: false, receipts: [] } });
  }
  await observe(0, 'resume');
  await observe(1, 'background');
  push('App Opened', first + 29 * minute, { launch: 'warm' });
  await observe(29, 'resume');
  const asOf = (offset: number) => report(rows, first + offset * minute);
  const open = { all: { session_1: { still_open: 1, current: { installs: 0 } } } };
  expect(await asOf(31)).toMatchObject(open);
  await observe(65, 'resume');
  expect(await asOf(31)).toMatchObject(open);
  expect(await asOf(59)).toMatchObject({ all: { session_1: { still_open: 0, current: { installs: 1 } } } });
});
