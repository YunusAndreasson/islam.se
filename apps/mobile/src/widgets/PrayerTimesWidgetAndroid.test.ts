// The Android widget's layout, run the way the device runs it: the 'widget' function as the
// string the Babel widgets plugin serialises, evaluated standalone with the runtime's globals.
//
// Why not just render it: on a device this string is evaluated with ONLY the Compose
// components, their modifiers and a JSX runtime in scope, and Glance draws only some of
// those components — anything else becomes the text "View not found" on the home screen.
// Here the globals are exactly the five components the renderer draws
// (ExpoWidgetEmittableTree.toPeekNodes) and the modifiers it applies, so reaching for any
// other component, or for a module-level helper, fails in this test instead.
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { type LatLng, PRAYER_LABELS } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { oracleTimes } from '@/test-utils/prayer-oracle';
import { type AndroidWidgetSnapshot, buildAndroidSnapshot, selectEntry } from '@/widget/android-snapshot';
import PrayerTimesWidgetAndroid from './PrayerTimesWidgetAndroid';

jest.mock('expo-widgets', () => ({
  createWidget: jest.fn((name: string, layout: unknown) => ({ name, layout })),
}));
// Real modifiers would reach for the native module; the layout string never sees them anyway.
jest.mock('@expo/ui/jetpack-compose/modifiers', () => ({}));

const COMPONENTS = ['Box', 'Column', 'Row', 'Spacer', 'Text'] as const;
const MODIFIERS = ['background', 'cornerRadius', 'fillMaxSize', 'height', 'padding', 'paddingAll', 'width'];

interface WidgetNode {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
}

/** Evaluate the serialised layout as the widget runtime does, and render `props` with it. */
function render(props: AndroidWidgetSnapshot | undefined, environment: Record<string, unknown> = {}) {
  const layout = (PrayerTimesWidgetAndroid as unknown as { layout: unknown }).layout;
  if (typeof layout !== 'string') {
    throw new Error(
      "createWidget did not receive a string: the 'widget' directive was not serialised by " +
        "babel-preset-expo's widgets plugin, so the device would get no layout at all.",
    );
  }
  const jsx = (type: unknown, config: Record<string, unknown> | null) => ({ type, props: config ?? {} });
  const names = ['_jsx', '_jsxs', '_jsxDEV', '_Fragment', '_jsxFileName', ...COMPONENTS, ...MODIFIERS];
  const values = [
    jsx,
    jsx,
    jsx,
    'Fragment',
    'widget',
    ...COMPONENTS,
    ...MODIFIERS.map((name) => (...args: unknown[]) => ({ modifier: name, args })),
  ];
  // Evaluated from a string on purpose: that is how the device runs it.
  const fn = new Function(...names, `return (${layout});`) as (...v: unknown[]) => unknown;
  const layoutFn = fn(...values) as (p: unknown, env: unknown) => WidgetNode;
  return layoutFn(props, environment);
}

/** Every node in the rendered tree. */
function nodes(root: WidgetNode): WidgetNode[] {
  const out: WidgetNode[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node && typeof node === 'object' && 'type' in node) {
      out.push(node as WidgetNode);
      visit((node as WidgetNode).props.children);
    }
  };
  visit(root);
  return out;
}

/** The text of every Text node, in tree order. */
function texts(root: WidgetNode): string[] {
  return nodes(root)
    .filter((node) => node.type === 'Text')
    .map((node) => [node.props.children].flat().join(''));
}

const STOCKHOLM: LatLng = { latitude: 59.3293, longitude: 18.0686 };
const ref = oracleTimes(STOCKHOLM, new Date(2026, 2, 20));
const BUILT = ref.dhuhr.getTime() - 30 * 60 * 1000;
const snapshot = buildAndroidSnapshot(STOCKHOLM, DEFAULT_SETTINGS, 'Stockholm', BUILT);

/** Pin only the clock the layout reads (`Date.now()`); timers stay real. `null` renders with
 *  no props at all — what the widget gets before the app has pushed anything. (Not
 *  `undefined`: that would fall back to the default snapshot.) */
function renderAt(instant: number, props: AndroidWidgetSnapshot | null = snapshot, env = {}) {
  jest.useFakeTimers({ now: instant, doNotFake: ['setTimeout', 'setInterval', 'nextTick', 'setImmediate', 'queueMicrotask'] });
  return render(props ?? undefined, env);
}

afterEach(() => {
  jest.useRealTimers();
});

