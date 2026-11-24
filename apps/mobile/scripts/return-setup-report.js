// Offline report for a Mixpanel JSONL export. Raw device IDs stay in memory.
const fs = require('node:fs');
const readline = require('node:readline');
const { parseArgs } = require('node:util');
const DAY = 86_400_000;
const SESSION_GAP = 30 * 60_000;
const outcomes = ['yes', 'no', 'unknown'];
const outcome = value => outcomes.includes(value) ? value : 'unknown';
const rate = (n, total) => total ? n / total : null;

function summarize(pairs) {
  const total = pairs.length;
  const counts = Object.fromEntries(outcomes.flatMap(a => outcomes.map(b => [a + '/' + b, 0])));
  for (const [a, b] of pairs) counts[a + '/' + b]++;
  const count = predicate => pairs.filter(([a, b]) => predicate(a, b)).length;
  const alerts = count(a => a === 'yes');
  const additions = counts['no/yes'];
  const noAlert = count(a => a === 'no');
  const unknownA = count(a => a === 'unknown');
  const unknownB = count((_, b) => b === 'unknown');
  const both = counts['yes/yes'];
  const union = count((a, b) => a === 'yes' || b === 'yes');
  const indeterminate = total - union - counts['no/no'];
  const bounds = (known, unknown) => [rate(known, total), rate(known + unknown, total)];
  return { installs: total, verified_reminders: { count: alerts, rate: rate(alerts, total) },
    incremental_widget: { count: additions, rate: rate(additions, total), conditional_rate: rate(additions, noAlert) },
    alert_unknown_widget_yes: counts['unknown/yes'], unknown_alert: unknownA, unknown_widget: unknownB,
    coverage: { alert: rate(total - unknownA, total), widget: rate(total - unknownB, total) },
    bounds: { alert: bounds(alerts, unknownA), widget: bounds(count((_, b) => b === 'yes'), unknownB),
      union: bounds(union, indeterminate) }, both, union, counts };
}

