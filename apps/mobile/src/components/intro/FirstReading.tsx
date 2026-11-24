import { router } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { AppState, type LayoutChangeEvent, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePendingBack } from '@/components/nav/usePendingBack';
import { PlacePicker } from '@/components/settings/PlacePicker';
import { Icon } from '@/components/ui/Icon';
import { ANALYTICS_EVENTS, analytics } from '@/lib/analytics';
import { notifyScheduleVerified, setReminderOrigin } from '@/lib/analytics/return-setup';
import { acceptedGpsForResume, clearReminderDraft, firstReadingEventOnce, reminderPlace, reminderSelection, observeReadingVisit, readReminderDraft, saveReminderDraft, type PrayerMask } from '@/lib/first-run';
import { formatGregorian, formatHijri } from '@/lib/hijri';
import { useIntro } from '@/lib/intro-context';
import { saveIntroStep } from '@/lib/intro';
import { MAX_PLACE_LABEL_DISTANCE_KM } from '@/lib/location/resolve';
import { useLocation, useLocationStatus } from '@/lib/location/context';
import { getExactAlarmState, readReminderAuthorization, type NextAlert, upcomingPrayerAlerts, verifyPrayerSchedule } from '@/lib/notifications';
import { noteNotificationResolved, recordReminderDenial } from '@/lib/notification-hint';
import { getPlaces, namedPlace, nearestPlace } from '@/lib/places/nearest';
import type { SwedishPlace } from '@/lib/places/data';
import { formatTime, PRAYER_LABELS, PRAYER_ORDER, type NextPrayer, type LatLng } from '@/lib/prayer-times';
import { useSettings } from '@/lib/settings/context';
import { methodLabel } from '@/lib/settings/options';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { openNotificationSettings, openExactAlarmSettings } from '@/lib/system-settings';
import type { SolarClock } from '@/lib/solar/useSolarClock';
import { mono, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';
import { useCardInsets, useReadingColumn } from '@/theme/window-layout';
import { WidgetGuide } from './WidgetGuide';
import { FirstRunButton } from './FirstRunButton';
import { dayWord, ReminderPreview } from './ReminderPreview';

type MeasuredRow = 'reading' | 'reminder' | 'widget';
type RowFrame = { y: number; height: number };
type Panel = 'city' | 'location' | 'travel' | 'preview' | 'widget' | null;

export function FirstReading({ opening, active, clock, next, times, tomorrow, onRead, onDismiss, onHeight, onLive }: {
  opening: boolean; active: boolean; clock: SolarClock; next: NextPrayer | null;
  times: Record<(typeof PRAYER_ORDER)[number], Date>; tomorrow: Date;
  onRead: () => void; onLive: () => void; onDismiss: () => void; onHeight: (height: number) => void;
}) {
  const c = useColors();
  const column = useReadingColumn();
  const inset = useSafeAreaInsets();
  const cardInsets = useCardInsets(opening ? 0 : 12);
  const { height } = useWindowDimensions();
  const { coords, source, label } = useLocation();
  const { locating, refresh, confirmFirstRunGps, keepFirstRunFallback, resumedCandidate, dismissResumedCandidate } = useLocationStatus();
  const { settings, update, settingsReady } = useSettings();
  const { complete, status } = useIntro();
  const [selectedPanel, setPanel] = useState<Panel>(null);
  const pendingTravel = status === 'pending' && settings.locationMode === 'gps' ? resumedCandidate : null;
  const panel = selectedPanel ?? (pendingTravel ? 'travel' : null);
  const [error, setError] = useState('');
  const [declined, setDeclined] = useState(false);
  const [railWidth, setRailWidth] = useState(1);
  const [retry, setRetry] = useState(0);
  const [observedAt, setObservedAt] = useState(() => Date.now());
  const [proof, setProof] = useState<{ context: string; alerts: NextAlert[]; channelBlocked?: boolean; exact: Awaited<ReturnType<typeof getExactAlarmState>> } | null>(null);
  const [draft, setDraft] = useState<PrayerMask>(DEFAULT_SETTINGS.notifications.prayers);
  const [window, setWindow] = useState<Awaited<ReturnType<typeof observeReadingVisit>>>(null);
  const [viewport, setViewport] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [rows, setRows] = useState<Partial<Record<MeasuredRow, RowFrame>>>({});
  function measure(row: MeasuredRow, event: LayoutChangeEvent) {
    const { y, height: rowHeight } = event.nativeEvent.layout;
    setRows(old => old[row]?.y === y && old[row]?.height === rowHeight ? old : { ...old, [row]: { y, height: rowHeight } });
  }
  function visible(row: MeasuredRow) {
    const frame = rows[row];
    return !!frame && viewport > 0 && frame.y < scrollY + viewport && frame.y + frame.height > scrollY;
  }
  const readingVisible = visible('reading');
  const reminderVisible = visible('reminder');
  const widgetVisible = visible('widget');
  const context = JSON.stringify([coords, settings]);
  const placeKey = reminderPlace(settings, coords, label);
  const placeIdentity = reminderPlace(settings);
  const personal = source !== 'default';
  const place = personal ? label : 'Stockholm';
  const enabled = settings.notifications.enabled;
  if (proof && (!active || !enabled || proof.context !== context)) setProof(null);
  const occasion = window === 'session_1' ? 'first_session' : 'later';
  const isLive = clock.mode === 'live' && clock.dayOffset === 0;
  const now = clock.now;
  const gpsIntent = useRef(0);
  const [requestedFix, setTravelFix] = useState<LatLng | null>(null);
  const travelFix = selectedPanel === 'travel' ? requestedFix : pendingTravel;
  const dragStart = useRef(0);
  const shown = useRef(new Set<string>());
  const stepShown = useRef('');
  const settled = useRef(false);

  useEffect(() => () => { gpsIntent.current += 1; }, []);
  useEffect(() => {
    if (!active) return;
    let current = true;
    const heartbeat = () => void observeReadingVisit().then(value => { if (current) setWindow(value); });
    heartbeat();
    const timer = setInterval(heartbeat, 60_000);
    return () => { current = false; clearInterval(timer); };
  }, [active]);
  function finish(outcome: 'completed' | 'skipped', granted = enabled) {
    if (!settled.current && status === 'pending') {
      settled.current = true;
      complete(outcome, false);
      void analytics.track(outcome === 'completed' ? ANALYTICS_EVENTS.INTRO_COMPLETED : ANALYTICS_EVENTS.INTRO_SKIPPED,
        { at_step: opening ? 'map' : 'reading', replay: false, location_source: source, reminders: granted ? 'on' : 'off' });
    }
  }
  const restoreHandoff = useEffectEvent((answer: Awaited<ReturnType<typeof readReminderAuthorization>>, mask: PrayerMask) => {
    if (answer === 'granted' || answer === 'denied') {
      if (answer === 'granted') {
        void setReminderOrigin('first_reading');
        update({ notifications: reminderSelection(mask) });
        void analytics.track(ANALYTICS_EVENTS.REMINDERS_TOGGLED, { enabled: true, source: 'first_reading' });
      } else {
        setDeclined(true);
        void recordReminderDenial();
      }
      void noteNotificationResolved();
      if (answer === 'denied') void clearReminderDraft();
      finish('completed', answer === 'granted');
    } else {
      setDraft(mask);
      setPanel('preview');
    }
  });
  useEffect(() => {
    if (!settingsReady || opening || enabled || !personal || pendingTravel) return;
    let current = true;
    void readReminderDraft(placeKey).then(async mask => {
      if (!current || !mask) return;
      const answer = await readReminderAuthorization();
      if (current) restoreHandoff(answer, mask);
    });
    return () => { current = false; };
  }, [opening, settingsReady, enabled, personal, placeKey, pendingTravel]);

  useEffect(() => {
    if (!active || !readingVisible || !isLive || panel || !next || !window) return;
    void firstReadingEventOnce(personal ? 'personal' : 'default', () => {
      void analytics.track(ANALYTICS_EVENTS.FIRST_PRAYER_READING_VIEWED, { location_source: source });
    });
  }, [active, readingVisible, isLive, panel, next, window, personal, source]);
  useEffect(() => {
    if (!active || !viewport || !window) return;
    const step = panel === 'preview' ? 'notifications' : panel === 'city' || panel === 'location' ? 'location' : opening ? 'map' : 'reading';
    if (stepShown.current !== step) {
      stepShown.current = step;
      void analytics.track(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, { step, index: opening ? 0 : panel === 'preview' ? 2 : 1, replay: false });
    }
    const surface = 'dock';
    if (opening || panel || !isLive) { shown.current.clear(); return; }
    function offer(kind: 'reminder' | 'widget') {
      const key = [surface, kind, declined, enabled].join();
      if (shown.current.has(key)) return;
      shown.current.add(key);
      void analytics.track(ANALYTICS_EVENTS.RETURN_OFFER_VIEWED, { kind, surface, occasion });
    }
    if (reminderVisible && personal && !declined && !enabled && surface === 'dock') offer('reminder');
    if (widgetVisible && surface === 'dock') offer('widget');
  }, [active, viewport, window, panel, opening, declined, enabled, occasion, personal, isLive, reminderVisible, widgetVisible]);

  useEffect(() => {
    if (!active || !settingsReady) return;
    if (!enabled || !personal) return;
    let current = true;
    void Promise.all([verifyPrayerSchedule(coords, settings), getExactAlarmState()]).then(([evidence, exact]) => {
      const { alerts } = evidence;
      if (!current) return;
      setProof({ context, alerts, exact, channelBlocked: evidence.channelBlocked });
      if (alerts.length) notifyScheduleVerified();
    }).catch(() => { if (current) setProof({ context, alerts: [], exact: 'unknown' }); });
    return () => { current = false; };
  }, [enabled, personal, settingsReady, active, coords, settings, context, retry]);
  useEffect(() => {
    if (!active || !enabled) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') { setProof(null); setRetry(n => n + 1); }
    });
    return () => sub.remove();
  }, [active, enabled]);
  const verified = active && enabled && proof?.context === context ? proof.alerts.filter(a => a.fireAt.getTime() > Math.max(observedAt, isLive ? now : 0)) : [];
  const first = verified[0];
  const firstFire = first?.fireAt.getTime();
  useEffect(() => {
    if (!firstFire) return;
    const timer = setTimeout(() => setObservedAt(Date.now()),
      Math.min(2_147_483_647, Math.max(1, firstFire - Date.now())));
    return () => clearTimeout(timer);
  }, [firstFire, observedAt]);
  const missing = useMemo(() => {
    if (!proof || !enabled) return false;
    const choices = upcomingPrayerAlerts(coords, settings, Math.max(now, observedAt));
    return Object.entries(settings.notifications.prayers).some(([key, selected]) => {
      const expected = choices.find(a => a.key === key);
      return selected && (!expected || !proof.alerts.some(a => a.key === key && a.fireAt.getTime() === expected.fireAt.getTime()));
    });
  }, [proof, enabled, coords, settings, now, observedAt]);
  const hasBell = (at: Date, key: string) => verified.some(a => a.key === key && a.at.getTime() === at.getTime());
  const places = useMemo(() => getPlaces().filter(p => ['Stockholm', 'Göteborg', 'Malmö'].includes(p.name)).slice(0, 3), []);
  const minutes = Math.max(0, Math.round(((next?.at ?? now) - now) / 60000));
  const remaining = minutes ? 'om ' + (minutes >= 60 ? Math.floor(minutes / 60) + ' tim ' : '') + minutes % 60 + ' min' : 'nu';
  const time = next ? formatTime(new Date(next.at)) : '—';
  const name = next ? PRAYER_LABELS[next.key] : 'Ingen beräknad tid';
  const home = Platform.OS === 'android' ? 'startskärmen' : 'hemskärmen';
  const normal = [type.body, { color: c.ink }];
  const muted = [type.caption, { color: c.inkMuted }];
  async function persistStep(step: number) {
    if (status !== 'pending' || await saveIntroStep(step)) return true;
    setPanel(null);
    setError('Det gick inte att spara. Försök igen.');
    return false;
  }
  function showReading() {
    setPanel(null);
    setError('');
    onRead();
  }
  function read() {
    showReading();
    void persistStep(1);
  }
  function openWidget() {
    setPanel('widget');
  }
  async function pick(p: SwedishPlace) {
    const intent = ++gpsIntent.current;
    if (!await persistStep(1) || intent !== gpsIntent.current) return;
    dismissResumedCandidate();
    void clearReminderDraft();
    update({ locationMode: 'manual', manualLocation: namedPlace(p) });
    void analytics.track(ANALYTICS_EVENTS.LOCATION_SET, { source: 'manual', context: 'intro' });
    showReading();
  }
  function closePanel() {
    gpsIntent.current += 1;
    dismissResumedCandidate();
    setError('');
    setPanel(null);
  }
  async function acceptFix(fix: LatLng) {
    const intent = ++gpsIntent.current;
    if (!await persistStep(2) || intent !== gpsIntent.current) return;
    if (fix === pendingTravel) {
      // The reader explicitly accepted a different place. Carry the exact
      // selection across that decision before publishing the new coordinate.
      const previous = await acceptedGpsForResume();
      const mask = previous && await readReminderDraft(reminderPlace(settings, previous));
      if (intent !== gpsIntent.current) return;
      try {
        if (mask) await saveReminderDraft(reminderPlace(settings, fix), mask);
      } catch { setError('Det gick inte att spara. Försök igen.'); return; }
    } else await clearReminderDraft();
    if (intent !== gpsIntent.current) return;
    confirmFirstRunGps(fix);
    update({ locationMode: 'gps' });
    void analytics.track(ANALYTICS_EVENTS.LOCATION_SET, { source: 'gps', context: 'intro' });
    showReading();
  }
  async function locate() {
    const intent = ++gpsIntent.current;
    let fix: LatLng | undefined;
    const result = await refresh('intro', coords => { fix = coords; }, true);
    if (intent !== gpsIntent.current) return;
    if (result === 'ok' && fix) {
      if (nearestPlace(fix.latitude, fix.longitude).distanceKm > MAX_PLACE_LABEL_DISTANCE_KM) {
        setTravelFix(fix);
        setPanel('travel');
      } else await acceptFix(fix);
    } else { setPanel('city'); setError('Det gick inte att hämta din plats.'); }
  }
  async function openMethod() {
    if (!await persistStep(opening ? 0 : source === 'gps' ? 2 : 1)) return;
    closePanel();
    router.push('/berakning');
  }
  const method = <Pressable accessibilityRole="button" onPress={() => void openMethod()} style={styles.method}>
    <Text style={muted}>Beräkning: {settings.calculationMethod === 'Turkey' ? 'Diyanet' : methodLabel(settings)} · <Text style={{ color: c.accent }}>Ändra</Text></Text></Pressable>;
  const bell = <Icon name="notificationsOff" size={14} color={c.highlightText} />;
  async function dismiss() {
    const intent = ++gpsIntent.current;
    if (!personal && status === 'pending') {
      try { await keepFirstRunFallback(); }
      catch { setError('Det gick inte att spara. Försök igen.'); return; }
    }
    if (intent !== gpsIntent.current) return;
    finish(personal ? 'completed' : 'skipped');
    onDismiss();
  }

  usePendingBack(active && !panel, opening ? read : dismiss);
  return <>
    <View onAccessibilityEscape={opening ? () => read() : dismiss} onLayout={e => onHeight(e.nativeEvent.layout.height)}
      style={[styles.sheet, cardInsets, { maxHeight: height * (opening ? 0.66 : 0.71), bottom: opening ? 0 : inset.bottom + 6,
        paddingBottom: opening ? Math.max(12, inset.bottom) : 8, backgroundColor: opening ? c.paper : c.surface, borderColor: c.border }]}>
      <ScrollView onLayout={e => setViewport(e.nativeEvent.layout.height)}
        scrollEventThrottle={32} onScroll={e => setScrollY(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingHorizontal: opening ? 20 : 16 }} keyboardShouldPersistTaps="handled">
        {opening ? <>
          <Pressable accessibilityRole="button" accessibilityLabel="Visa bönetiderna" onPress={() => read()} onTouchStart={e => { dragStart.current = e.nativeEvent.pageY; }}
            onTouchEnd={e => { if (e.nativeEvent.pageY - dragStart.current > 48) read(); }} style={styles.crown}>
            <View><Text style={muted}>{formatGregorian(new Date(now))}</Text>
              <Text style={[type.headline, { color: c.ink }]}>{place}<Text style={muted}>{!personal && ' · förvald'}</Text></Text></View>
            <Icon name="chevronDown" color={c.inkMuted} size={16} /></Pressable>
          <View onLayout={e => measure('reading', e)} style={[styles.reading, { borderColor: c.hairline }]}>
            <View><Text style={muted}>Nästa bön{next?.nextDay && ' · ' + dayWord(new Date(next.at), now)}</Text><Text style={[type.title, { color: c.ink }]}>{name}</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={[styles.hero, mono, { color: c.ink }]}>{time}</Text>
              <Text style={[type.body, { color: c.highlightText }]}>{remaining}</Text></View></View>
          {method}<View style={[styles.crown, { borderTopWidth: 1, borderColor: c.hairline }]}>
            <Text style={[type.bodyStrong, { color: c.ink }]}>Välj din stad</Text>
            <FirstRunButton icon="search" label="Sök ort" onPress={() => setPanel('city')} /></View>
          <View style={styles.cities}>{places.map(p => <FirstRunButton key={p.lon} outline label={p.name} onPress={() => void pick(p)} />)}</View>
        </> : <>
          <Pressable accessibilityRole="button" accessibilityLabel="Stäng tidtabellen" hitSlop={8} onPress={dismiss} style={styles.gripArea}>
            <View style={[styles.grip, { backgroundColor: c.inkFaint }]} /></Pressable>
          <View style={styles.crown}><View style={{ flexShrink: 1 }}>
            <Text style={[type.bodyStrong, { color: c.ink }]}>{formatGregorian(new Date(now))}</Text>
            <Text style={muted}>{formatHijri(new Date(now), settings.hijriOffset)}</Text></View>
            <View style={styles.controls}>{([-1, 1] as const).map(n => <Pressable key={n} accessibilityRole="button"
              accessibilityLabel={n < 0 ? 'Föregående dag' : 'Nästa dag'} onPress={() => clock.stepDay(n)} style={styles.arrow}>
              <Icon name={n < 0 ? 'chevronLeft' : 'chevronRight'} size={14} color={c.accent} /></Pressable>)}</View></View>
          {PRAYER_ORDER.map(key => {
            const highlighted = next?.at === times[key].getTime() && next.key === key;
            const confirmed = hasBell(times[key], key);
            const rowTime = formatTime(times[key]);
            return <View key={key} accessible accessibilityLabel={`${PRAYER_LABELS[key]}, ${rowTime}${confirmed ? ', påminnelse bekräftad' : ''}`} style={[styles.timeRow, highlighted && { backgroundColor: c.highlightSoft }]}>
              <Text style={[normal, highlighted && { color: c.highlightText, fontWeight: '700' }]}>{PRAYER_LABELS[key]}</Text>
              <View style={styles.controls}>{confirmed && bell}<Text style={[normal, mono]}>{rowTime}</Text></View></View>;
          })}
          {method}<View onLayout={e => measure('reading', e)} style={[styles.crown, { borderTopWidth: 1, borderColor: c.hairline }]}>
            <Text style={normal}><Text style={{ fontWeight: '700' }}>{name}</Text> {remaining}</Text>
            <Text style={[muted, { flexShrink: 1 }]}>{place}{!personal && ' · förvald'}</Text></View>
          <Pressable accessibilityRole="adjustable" accessibilityLabel="Tid på kartan" accessibilityValue={{ text: formatTime(new Date(now)) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={e => clock.setFraction(Math.min(1, Math.max(0, clock.fraction + (e.nativeEvent.actionName === 'increment' ? 1 : -1) / 48)))}
            onPress={e => clock.setFraction(Math.max(0, Math.min(1, e.nativeEvent.locationX / railWidth)))}
            onLayout={e => setRailWidth(Math.max(1, e.nativeEvent.layout.width))} hitSlop={8} style={{ paddingVertical: 4 }}>
          <View pointerEvents="none" style={[styles.rail, { backgroundColor: c.border }]}>{PRAYER_ORDER.map(k => {
            const fraction = (times[k].getTime() - clock.dayStart) / clock.dayLength;
            return fraction >= 0 && fraction <= 1 && <View key={k} style={[styles.dot, { left: `${fraction * 100}%`, backgroundColor: c.highlight }]} />;
          })}<View style={[styles.thumb, { left: `${clock.fraction * 100}%`, backgroundColor: c.highlightText }]} /></View></Pressable>
          <View style={styles.tomorrow}><Text style={muted}>{Number.isFinite(tomorrow.getTime()) ? dayWord(tomorrow, clock.todayStart).replace(/^./, ch => ch.toUpperCase()) : 'Nästa dag'} i {place} · </Text>
            {hasBell(tomorrow, 'fajr') && bell}<Text style={[type.label, { color: c.ink }]}>Fajr {formatTime(tomorrow)}</Text></View>
          {!isLive ? <FirstRunButton label="Nu" onPress={onLive} /> : declined ? <View onLayout={e => measure('widget', e)} style={[styles.widget, { backgroundColor: c.paperSunken }]}>
            <View style={{ flexShrink: 1 }}><Text style={muted}>Nästa bön</Text><Text style={normal}>{name}</Text><Text style={[type.headline, { color: c.ink }]}>{time}</Text></View>
            <View style={{ flex: 1 }}><Text style={[type.bodyStrong, { color: c.ink }]}>Vill du hellre se tiderna på {home}?</Text>
              <FirstRunButton filled label="Lägg till widget" onPress={openWidget} /></View></View>
            : <>
              {enabled ? <>
                <Text accessibilityLiveRegion="polite" style={[type.bodyStrong, { color: first ? c.highlightText : c.inkMuted }]}>
                  {first ? `${missing ? '' : 'Klart. '}${Platform.OS === 'android' && proof?.exact !== 'granted' ? 'Nästa tid är' : 'Vi påminner dig'} ${dayWord(first.fireAt, now)} kl. ${formatTime(first.fireAt)}.` : proof ? 'Ingen framtida påminnelse är bekräftad.' : 'Kontrollerar påminnelserna…'}</Text>
                {first && Platform.OS === 'android' && proof?.exact === 'unknown' && <FirstRunButton label="Kontrollera alarmåtkomst" onPress={() => setRetry(v => v + 1)} />}
                {proof?.channelBlocked && <FirstRunButton label="Öppna notisinställningar" onPress={openNotificationSettings} />}
                {first && missing && <Text style={muted}>Alla valda påminnelser kunde inte bekräftas.</Text>}
                {(!first || missing) && <FirstRunButton label="Försök igen" onPress={() => { setProof(null); setRetry(v => v + 1); }} />}
                {first && Platform.OS === 'android' && proof?.exact === 'denied' && <><Text style={muted}>Påminnelser kan komma senare.</Text><FirstRunButton label="Alarm och påminnelser ›" onPress={openExactAlarmSettings} /></>}
                <FirstRunButton label="Ändra påminnelser ›" onPress={() => router.push('/notiser')} /></>
                : <FirstRunButton filled onLayout={e => measure('reminder', e)} disabled={!settingsReady} label={personal ? 'Påminn mig vid varje bön' : 'Välj stad för påminnelser'}
                  onPress={() => { setError(''); setPanel(personal ? 'preview' : 'city'); }} />}
              <FirstRunButton onLayout={e => measure('widget', e)} label="Lägg till widget ›" onPress={openWidget} />
            </>}
        </>}
        {!!error && !panel && <Text accessibilityLiveRegion="polite" style={muted}>{error}</Text>}
      </ScrollView>
    </View>
    {panel === 'preview' && <ReminderPreview key={placeIdentity} initial={draft} now={now} placeKey={placeKey} occasion={occasion} onClose={closePanel} onMethod={() => void openMethod()}
      onAnswer={answer => { closePanel(); setDeclined(answer === 'denied'); if (answer === 'unknown') setError('Det gick inte att kontrollera notiserna. Försök igen.');
        else finish('completed', answer === 'granted'); }} />}
    {panel === 'widget' && <WidgetGuide now={now} onClose={closePanel} occasion={occasion} />}
    {panel !== null && panel !== 'widget' && panel !== 'preview' && <Modal visible onRequestClose={closePanel} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><View style={[{ flex: 1, paddingHorizontal: 20 }, column]}>
        <View style={styles.crown}><Text accessibilityRole="header" style={[type.title, { color: c.ink, flex: 1 }]}>{panel === 'city' ? 'Välj stad' : panel === 'location' || panel === 'travel' ? 'Bönetider där du är' : 'Bönetider på ' + home}</Text>
          <FirstRunButton label="Stäng" onPress={closePanel} /></View>
        {panel === 'city' ? <PlacePicker selected={settings.manualLocation} onPick={p => void pick(p)}><FirstRunButton label="Använd min plats" onPress={() => setPanel('location')} />
          {!!error && <><Text accessibilityLiveRegion="polite" style={normal}>{error}</Text><FirstRunButton label="Försök igen" disabled={locating} onPress={() => void locate()} /></>}</PlacePicker>
          : panel === 'travel' && travelFix ? <><Text style={normal}>{nearestPlace(travelFix.latitude, travelFix.longitude).distanceKm > MAX_PLACE_LABEL_DISTANCE_KM
            ? 'Din plats ligger utanför Sverige. Använd den för bönetider?' : 'Din plats har ändrats. Använd den för bönetider?'}</Text>
            <Text style={muted}>{travelFix.latitude.toFixed(2)}°, {travelFix.longitude.toFixed(2)}°</Text>
            {!!error && <Text accessibilityLiveRegion="polite" style={normal}>{error}</Text>}
            <FirstRunButton filled label="Använd den här platsen" onPress={() => void acceptFix(travelFix)} /><FirstRunButton label="Välj stad" onPress={() => setPanel('city')} /></>
          : panel === 'location' ? <><Text style={normal}>En ungefärlig plats räcker för att räkna ut dina bönetider.</Text>
            <FirstRunButton filled disabled={locating} label="Fortsätt" onPress={() => void locate()} />
            <FirstRunButton label="Välj stad" onPress={() => { gpsIntent.current += 1; setPanel('city'); }} /></>
          : null}
      </View></SafeAreaView></Modal>}
  </>;
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, overflow: 'hidden' },
  crown: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, gap: 4 },
  reading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 12, marginTop: 8 },
  hero: { fontSize: 46, fontWeight: '600', letterSpacing: -2 },
  cities: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, paddingBottom: 8 },
  method: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  gripArea: { minHeight: 22, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 38, height: 3, borderRadius: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 8 },
  rail: { height: 2, marginHorizontal: 10, marginVertical: 8 },
  dot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, top: -2 },
  thumb: { position: 'absolute', width: 8, height: 8, borderRadius: 4, top: -3 },
  tomorrow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginVertical: 8 },
  widget: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 10 },

});
