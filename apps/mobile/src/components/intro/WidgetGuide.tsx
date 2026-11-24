import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/Icon';
import { ANALYTICS_EVENTS, analytics } from '@/lib/analytics';
import { markSetupHandoff, widgetOfferOccasion } from '@/lib/analytics/return-setup';
import { useLocation } from '@/lib/location/context';
import { useSettings } from '@/lib/settings/context';
import { buildPayloadAt } from '@/widget/payload';
import { requestWidgetPin, supportsWidgetPin } from '@/widget/placement';
import { useColors } from '@/theme/useColors';
import { mono, type } from '@/theme/tokens';
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
  function close() { void markSetupHandoff('widget', false); onClose(); }
  async function pin() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    const result = await requestWidgetPin();
    void analytics.track(ANALYTICS_EVENTS.WIDGET_SETUP_REQUESTED, { route: 'android_pin', launcher_result: result });
    if (!mounted.current) return;
    flight.current = false;
    setBusy(false);
    if (result === 'accepted') onClose();
    else setMode('manual');
  }
  const ink = { color: c.ink };
  const muted = { color: c.inkMuted };
  const minutes = Math.max(0, Math.round(((payload.nextAtMs ?? now) - now) / 60000));
  const nextLabel = payload.nextIsTomorrow ? 'Nästa bön i morgon' : 'Nästa bön';
  const target = google ? 48 : 44;
  return <Modal visible onRequestClose={close}>
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={[column, styles.page]} onAccessibilityEscape={close}>
        <Pressable accessibilityRole="button" accessibilityLabel="Stäng" onPress={close}
          style={[styles.close, { width: target, height: target, backgroundColor: c.surface, borderColor: c.hairline }]}>
          <Icon name="close" size={22} color={c.ink} />
        </Pressable>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={[type.title, styles.title, ink]}>Bönetider på{'\n'}{google ? 'startskärmen' : 'hemskärmen'}</Text>
          <Text style={[type.lead, muted]}>Se nästa bön i {label} utan att öppna appen.</Text>
          <View accessible accessibilityLabel={`Bönetider för ${label}, ${nextLabel.toLowerCase()} ${payload.nextArabic} ${payload.nextTime}${payload.nextIsTomorrow ? '. Bönetider för i dag.' : ''}`}
            style={[styles.backdrop, { borderColor: c.hairline }]}>
            <PreviewPhoto testID="widget-preview-photo" />
            <View style={[styles.widget, { backgroundColor: c.paper, borderColor: c.hairline }]}>
              <View style={styles.hero}>
                <Text style={[type.caption, { color: google ? c.highlightText : c.inkMuted }]}>{nextLabel}</Text>
                <Text style={[type.headline, { color: google ? c.ink : c.highlightText }]}>{payload.nextArabic}</Text>
                <Text style={[type.title, mono, styles.time, ink]}>{payload.nextTime}</Text>
                {!google && <Text style={[type.caption, muted]}>om {minutes >= 60 ? Math.floor(minutes / 60) + ' tim ' : ''}{minutes % 60} min</Text>}
                <Text style={[type.caption, muted]}>{label}</Text>
              </View>
              <View style={[styles.table, { borderLeftWidth: google ? 0 : StyleSheet.hairlineWidth, borderColor: c.inkMuted }]}>
                {payload.nextIsTomorrow && <Text style={[type.caption, muted]}>I dag</Text>}
                {payload.rows.map(row => {
                  const tint = { color: row.isNext ? c.highlightText : row.key === 'sunrise' ? c.inkMuted : c.ink };
                  return <View key={row.key} style={styles.row}>
                    <Text style={[type.caption, tint]}>{row.arabic}</Text><Text style={[type.caption, mono, tint]}>{row.time}</Text>
                  </View>;
                })}
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
  page: { flex: 1, paddingHorizontal: 23, paddingVertical: 8 },
  close: { alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 24 },
  content: { gap: 12, paddingTop: 16, paddingBottom: 18 },
  title: { fontSize: 30, lineHeight: 33 },
  backdrop: { overflow: 'hidden', borderWidth: 1, borderRadius: 22, minHeight: 192, justifyContent: 'center', marginVertical: 8 },
  widget: { margin: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderRadius: 20, borderWidth: 1, padding: 14 },
  hero: { flexGrow: 1, flexBasis: 90, gap: 3 },
  time: { fontSize: 32, lineHeight: 37 },
  table: { flexGrow: 1, flexBasis: 105, paddingLeft: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8 },
  step: { flexDirection: 'row', gap: 8, alignItems: 'baseline', paddingHorizontal: 4 },
});
