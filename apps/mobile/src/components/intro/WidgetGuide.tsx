import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/Icon';
import { ANALYTICS_EVENTS, analytics } from '@/lib/analytics';
import { markSetupHandoff, widgetOfferOccasion } from '@/lib/analytics/return-setup';
import { useLocation } from '@/lib/location/context';
import { useSettings } from '@/lib/settings/context';
import { buildPayloadAt } from '@/widget/payload';
import { observeWidgetPin, requestWidgetPin, supportsWidgetPin } from '@/widget/placement';
import { useColors } from '@/theme/useColors';
import { mono, radius, space, type } from '@/theme/tokens';
import { useReadingColumn } from '@/theme/window-layout';
import { PreviewPhoto } from './PreviewPhoto';
import { FirstRunButton } from './FirstRunButton';

const android = ['Håll ned på en tom yta på startskärmen och välj Widgetar.', 'Sök efter islam.se. Håll ned Bönetider och dra den till startskärmen.'];
const ios = ['Gå till hemskärmen. Håll ned på en tom yta.', 'Tryck på Redigera och välj Lägg till widget. På äldre iOS, tryck på +.', 'Sök efter islam.se. Välj Bönetider och tryck på Lägg till widget.'];

export function WidgetGuide({ now, onClose, occasion }: { now: number; onClose: () => void; occasion?: 'first_session' | 'later' }) {
  const c = useColors();
  const column = useReadingColumn();
  const { coords, label } = useLocation();
  const { settings } = useSettings();
  const payload = buildPayloadAt(coords, settings, now, label);
  const google = Platform.OS === 'android';
  const [mode, setMode] = useState<'loading' | 'pin' | 'manual'>(google ? 'loading' : 'manual');
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const awaitingPlacement = useRef(false);
  const mounted = useRef(true);
  const openedAt = useRef(now);
  useEffect(() => {
    let current = true;
    mounted.current = true;
    void Promise.resolve(occasion ?? widgetOfferOccasion(openedAt.current)).then(visit =>
      analytics.track(ANALYTICS_EVENTS.RETURN_OFFER_VIEWED, { surface: 'widget_guide', kind: 'widget', occasion: visit }));
    void markSetupHandoff('widget', true);
    if (google) void supportsWidgetPin().then(supported => {
      if (!current) return;
      setMode(supported ? 'pin' : 'manual');
      if (!supported) void analytics.track(ANALYTICS_EVENTS.WIDGET_SETUP_REQUESTED, { route: 'android_gallery', launcher_result: 'unsupported' });
    });
    else void analytics.track(ANALYTICS_EVENTS.WIDGET_SETUP_REQUESTED, { route: 'ios_gallery', launcher_result: 'not_applicable' });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') void markSetupHandoff('widget', true);
    });
    return () => { current = false; mounted.current = false; subscription.remove(); };
  }, [google, occasion]);
  useEffect(() => {
    const subscription = observeWidgetPin(() => {
      if (awaitingPlacement.current) onClose();
    });
    return () => subscription?.remove();
  }, [onClose]);
  function close() { void markSetupHandoff('widget', false); onClose(); }
  async function pin() {
    if (flight.current) return;
    flight.current = true;
    awaitingPlacement.current = true;
    setBusy(true);
    const result = await requestWidgetPin();
    void analytics.track(ANALYTICS_EVENTS.WIDGET_SETUP_REQUESTED, { route: 'android_pin', launcher_result: result });
    if (!mounted.current) return;
    flight.current = false;
    setBusy(false);
    if (result !== 'accepted') {
      awaitingPlacement.current = false;
      setMode('manual');
    }
  }
  const ink = { color: c.ink };
  const muted = { color: c.inkMuted };
  const minutes = Math.max(0, Math.round(((payload.nextAtMs ?? now) - now) / 60000));
  const nextLabel = payload.nextIsTomorrow ? 'Nästa bön i morgon' : 'Nästa bön';
  const solar = payload.solar;
  const graphWidth = 100;
  const graphHeight = 48;
  const x = (progress: number) => 7 + (graphWidth - 14) * progress;
  const y = (altitude: number) => altitude >= 0
    ? 32 - 25 * Math.min(1, altitude / 64)
    : 32 + 9 * Math.min(1, -altitude / 45);
  const target = google ? 48 : 44;
  return <Modal visible onRequestClose={close}>
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={[column, styles.page]} onAccessibilityEscape={close}>
        <Pressable accessibilityRole="button" accessibilityLabel="Stäng" onPress={close}
          style={[styles.close, { width: target, height: target, backgroundColor: c.surface, borderColor: c.hairline }]}>
          <Icon name="close" size={22} color={c.ink} />
        </Pressable>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={[type.title, ink]}>Bönetider på{'\n'}{google ? 'startskärmen' : 'hemskärmen'}</Text>
          <Text style={[type.lead, muted]}>Se nästa bön i {label} utan att öppna appen.</Text>
          <View accessible accessibilityLabel={`Bönetider för ${label}, ${nextLabel.toLowerCase()} ${payload.nextArabic} ${payload.nextTime}${payload.nextIsTomorrow ? '. Bönetider för i dag.' : ''}`}
            style={[styles.backdrop, { borderColor: c.hairline }]}>
            <PreviewPhoto testID="widget-preview-photo" />
            <View style={[styles.widget, { backgroundColor: c.paper, borderColor: c.hairline }]}>
              <View style={styles.context}>
                <Text style={[type.caption, ink]}>{label}</Text>
                <Text style={[type.caption, muted]}>{payload.hijri}</Text>
              </View>
              <View style={styles.context}>
                <View style={styles.hero}>
                  <Text style={[type.caption, muted]}>{nextLabel}</Text>
                  <Text style={[type.headline, mono, styles.time, ink]}>{payload.nextArabic} {payload.nextTime}</Text>
                  {payload.nextAtMs != null && <Text style={[type.caption, { color: c.highlightText }]}>
                    om {minutes >= 60 ? Math.floor(minutes / 60) + ' tim ' : ''}{minutes % 60} min
                  </Text>}
                </View>
                {solar && <View style={{ direction: 'ltr', width: graphWidth, height: graphHeight, borderRadius: radius.sm, backgroundColor: c.surface }}>
                  <View style={[styles.line, { left: x(0), top: y(0), width: x(1) - x(0), backgroundColor: c.hairline }]} />
                  {solar.altitudes.slice(1).map((altitude, index) => {
                    const x1 = x(index / (solar.altitudes.length - 1));
                    const x2 = x((index + 1) / (solar.altitudes.length - 1));
                    const y1 = y(solar.altitudes[index]!);
                    const y2 = y(altitude);
                    const width = Math.hypot(x2 - x1, y2 - y1);
                    return <View key={index} style={[styles.line, { width: width + 0.5,
                      left: (x1 + x2 - width) / 2, top: (y1 + y2) / 2, backgroundColor: c.highlightText,
                      transform: [{ rotate: Math.atan2(y2 - y1, x2 - x1) + 'rad' }],
                    }]} />;
                  })}
                  <View style={{ position: 'absolute', left: x(solar.progress) - 3, top: y(solar.altitude) - 3,
                    width: 6, height: 6, borderRadius: 3, backgroundColor: c.highlightText }} />
                </View>}
              </View>
              <View style={[styles.table, { borderColor: c.hairline }]}>
                {payload.nextIsTomorrow && <Text style={[type.caption, muted]}>I dag</Text>}
                <View style={styles.schedule}>
                  {payload.rows.filter(row => !row.isMarker).map(row => {
                    const tint = { color: row.isCurrent ? c.highlightText : c.ink };
                    return <View key={row.key} style={[styles.cell, row.isCurrent && { backgroundColor: c.highlightSoft }]}>
                      <Text style={[type.caption, tint]}>{row.arabic}</Text><Text style={[type.caption, mono, tint]}>{row.time}</Text>
                    </View>;
                  })}
                </View>
              </View>
            </View>
          </View>
          {mode === 'manual' && (google ? android : ios).map((line, i) =>
            <View key={line} accessible accessibilityLabel={`${i + 1}. ${line}`} style={styles.step}>
              <Text style={[type.bodyStrong, { color: c.accent }]}>{i + 1}.</Text>
              <Text style={[type.body, muted, { flex: 1 }]}>{line}</Text>
            </View>)}
        </ScrollView>
        {mode === 'pin' && <FirstRunButton filled label="Lägg till widget" disabled={busy} onPress={() => void pin()} />}
        {google && mode === 'manual' && <FirstRunButton filled label="Klart" onPress={close} />}
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  // The three first-run panels (this, the reminder preview, the city picker) are one flow and
  // share one gutter. They had three: 20, 22 and 23.
  page: { flex: 1, paddingHorizontal: space.xl, paddingVertical: space.sm },
  close: { alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.round },
  content: { gap: space.md, paddingTop: space.lg, paddingBottom: space.xl },
  backdrop: { overflow: 'hidden', borderWidth: 1, borderRadius: radius.xl, minHeight: 192, justifyContent: 'center', marginVertical: space.sm },
  widget: { margin: space.lg, gap: space.sm, borderRadius: radius.lg, borderWidth: 1, padding: space.lg },
  context: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  hero: { flexGrow: 1, flexBasis: 125, gap: 2 },
  // The widget's own numeral, drawn the way the real widget draws it — a mock of another
  // surface, so it is not a tier of this app's scale.
  time: { fontSize: 22, lineHeight: 28 },
  table: { paddingTop: space.xs, borderTopWidth: StyleSheet.hairlineWidth, gap: space.xs },
  schedule: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { alignItems: 'center', flexGrow: 1, paddingHorizontal: space.xs, paddingVertical: 2, borderRadius: radius.sm },
  line: { position: 'absolute', height: 1 },
  step: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline', paddingHorizontal: space.xs },
});