describe('the Android widget layout', () => {
  it('names the prayer that is next at the moment it renders, not when it was pushed', () => {
    // Pushed before Ẓuhr, rendered after it: the widget must have moved on to ʿAṣr by itself.
    const rendered = renderAt(ref.dhuhr.getTime() + 5 * 60 * 1000);
    expect(texts(rendered)).toContain(PRAYER_LABELS.asr);
    expect(texts(rendered)[1]).toBe(PRAYER_LABELS.asr);
  });

  it('makes the same choice as selectEntry', () => {
    for (const t of [BUILT, ref.asr.getTime() + 2_000, ref.isha.getTime() + 2_000]) {
      const expected = selectEntry(snapshot, t)?.payload.nextArabic;
      expect(texts(renderAt(t))[1]).toBe(expected);
    }
  });

  it('shows a placeholder before the app has pushed anything', () => {
    expect(texts(renderAt(BUILT, null))).toEqual([
      'Bönetider',
      'Öppna appen för att läsa in dagens bönetider.',
    ]);
  });

  it('shows the placeholder once the snapshot has run past its horizon', () => {
    expect(texts(renderAt(snapshot.validUntilMs))[0]).toBe('Bönetider');
  });

  it('asks for a refresh after travel or a backward clock change', () => {
    expect(texts(renderAt(BUILT, snapshot, { timeZone: 'Asia/Riyadh' }))[0]).toBe('Bönetider');
    expect(texts(renderAt(BUILT - 60_000))[0]).toBe('Bönetider');
  });

  it('preserves an explicit dark theme on the expired placeholder', () => {
    const tree = renderAt(snapshot.validUntilMs, { ...snapshot, theme: 'dark' }, { colorScheme: 'light' });
    expect(tree.props.modifiers).toContainEqual({ modifier: 'background', args: ['#161a26'] });
  });

  it('ignores malformed rows without giving up the valid schedule', () => {
    const entry = snapshot.entries[0]!;
    const rows = [null, ...entry.payload.rows] as unknown as typeof entry.payload.rows;
    expect(texts(renderAt(BUILT, { ...snapshot, entries: [{ ...entry, payload: { ...entry.payload, rows } }] })))
      .toContain(entry.payload.rows[0]?.time);
  });

  it('widens the time column at 150% and prioritizes the next time when space runs out', () => {
    const large = renderAt(BUILT, snapshot, { fontScale: 1.5, widthDp: 360, heightDp: 224 });
    expect(nodes(large).filter((node) => node.type === 'Text' &&
      (node.props.style as { textAlign?: string })?.textAlign === 'end')).toHaveLength(6);
    const time = nodes(large).find((node) =>
      (node.props.style as { textAlign?: string } | undefined)?.textAlign === 'end');
    expect(time?.props.modifiers).toContainEqual({ modifier: 'width', args: [72] });
    const compact = renderAt(BUILT, snapshot, { fontScale: 2, widthDp: 280, heightDp: 128 });
    expect(texts(compact)).toEqual(['Nästa bön', PRAYER_LABELS.dhuhr, snapshot.entries[0]?.payload.nextTime, 'Stockholm']);
  });

  it('prioritizes location over the Hijri date without reducing it to a tiny two-line footer', () => {
    const location = 'Södra Sandby och Sularps samhälle';
    const withLocation = { ...snapshot, entries: snapshot.entries.map(entry => ({ ...entry,
      payload: { ...entry.payload, location } })) };
    const tree = renderAt(BUILT, withLocation);
    const footer = nodes(tree).find(node => node.props.children === location)!;
    expect(footer.props.maxLines).toBe(1);
    expect(footer.props.style).toEqual({ fontSize: 12 });
    expect(texts(tree).join(' ')).not.toContain(snapshot.entries[0]!.payload.hijri);
  });

  it('uses a Hijri footer when no location is available', () => {
    const noLocation = { ...snapshot, entries: snapshot.entries.map(entry => ({ ...entry,
      payload: { ...entry.payload, location: '' } })) };
    expect(texts(renderAt(BUILT, noLocation))).toContain(snapshot.entries[0]!.payload.hijri);
  });

  it('follows the phone into dark mode when the reader has not locked a theme', () => {
    const root = renderAt(BUILT, snapshot, { colorScheme: 'dark' });
    const paint = (root.props.modifiers as { modifier: string; args: unknown[] }[]).find(
      (m) => m.modifier === 'background',
    );
    expect(paint?.args[0]).toBe('#161a26');
  });

  it.each([
    ['light', '#f1e7d0'],
    ['dark', '#332e2b'],
  ])('groups the next prayer name and time with one highlight in %s mode', (colorScheme, highlight) => {
    const tree = renderAt(BUILT, snapshot, { colorScheme });
    const highlighted = nodes(tree).filter((node) => node.type === 'Row' &&
      (node.props.modifiers as { modifier: string; args: unknown[] }[] | undefined)?.some(
        (modifier) => modifier.modifier === 'background' && modifier.args[0] === highlight,
      ));
    expect(highlighted).toHaveLength(1);
    const next = selectEntry(snapshot, BUILT)?.payload;
    expect(texts(highlighted[0]!)).toEqual([next?.nextArabic, next?.nextTime]);
  });

  it('resets every schedule row background when the next prayer is tomorrow', () => {
    const tree = renderAt(ref.isha.getTime() + 2_000);
    const schedule = nodes(tree).filter((node) => node.type === 'Row' && node !== tree);
    expect(texts(tree).slice(0, 2)).toEqual(['I morgon', PRAYER_LABELS.fajr]);
    expect(schedule).toHaveLength(6);
    for (const row of schedule) {
      expect(row.props.modifiers).toContainEqual({ modifier: 'background', args: ['#f6f3ed'] });
    }
  });

  it('uses only components the Android renderer can draw', () => {
    for (const t of [BUILT, snapshot.validUntilMs]) {
      for (const node of nodes(renderAt(t))) {
        expect([...COMPONENTS, 'Fragment']).toContain(node.type);
      }
    }
  });
});
