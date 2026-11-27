// The widget compiler serializes only the layout function. Keep helpers and values
// inside it so the WidgetKit extension can render the timeline in its own JS context.
import {
  AccessoryWidgetBackground,
  Circle,
  Divider,
  HStack,
  Rectangle,
  Spacer,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  background,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  offset,
  padding,
  rotationEffect,
  truncationMode,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WidgetPayload } from '@/widget/payload';

function PrayerTimesWidgetLayout(rawPayload: WidgetPayload, environment: WidgetEnvironment) {
  'widget';

  const p = (rawPayload ?? {}) as Partial<WidgetPayload>;
  const family = environment.widgetFamily;
  const mono = environment.widgetRenderingMode === 'accented' || environment.widgetRenderingMode === 'vibrant';
  const dark = p.theme === 'dark' || (p.theme !== 'light' && environment.colorScheme === 'dark');
  // Paper, ink and brass mirror app tokens. The system supplies the accessory background.
  const c = mono
    ? { paper: '#00000000', ink: '#ffffff', muted: '#ffffffbf', brass: '#ffffff', tint: '#ffffff26' }
    : dark
      ? { paper: '#161a26', ink: '#e8e3d8', muted: '#c1c6d4', brass: '#fad486', tint: '#332e2b' }
      : { paper: '#f6f3ed', ink: '#1a1712', muted: '#6f6456', brass: '#805b1f', tint: '#fff0cd' };

  const rows = Array.isArray(p.rows) ? p.rows : [];
  const prayers = rows.filter(row => !row.isMarker);
  const location = p.location || '';
  const hijri = p.hijri || '';
  const next = p.nextArabic || '';
  const time = p.nextTime || '–';
  const target = typeof p.nextAtMs === 'number' ? p.nextAtMs : null;
  const nextLabel = p.nextIsTomorrow ? 'I morgon' : rows.some(row => row.isNext && row.isMarker) ? 'Nästa tid' : 'Nästa bön';
  const link = widgetURL('islamse:///widget/prayer-times');
  const root = [containerBackground(c.paper, 'widget'), link];
  const accessory = [containerBackground('#00000000', 'widget'), link];
  const fit = [lineLimit(1), minimumScaleFactor(0.75)];
  const tabular = monospacedDigit();

  const caption = (value: string, size = 11) => (
    <Text modifiers={[font({ size }), foregroundStyle(c.muted), lineLimit(1), truncationMode('tail')]}>
      {value}
    </Text>
  );
  const clock = (value: string, size: number) => (
    <Text modifiers={[font({ size, weight: 'semibold' }), tabular, foregroundStyle(c.ink), ...fit]}>{value}</Text>
  );
  const countdown = (size: number) => target == null ? null : (
    <Text countsDown timerInterval={{ lower: new Date(target - 172_800_000), upper: new Date(target) }}
      modifiers={[font({ size, weight: 'medium' }), tabular, foregroundStyle(c.brass), ...fit]} />
  );

  if (family === 'accessoryInline') {
    return <Text modifiers={[tabular, link]}>{next ? `${next} ${time}` : 'Bönetider'}</Text>;
  }
  if (family === 'accessoryCircular') {
    return (
      <ZStack modifiers={accessory}>
        <AccessoryWidgetBackground />
        <VStack spacing={1}>
          {next ? caption(next, 11) : null}
          {clock(time, 17)}
        </VStack>
      </ZStack>
    );
  }
  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={2} modifiers={accessory}>
        {caption(next ? nextLabel : 'Bönetider')}
        {next ? clock(`${next}  ${time}`, 16) : caption('Öppna appen')}
        {countdown(12)}
      </VStack>
    );
  }
  if (rows.length === 0) {
    return (
      <VStack alignment="leading" spacing={5} modifiers={root}>
        <Spacer />
        <Text modifiers={[font({ size: 19, weight: 'semibold' }), foregroundStyle(c.ink)]}>Bönetider</Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(c.muted)]}>
          {p.status === 'expired' ? 'Bönetiderna behöver uppdateras. Öppna appen.' : 'Öppna appen för att läsa in bönetider.'}
        </Text>
        <Spacer />
      </VStack>
    );
  }

  const chart = (width: number, height: number) => {
    const solar = p.solar;
    if (!solar || !Array.isArray(solar.altitudes) || solar.altitudes.length < 2) return null;
    const phase = solar.altitude >= 0 ? 0 : solar.altitude < -12 ? 3 : solar.rising ? 1 : 2;
    const phases = ['Dagsljus', 'Gryning', 'Skymning', 'Natt'];
    const phaseInk = dark
      ? [c.brass, '#a7badf', '#e4b1c0', '#adb6dd']
      : [c.brass, '#4e658a', '#80536b', '#585d84'];
    const curve = mono ? c.brass : phaseInk[phase]!;
    const horizon = height * 0.18;
    const y = (angle: number) => angle >= 0
      ? horizon - (height * 0.59) * Math.min(1, angle / 64)
      : horizon + height * 0.21 * Math.min(1, -angle / 45);
    const x = (progress: number) => (progress - 0.5) * (width - 16);
    const samples = solar.altitudes.filter((_, i) => i % 2 === 0 || i === solar.altitudes.length - 1);
    return (
      <ZStack modifiers={[frame({ width, height }), accessibilityLabel(`Solens läge, ${phases[phase]}`)]}>
        <Rectangle modifiers={[frame({ width: width - 16, height: 0.5 }), foregroundStyle(c.muted), offset({ y: horizon })]} />
        {samples.slice(1).map((sample, index) => {
          const x1 = x(index / (samples.length - 1));
          const x2 = x((index + 1) / (samples.length - 1));
          const y1 = y(samples[index]!);
          const y2 = y(sample);
          return (
            <Rectangle key={index} modifiers={[
              frame({ width: Math.hypot(x2 - x1, y2 - y1) + 0.5, height: 1 }),
              foregroundStyle(curve), rotationEffect(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI),
              offset({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 }),
            ]} />
          );
        })}
        <Circle modifiers={[frame({ width: 8, height: 8 }), foregroundStyle(c.paper), offset({ x: x(solar.progress), y: y(solar.altitude) })]} />
        <Circle modifiers={[frame({ width: 5, height: 5 }), foregroundStyle(c.brass), offset({ x: x(solar.progress), y: y(solar.altitude) })]} />
      </ZStack>
    );
  };

  if (environment.levelOfDetail === 'simplified') {
    return (
      <VStack alignment="leading" spacing={4} modifiers={root}>
        {caption(nextLabel, 13)}
        <Spacer />
        {clock(next || 'Ingen kommande tid', 26)}
        {clock(time, 42)}
        <Spacer />
      </VStack>
    );
  }

  if (family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={3} modifiers={root}>
        {caption(next ? nextLabel : 'Bönetider')}
        <Spacer />
        <HStack spacing={5} alignment="center">
          <VStack alignment="leading" spacing={2}>
            {clock(next || 'Ingen tid', 19)}
            {next ? clock(time, 29) : null}
            {countdown(13)}
          </VStack>
          {next ? chart(42, 43) : null}
        </HStack>
        <Spacer />
        {caption(location || hijri)}
      </VStack>
    );
  }

  const large = family === 'systemLarge';
  const context = (
    <HStack spacing={7}>
      {caption(location || 'Bönetider')}
      <Spacer />
      {caption(hijri)}
    </HStack>
  );
  const hero = (
    <HStack spacing={8} alignment="center">
      <VStack alignment="leading" spacing={2}>
        {caption(next ? nextLabel : 'Bönetider')}
        {clock(next ? `${next}  ${time}` : 'Ingen kommande tid', large ? 24 : 21)}
        {countdown(13)}
      </VStack>
      <Spacer />
      {chart(large ? 128 : 104, large ? 67 : 48)}
    </HStack>
  );
  return (
    <VStack alignment="leading" spacing={large ? 10 : 5} modifiers={root}>
      {context}
      {hero}
      <Divider />
      {large ? (
        <VStack spacing={2}>
          {prayers.map(row => (
            <HStack key={row.key} modifiers={[
              padding({ horizontal: 6, vertical: 3 }), background(row.isCurrent ? c.tint : '#00000000'), cornerRadius(6),
            ]}>
              <Text modifiers={[font({ size: 14, weight: row.isCurrent ? 'semibold' : 'regular' }),
                foregroundStyle(row.isCurrent ? c.brass : c.muted),
                accessibilityLabel(row.isCurrent ? `${row.arabic}, pågående bön` : row.arabic), ...fit]}>{row.arabic}</Text>
              <Spacer />
              {clock(row.time, 14)}
            </HStack>
          ))}
        </VStack>
      ) : (
        <HStack spacing={2}>
          {prayers.map(row => (
            <VStack key={row.key} spacing={1} modifiers={[
              frame({ maxWidth: 1000 }), padding({ vertical: 2 }),
              background(row.isCurrent ? c.tint : '#00000000'), cornerRadius(6),
            ]}>
              <Text modifiers={[font({ size: 10, weight: row.isCurrent ? 'semibold' : 'regular' }),
                foregroundStyle(row.isCurrent ? c.brass : c.muted),
                accessibilityLabel(row.isCurrent ? `${row.arabic}, pågående bön` : row.arabic), ...fit]}>{row.arabic}</Text>
              {clock(row.time, 13)}
            </VStack>
          ))}
        </HStack>
      )}
      {large ? (
        <>
          <Spacer />
          <Divider />
          <HStack>
            {caption('Fajr i morgon', 12)}
            <Spacer />
            {clock(p.tomorrowFajr || '–', 14)}
          </HStack>
        </>
      ) : null}
    </VStack>
  );
}

const PrayerTimesWidget = createWidget<WidgetPayload>('PrayerTimesWidget', PrayerTimesWidgetLayout);
export default PrayerTimesWidget;
