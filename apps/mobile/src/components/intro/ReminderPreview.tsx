import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSwitch } from '@/components/ui/AppSwitch';
import { alertContent } from '@/lib/alert-copy';
import { ANALYTICS_EVENTS, analytics } from '@/lib/analytics';
import { clearReminderDraft, reminderSelection, saveReminderDraft, type PrayerMask } from '@/lib/first-run';
import { useLocation } from '@/lib/location/context';
import { getNotificationPermissionState, NOTIFY_PRAYERS, upcomingPrayerAlerts } from '@/lib/notifications';
import { beginNotificationPreferenceIntent, useNotificationPermission } from '@/lib/notifications-permission';
import { buildParams, PRAYER_LABELS, PRAYER_SWEDISH_NAMES, formatTime } from '@/lib/prayer-times';
import { useSettings } from '@/lib/settings/context';
import { methodLabel } from '@/lib/settings/options';
import { sunAltitudeDeg } from '@/lib/solar/sun';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { relativeDayLabel } from '@/lib/relative-day';
import { openNotificationSettings } from '@/lib/system-settings';
import { startOfZoneDay } from '@/lib/zone-time';
import { mono, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';
import { useReadingColumn } from '@/theme/window-layout';
import { PreviewPhoto } from './PreviewPhoto';
import { FirstRunButton } from './FirstRunButton';

export function dayWord(at: Date, now: number) {
  return relativeDayLabel(Math.round((startOfZoneDay(at.getTime()) - startOfZoneDay(now)) / 86400_000));
}

export function ReminderPreview({ now, initial, placeKey, onClose, onMethod, onAnswer, occasion, source = 'first_reading' }: {
  now: number; initial: PrayerMask; placeKey: string; onClose: () => void;
  source?: 'first_reading' | 'settings_recovery'; onMethod: () => void; onAnswer: (answer: 'granted' | 'denied' | 'unknown') => void; occasion: 'first_session' | 'later';
}) {
  const c = useColors();
  const column = useReadingColumn();
  const { settings } = useSettings();
  const { coords, label } = useLocation();
  const { setEnabled } = useNotificationPermission();
  const [mask, setMask] = useState(initial);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let current = true;
    const refresh = () => void getNotificationPermissionState().then(state => {
      if (current) setBlocked(source === 'first_reading' && state === 'denied');
    });
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { current = false; subscription.remove(); };
  }, [source]);
  const [busy, setBusy] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void analytics.track(ANALYTICS_EVENTS.RETURN_OFFER_VIEWED, { kind: 'reminder', surface: 'notification_preview', occasion });
    return () => { alive.current = false; };
  }, [occasion]);
  const choices = useMemo(() => upcomingPrayerAlerts(coords, {
    ...settings, notifications: source === 'settings_recovery' ? { ...settings.notifications, enabled: true, prayers: DEFAULT_SETTINGS.notifications.prayers } : reminderSelection(DEFAULT_SETTINGS.notifications.prayers),
  }, now), [coords, settings, source, now]);
  const fajr = choices.find(a => a.key === 'fajr');
  const params = buildParams(settings, coords);
  // At an ordinary angle-based Fajr the sun is at the preset's depression.
  // At a substituted northern time, give the reader access to the active rules.
  const fajrAdjustment = (params.adjustments.fajr || 0) + (params.methodAdjustments.fajr || 0);
  const showCalculation = fajr && Math.abs(coords.latitude) >= 48 &&
    Math.abs(sunAltitudeDeg(coords.latitude, coords.longitude, new Date(fajr.at.getTime() - fajrAdjustment * 60000)) + params.fajrAngle) > 1;
  const count = NOTIFY_PRAYERS.filter(k => mask[k]).length;
  const first = choices.find(a => a.key !== 'sunrise' && a.key !== 'lastThird' && mask[a.key]);
  const sample = first && first.key !== 'lastThird' ? alertContent(first.key, first.at, source === 'settings_recovery' ? settings.notifications.lead[first.key] : 0) : null;
  function back() {
    beginNotificationPreferenceIntent();
    if (source === 'first_reading') void clearReminderDraft();
    onClose();
  }
  async function submit() {
    if (pending.current) return;
    if (!count) { back(); return; }
    pending.current = true;
    setBusy(true);
    if (source === 'first_reading') {
      try { await saveReminderDraft(placeKey, mask); }
      catch {
        pending.current = false;
        if (alive.current) { setWriteFailed(true); setBusy(false); }
        return;
      }
    }
    if (!alive.current) return;
    const answer = await setEnabled(true, source, source === 'settings_recovery' ? { ...settings.notifications, prayers: mask } : reminderSelection(mask), () => alive.current);
    if (!alive.current) return;
    if (source === 'first_reading' && answer === 'denied') await clearReminderDraft();
    if (!alive.current) return;
    pending.current = false;
    setBusy(false);
    if (answer) onAnswer(answer === 'undetermined' ? 'unknown' : answer);
  }
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  return <Modal visible onRequestClose={back} statusBarTranslucent={android} navigationBarTranslucent={android}>
    <SafeAreaView edges={android ? [] : undefined} style={{
      flex: 1, backgroundColor: c.paper,
      ...(android && { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }),
    }}>
      <View style={[{ flex: 1, paddingHorizontal: space.xl }, column]} onAccessibilityEscape={back}>
        <View style={{ alignItems: 'flex-start' }}><FirstRunButton label="Tillbaka" icon="back" onPress={back} /></View>
        <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}>
          <Text accessibilityRole="header" style={[type.title, { color: c.ink }]}>Påminnelser vid bönetiderna</Text>
          <Text style={[type.lead, { color: c.inkMuted }]}>{!count ? 'Välj minst en bön för att få påminnelser.'
            : (count === 5 ? 'En påminnelse när varje bön börjar i ' : 'En påminnelse vid de böner du väljer i ') + label + '.'}</Text>
          {first && sample && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.sample}>
            <PreviewPhoto testID="reminder-preview-photo" />
            <View style={styles.sampleContent}>
              <Text style={[type.caption, styles.white, styles.overPhoto]}>Första påminnelsen · {dayWord(first.fireAt, now)}</Text>
              <View style={styles.banner}><Image source={require('../../../assets/images/icon.png')} style={styles.icon} />
                <View style={{ flex: 1 }}><Text style={[type.micro, styles.white]}>islam.se</Text>
                  <Text style={[type.bodyStrong, styles.white]}>{sample.title}</Text>
                  <Text style={[type.caption, styles.white]}>{sample.body}</Text></View></View>
            </View>
          </View>}
          <View style={styles.between}><Text style={[type.bodyStrong, { color: c.ink }]}>Dina påminnelser</Text>
            <Text style={[type.caption, { color: c.inkMuted }]}>Nästa tid</Text></View>
          <View style={{ backgroundColor: c.surface, borderRadius: radius.md }}>
            {NOTIFY_PRAYERS.map((key, index) => {
              const slot = choices.find(a => a.key === key);
              const day = slot && dayWord(slot.at, now);
              const time = slot ? formatTime(slot.at) : 'Ingen beräknad tid';
              return <Pressable key={key} accessibilityRole="switch" accessibilityState={{ checked: mask[key], disabled: busy }}
                accessibilityLabel={[PRAYER_LABELS[key], PRAYER_SWEDISH_NAMES[key], day, time].filter(Boolean).join(', ')}
                disabled={busy} onPress={() => setMask(old => ({ ...old, [key]: !old[key] }))}
                style={[styles.row, { borderBottomColor: c.hairline }, index === NOTIFY_PRAYERS.length - 1 && styles.rowLast]}>
                <Text style={[type.body, { color: c.ink, flexGrow: 1 }]}>{PRAYER_LABELS[key]}</Text>
                <Text style={[type.callout, mono, { color: c.inkMuted, flexShrink: 1 }]}>{day === 'i morgon' && 'i morgon '}{time}</Text>
                <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <AppSwitch value={mask[key]} /></View>
              </Pressable>;
            })}
          </View>
          {showCalculation && <FirstRunButton label={'Beräkning vid hög latitud · ' + methodLabel(settings) + ' ›'} onPress={onMethod} />}
          {blocked && <FirstRunButton label="Öppna notisinställningar" onPress={openNotificationSettings} />}
        </ScrollView>
        {writeFailed && <Text accessibilityLiveRegion="polite" style={[type.body, { color: c.ink }]}>Det gick inte att spara ditt val. Försök igen.</Text>}
        <FirstRunButton filled disabled={busy} label={count ? 'Fortsätt' : 'Till bönetiderna'} onPress={() => void submit()} />
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.sm },
  sample: { overflow: 'hidden', borderRadius: radius.lg },
  sampleContent: { minHeight: 129, justifyContent: 'space-between', padding: space.md, gap: space.md },
  // The sample is a mock of the SYSTEM's notification over a photograph, so its colours are
  // the lock screen's and deliberately not the palette's: white type, a dark material.
  white: { color: '#fff' },
  // The caption sits on the photo's sky — the brightest part of it, a pale dusk pink — where
  // bare white type measured about 2.5:1 and all but dissolved. A soft dark halo is the
  // lock screen's own answer to text over a wallpaper, and leaves the photograph untouched
  // where a scrim would have dimmed the one part of it worth looking at.
  overPhoto: { textShadowColor: 'rgba(12,14,22,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  banner: { flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, backgroundColor: 'rgba(24,28,43,0.88)', borderRadius: radius.md },
  icon: { width: 30, height: 30, borderRadius: radius.sm },
  // 48 and a 16 dp inset: the settings rows' own pitch and edge (Toggle, OptionGroup), since
  // this is the same list of switches the reader will meet again under Påminnelser.
  row: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingVertical: space.xs,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  // A divider separates two rows; under the last one it was a stray rule along the card's
  // bottom edge.
  rowLast: { borderBottomWidth: 0 },
});