async function report(events, asOf, excluded = new Set()) {
  const installs = new Map();
  for await (const row of events) {
    const { event, properties: p } = typeof row === 'string' ? JSON.parse(row) : row;
    if (!p || excluded.has(p.distinct_id) || !p.distinct_id || !Number.isFinite(p.time)) continue;
    const observed = p.setup_observed_at ?? p.time;
    const at = observed < 1e12 ? observed * 1000 : observed;
    if (!Number.isFinite(at) || at > asOf) continue;
    const id = p.distinct_id;
    const item = installs.get(id) ?? { opens: [], checkpoints: {}, verified: {}, last: {}, diagnostics: new Set() };
    if (event === 'First Open' && p.install_kind === 'new' && p.flow_version === 'map_1' && !p.development) {
      item.first = Math.min(item.first ?? Infinity, at);
      item.platform = p.$os ?? 'unknown';
    } else if (event === 'App Opened' && (p.launch === 'cold' || p.launch === 'warm')) {
      item.opens.push(at);
    } else if (event === 'Return Setup Checkpoint' && ['session_1', 'day_7'].includes(p.cutoff)) {
      if (!item.checkpoints[p.cutoff] || at >= item.checkpoints[p.cutoff].at) item.checkpoints[p.cutoff] = { ...p, at };
    } else if (event === 'Prayer Reminder Verified' || event === 'Prayer Widget Added') {
      const branch = event === 'Prayer Reminder Verified' ? 'alert' : 'widget';
      if (p.window !== 'later') item.verified[branch] = Math.min(item.verified[branch] ?? Infinity, at);
    } else if (event === 'Return Setup Observed') {
      if (p.auth === 'full' && p.pending === 'none') item.diagnostics.add('grant_without_pending');
      const observation = { sequence: p.sequence, at,
        last_widget: p.widget === 'present' ? 'yes' : ['absent', 'preexisting'].includes(p.widget) ? 'no' : 'unknown',
        last_alert: p.auth === 'full' && p.pending === 'some' ? 'yes' :
          p.auth === 'off' || p.auth === 'limited' || p.pending === 'none' ? 'no' : 'unknown' };
      const windows = p.window === 'session_1' ? ['session_1', 'day_7'] : p.window === 'through_day_7' ? ['day_7'] : [];
      for (const window of windows) {
        const previous = item.last[window];
        if (!previous || at > previous.at || (at === previous.at && p.sequence > previous.sequence)) item.last[window] = observation;
      }
      if (p.window === 'session_1' && p.endpoint_alert && p.endpoint_widget &&
          (!item.exit || item.exit.sequence < p.sequence)) {
        item.exit = { ...observation, alert: p.endpoint_alert, widget: p.endpoint_widget };
      }
    } else if (event === 'Widget Setup Requested' && p.launcher_result === 'unsupported') {
      item.diagnostics.add('unsupported_pin');
    } else continue;
    if (p.window === 'session_1') item.activity = Math.max(item.activity ?? 0, at);
    installs.set(id, item);
  }
  const cohort = [...installs.values()].filter(i => i.first !== undefined);
  // Exports can arrive out of order. Walk SDK opens in observation order and
  // stop at the first inactivity gap so a later visit cannot reopen session one.
  for (const install of cohort) {
    let last = Math.max(install.first, install.activity ?? 0, install.checkpoints.session_1?.at ?? 0);
    for (const at of install.opens.sort((a, b) => a - b)) {
      if (at - last >= SESSION_GAP) break;
      last = Math.max(last, at);
    }
    install.activity = last;
    if (install.exit?.at < last) delete install.exit;
    if (install.checkpoints.session_1?.at < last) delete install.checkpoints.session_1;
  }
  const result = {};
  for (const platform of ['all', ...new Set(cohort.map(i => i.platform))]) {
    const group = cohort.filter(i => platform === 'all' || i.platform === platform);
    const metrics = {};
    for (const cutoff of ['session_1', 'day_7']) {
      const eligible = group.filter(i => cutoff === 'day_7' ? asOf - i.first >= 7 * DAY :
        asOf - i.activity >= SESSION_GAP);
      const rows = eligible.map(i => i.checkpoints[cutoff] ??
        (cutoff === 'session_1' && i.exit && asOf - i.exit.at >= SESSION_GAP ? i.exit : {}));
      metrics[cutoff] = { ...(cutoff === 'session_1' && { still_open: group.length - eligible.length }), current: summarize(rows.map(p => [outcome(p.alert), outcome(p.widget)])),
        last_observed: summarize(rows.map((p, index) => {
          const last = p.cutoff ? p : eligible[index].last[cutoff] ?? p;
          return [outcome(last.last_alert), outcome(last.last_widget)];
        })),
        missing_checkpoint: rows.filter(p => !p.cutoff).length,
        matured_observations: rows.filter(p => p.sequence !== undefined).length };
      if (cutoff === 'day_7') metrics[cutoff].ever_verified = summarize(eligible.map((i, index) =>
        ['alert', 'widget'].map(branch => i.verified[branch] <= i.first + 7 * DAY ? 'yes' : outcome(rows[index]['ever_' + branch]))));
    }
    metrics.diagnostics = Object.fromEntries(['grant_without_pending', 'unsupported_pin'].map(d =>
      [d, group.filter(i => i.diagnostics.has(d)).length]));
    result[platform] = metrics;
  }
  return result;
}

if (require.main === module) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'as-of': { type: 'string' }, 'exclude-ids': { type: 'string' } } });
  const at = Date.parse(values['as-of']);
  if (positionals.length !== 1 || !Number.isFinite(at)) throw new Error('Usage: node scripts/return-setup-report.js EXPORT.jsonl --as-of ISO_DATE [--exclude-ids FILE]');
  const excluded = values['exclude-ids'] ? new Set(fs.readFileSync(values['exclude-ids'], 'utf8').split(/\r?\n/)) : new Set();
  const input = readline.createInterface({ input: fs.createReadStream(positionals[0]), crlfDelay: Infinity });
  report(input, at, excluded).then(data => console.log(JSON.stringify(data, null, 2))).catch(err => { console.error(err.message); process.exitCode = 1; });
}
module.exports = { report };
