// Run the serialized layouts with only extension globals. This catches accidental
// app-runtime references as well as detail leaking into a simplified presentation.
import { describe, expect, it, jest } from '@jest/globals';

import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { buildPayloadAt } from '@/widget/payload';
import { buildTimeline } from '@/widget/timeline';
import type { PrayerActivityProps } from './PrayerLiveActivity';
import PrayerLiveActivity from './PrayerLiveActivity';
import PrayerTimesWidget from './PrayerTimesWidget';
import PrayerOngoingNotification from './PrayerOngoingNotification';

jest.mock('expo-widgets', () => ({
  createWidget: jest.fn((name: string, layout: unknown) => ({ name, layout })),
  createLiveActivity: jest.fn((name: string, layout: unknown) => ({ name, layout })),
  createCustomNotification: jest.fn((name: string, layout: unknown) => ({ name, layout })),
}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({}));
jest.mock('@expo/ui/jetpack-compose/modifiers', () => ({}));

const components = ['Text', 'VStack', 'HStack', 'Spacer', 'Divider', 'ZStack', 'AccessoryWidgetBackground', 'Column'];
const modifiers = ['containerBackground', 'environment', 'font', 'foregroundStyle', 'kerning',
  'lineLimit', 'minimumScaleFactor', 'monospacedDigit', 'multilineTextAlignment', 'padding', 'paddingAll',
  'truncationMode', 'widgetURL'];
type Node = { type: string; props: Record<string, unknown> };
function render(factory: unknown, props: unknown, env: Record<string, unknown>) {
  const layout = (factory as { layout: unknown }).layout;
  expect(typeof layout).toBe('string');
  const jsx = (type: string, config: Record<string, unknown>) => ({ type, props: config ?? {} });
  const names = ['_jsx', '_jsxs', '_jsxDEV', '_Fragment', '_jsxFileName', ...components, ...modifiers];
  const values = [jsx, jsx, jsx, 'Fragment', 'widget', ...components,
    ...modifiers.map(modifier => (...args: unknown[]) => ({ modifier, args }))];
  return new Function(...names, `return (${layout});`)(...values)(props, env);
}
function nodes(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(nodes);
  if (!root || typeof root !== 'object') return [];
  if ('type' in root && 'props' in root) {
    const node = root as Node;
    return [node, ...nodes(node.props.children)];
  }
  return Object.values(root).flatMap(nodes);
}
function texts(root: unknown): string[] {
  return nodes(root).filter(n => n.type === 'Text').map(n => [n.props.children].flat().join(''));
}
const payload = buildPayloadAt({ latitude: 59.3293, longitude: 18.0686 }, DEFAULT_SETTINGS,
  Date.parse('2026-10-17T10:00:00Z'), 'Stockholm');
const activity: PrayerActivityProps = {
  nextKey: 'isha', nextArabic: 'ʿIshāʾ', nextSwedish: 'Nattbönen', nextTime: '19:30',
  nextAtMs: Date.parse('2026-10-17T17:30:00Z'), startedAtMs: Date.parse('2026-10-17T16:30:00Z'),
  isMarker: false, arrivedTitle: 'Dags för ʿIshāʾ', followingArabic: 'Fajr', followingTime: '05:30',
};

describe('serialized prayer surface layouts', () => {
  it.each(['systemSmall', 'systemMedium', 'accessoryInline', 'accessoryCircular', 'accessoryRectangular'])(
    'clears expired prayer data in %s', (widgetFamily) => {
      const entries = buildTimeline({ latitude: 59.3293, longitude: 18.0686 }, DEFAULT_SETTINGS,
        'Stockholm', Date.parse('2026-10-17T10:00:00Z'));
      const expired = entries[entries.length - 1]!.props;
      const tree = render(PrayerTimesWidget, expired, { widgetFamily });
      expect(nodes(tree).some(node => 'date' in node.props)).toBe(false);
      expect(texts(tree).join(' ')).not.toContain(payload.nextTime);
      expect(texts(tree)).toContain(widgetFamily === 'accessoryCircular' ? '–' : 'Bönetider');
    },
  );
  it('renders an iOS first-launch placeholder without app state', () => {
    const tree = render(PrayerTimesWidget, null, { widgetFamily: 'systemSmall' });
    expect(texts(tree)).toContain('Bönetider');
    expect(texts(tree).join(' ')).toContain('Öppna appen');
  });
  it('shows only the next prayer and time in an iOS simplified medium widget', () => {
    const tree = render(PrayerTimesWidget, payload, { widgetFamily: 'systemMedium', levelOfDetail: 'simplified' });
    expect(texts(tree)).toContain(payload.nextArabic);
    expect(texts(tree)).toContain(payload.nextTime);
    expect(texts(tree)).not.toContain('Stockholm');
    expect(texts(tree)).not.toContain(payload.nextSwedish);
    expect(texts(tree)).toHaveLength(3);
  });
  it('retains the full schedule in the default medium widget', () => {
    const tree = render(PrayerTimesWidget, payload, { widgetFamily: 'systemMedium' });
    for (const row of payload.rows) expect(texts(tree)).toContain(row.arabic);
  });
  it('keeps the medium hero focused and gives location a readable single-line footer', () => {
    const location = 'Södra Sandby och Sularps samhälle';
    const tree = render(PrayerTimesWidget, { ...payload, location }, { widgetFamily: 'systemMedium' });
    expect(texts(tree)).toContain(location);
    expect(texts(tree)).not.toContain(payload.nextSwedish);
    expect(texts(tree).join(' ')).not.toContain(payload.hijri);
    const footer = nodes(tree).find(node => node.props.children === location)!;
    expect(footer.props.modifiers).toEqual(expect.arrayContaining([
      { modifier: 'font', args: [{ size: 12 }] },
      { modifier: 'lineLimit', args: [1] },
      { modifier: 'truncationMode', args: ['tail'] },
    ]));
  });
  it.each(['systemSmall', 'systemMedium'])(
    'uses the Hijri date only when location is unavailable in %s', (widgetFamily) => {
      const tree = render(PrayerTimesWidget, { ...payload, location: '' }, { widgetFamily });
      expect(texts(tree)).toContain(payload.hijri);
      expect(texts(tree)).toContain(payload.nextTime);
    },
  );
  it('keeps tomorrow and sunrise explicit with quiet sentence-case headings', () => {
    const tomorrow = render(PrayerTimesWidget, { ...payload, nextIsTomorrow: true }, { widgetFamily: 'systemMedium' });
    expect(texts(tomorrow)).toContain('I morgon');
    const sunrise = { ...payload, nextIsTomorrow: false,
      rows: payload.rows.map(row => ({ ...row, isNext: row.isMarker })) };
    expect(texts(render(PrayerTimesWidget, sunrise, { widgetFamily: 'systemSmall' }))).toContain('Nästa tid');
  });
  it.each(['systemSmall', 'systemMedium', 'accessoryInline', 'accessoryCircular', 'accessoryRectangular'])(
    'provides exactly one prayer-times tap destination for %s', (widgetFamily) => {
      const tree = render(PrayerTimesWidget, payload, { widgetFamily });
      const links = nodes(tree).flatMap(node => (node.props.modifiers ?? []) as { modifier: string; args: unknown[] }[])
        .filter(modifier => modifier.modifier === 'widgetURL');
      expect(links).toEqual([{ modifier: 'widgetURL', args: ['islamse:///widget/prayer-times'] }]);
    },
  );
  it('keeps the arrived state in a simplified Live Activity', () => {
    const tree = render(PrayerLiveActivity, activity, { levelOfDetail: 'simplified', isStale: true });
    expect(texts(tree.banner)).toEqual([activity.arrivedTitle, '19:30']);
    expect(nodes(tree.banner).some(n => 'timerInterval' in n.props)).toBe(false);
  });
  it('keeps the normal Live Activity countdown system-rendered', () => {
    const tree = render(PrayerLiveActivity, activity, {});
    expect(nodes(tree.banner).some(n => 'timerInterval' in n.props)).toBe(true);
  });
  it('renders both Android notification sizes with a fixed time, not stale remaining minutes', () => {
    const tree = render(PrayerOngoingNotification, activity, { colorScheme: 'dark' });
    expect(texts(tree.collapsed)[0]).toContain('19:30');
    expect(texts(tree.expanded).join(' ')).toContain('Därefter Fajr 05:30');
    expect(nodes(tree).every(n => ['Text', 'Column'].includes(n.type))).toBe(true);
  });
});
