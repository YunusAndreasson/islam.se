// Månen — the Moon, and where we are in the Hijri month.
//
// The Hijri calendar is lunar, and until this screen the app showed the date without ever
// showing the thing it counts. It also shipped a `hijriOffset` setting whose only purpose is
// to move that date onto the local sighting, with nothing anywhere to explain why it would
// ever need moving. Both gaps close here: the Moon is drawn at tonight's real phase, tilted
// the way it actually leans over the reader's own horizon, on a ring that is the month.
//
// It is deliberately the qibla dial's TWIN — same face, same ticks, same index and hub, from
// theme/dial — because they are two readings of the same instrument. That is also why the
// second mode exists. `På himlen` turns the ring back into a horizon and swings the needle
// to where the Moon actually is, so the phone can be held up and walked round until it
// points at the real thing. Every month in this calendar has begun that way for fourteen
// centuries; an app that only ever printed a computed number would be quietly replacing the
// practice rather than serving it.
//
// WHAT THE SCREEN WILL NOT SAY. It never announces a date as correct. The month begins when
// the crescent is seen, or when the previous month has run its thirty days; the arithmetic
// here is an aid to that and no part of the ruling. Where the calculated calendar and the
// sky have drifted far enough for a reader to see it for themselves — the full moon landing
// outside the white days — it says so as an observation and offers the offset. Which day the
// month starts on stays where it belongs, with the reader's mosque.
import { router, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoonDial, type MoonDialMode } from '@/components/moon/MoonDial';
import { almanacTilt, MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { MoonMonthSheet } from '@/components/moon/MoonMonthSheet';
import { SegmentedChoice } from '@/components/settings/SegmentedChoice';
import { Icon } from '@/components/ui/Icon';
import { ModalBar } from '@/components/ui/ModalBar';
import { hapticLight, hapticSelection } from '@/lib/haptics';
import { addHijriMonths, formatShortDate, HIJRI_MONTHS, hijriMonthLength, toHijri } from '@/lib/hijri';
import { useLocation } from '@/lib/location/context';
import { lastNewMoon, moonRiseSet, nextLunarEclipse, nextPhases } from '@/lib/moon/ephemeris';
import { firstVisibleEvening } from '@/lib/moon/hilal';
import { dayMark, monthRing } from '@/lib/moon/month';
import { PHASE_NAMES, phaseKey } from '@/lib/moon/phase';
import { moonFacts, moonNotes } from '@/lib/moon/readout';
import { useCoarseNow, useMoonSky } from '@/lib/moon/useMoon';
import { formatTime } from '@/lib/prayer-times';
import { compassPoint } from '@/lib/qibla';
import { useHeading } from '@/lib/useHeading';
import { useSettings } from '@/lib/settings/context';
import { startOfZoneDay, zoneDayLength, zonePrayerDate } from '@/lib/zone-time';
import { DIAL_MAX } from '@/theme/dial';
import { mono, type Palette, radius, shadow, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

/** How often the screen's own clock rolls. A minute, rather than the ten the map's nav disc
 *  uses: this is the surface someone stands and reads, and the moonrise time crossing while
 *  they watch should not need the app to be reopened. */
const TICK_MS = 60_000;

/** How far ahead an eclipse is worth mentioning — but only one that can be SEEN from here.
 *  A season is near enough to be a plan and far enough that most readers meet one during the
 *  year. */
const ECLIPSE_WINDOW_DAYS = 120;
/** How near an eclipse that is NOT in our sky has to be before it is worth a line. There are
 *  two to four lunar eclipses a year and most are somewhere else; without this the readout
 *  carried a permanent row about a thing the reader cannot go outside and look at, which is
 *  the definition of noise on a screen whose whole point is that you can. */
const DISTANT_ECLIPSE_DAYS = 30;

/** When the crescent question is live: the last days of a month, when the next one is about
 *  to begin, and the first days, when it just did. In between, nobody is looking for a
 *  hilāl, and a forecast for a fortnight away is noise. */
const HILAL_TAIL_DAYS = 3;

/** How far the month sheet may be walked from the month being lived. A year either way is
 *  enough to look ahead to Ramaḍān or back at last Muḥarram, and it keeps the sheet inside
 *  the span the ephemeris and the tabular calendar are both meant for. The rest of the app
 *  bounds this kind of navigation the same way (MAX_DAY_OFFSET in lib/solar/useSolarClock);
 *  left unbounded, holding a chevron walks into Hijri years where thirty small moons are
 *  computed per month for phases that mean nothing. */
const MAX_MONTH_OFFSET = 12;

const MODES: readonly { value: MoonDialMode; label: string }[] = [
  { value: 'month', label: 'Månaden' },
  { value: 'sky', label: 'På himlen' },
];

/** The next lunar eclipse worth a line: one visible from here within the season, or any
 *  eclipse at all once it is close enough to be news. */
function relevantEclipse(coords: { latitude: number; longitude: number }, now: number) {
  const e = nextLunarEclipse(coords, new Date(now), ECLIPSE_WINDOW_DAYS);
  if (!e) return null;
  if (e.visibleHere) return e;
  return e.peak.getTime() - now <= DISTANT_ECLIPSE_DAYS * 86_400_000 ? e : null;
}

export default function Manen() {
  const { coords, label, source } = useLocation();
  const { settings } = useSettings();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const focused = useIsFocused();

  const [mode, setMode] = useState<MoonDialMode>('month');
  const [pickingMonth, setPickingMonth] = useState(false);
  /** How many Hijri months the sheet has been stepped from the one we are living in. Kept as
   *  an OFFSET rather than a {year, month} so it resets itself the moment the real month
   *  rolls over — a stored pair would quietly leave the sheet in last month. */
  const [monthOffset, setMonthOffset] = useState(0);

  // Same fallback-place treatment as Qibla: a resolved place carries its own qualifier
  // ("Stockholm (standard)") when it is not a real fix, and a screen that quietly stripped it
  // would print a confident moonrise for a city the reader may be nowhere near.
  const locationIsFallback = source === 'default';
  const placeLabel = label.replace(/\s*\([^)]*\)\s*$/, '');

  const now = useCoarseNow(TICK_MS);
  const sky = useMoonSky(coords, now);
  // The ephemeris is keyed on the coordinate's NUMBERS, never the object: the location
  // context hands out a fresh one on every GPS fix, and an identity key would re-run every
  // search below for a position that moved two metres.
  const { latitude, longitude } = coords;

  // The heading, only in sky mode and only while focused — the magnetometer has no business
  // running behind the month ring. `request: true`: opening this screen and asking where the
  // Moon is IS the explicit intent that justifies the permission prompt, exactly as on Qibla.
  const { heading, rotation, noCompass, reliable } = useHeading({
    active: focused && mode === 'sky',
    request: mode === 'sky',
  });
  // The rose turns AGAINST the phone, so a needle pinned inside it at the Moon's azimuth
  // lands on the real Moon.
  const roseDeg = useDerivedValue(() => -rotation.value);
  const live = mode === 'sky' && !noCompass && reliable;

  // The dial is sized from the box it actually gets, not from the window — the same clamp
  // Qibla uses, and for the same reason: a width-only bound runs the instrument under the
  // readout as soon as the notes grow or Dynamic Type does.
  const { width, height } = useWindowDimensions();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox((prev) => (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
  }, []);
  const dial = useMemo(() => {
    const w = box?.w ?? width;
    const h = box?.h ?? height * 0.4;
    return Math.max(0, Math.min(w - space.xxl * 2, h - space.lg * 2, DIAL_MAX));
  }, [box, width, height]);

  // ── The almanac: everything here answers a question about the DAY, not the minute ──────
  //
  // It is keyed on the civil day for a reason that is not tidiness. Measured on desktop V8,
  // one pass is about 36 ms — the 120-day eclipse search alone is 18 ms, the crescent walk
  // 6 ms, the conjunction walk 3 ms — and under Hermes on a mid-range phone that is plausibly
  // several hundred milliseconds of blocked JS thread. Hung off the screen's 60-second clock
  // it ran that once a minute, on the one surface someone stands still and reads. None of the
  // answers move in a minute: the next eclipse changes at most once per eclipse, the
  // conjunction at most once per lunation, moonrise once per day.
  const dayStart = startOfZoneDay(now);
  const almanac = useMemo(() => {
    const coords = { latitude, longitude };
    const today = zonePrayerDate(dayStart);
    const hijri = toHijri(today, settings.hijriOffset);
    const riseSet = moonRiseSet(coords, new Date(dayStart), zoneDayLength(dayStart));
    const phases = nextPhases(new Date(dayStart));

    // Which day of the arithmetic month the coming full moon lands on. The white days are
    // 13–15, so this is the comparison a reader can make by stepping outside.
    const fullMoonHijriDay = phases.full
      ? toHijri(zonePrayerDate(phases.full.getTime()), settings.hijriOffset).day
      : null;

    // The crescent, only when someone would be asking about one — and asking about WHICH.
    // At the end of a month the next conjunction is this month's boundary, so the line is a
    // forecast. At the start of one the boundary is behind us, and the useful line is the
    // evening the crescent already in the sky first became visible from here. Anywhere in
    // between, nobody is looking for a hilāl and the row is noise.
    const monthLength = hijriMonthLength(hijri.year, hijri.month);
    const when: 'coming' | 'past' | null =
      hijri.day > monthLength - HILAL_TAIL_DAYS ? 'coming' : hijri.day <= HILAL_TAIL_DAYS ? 'past' : null;
    const conjunction =
      when === 'coming' ? phases.newMoon : when === 'past' ? lastNewMoon(new Date(dayStart)) : null;
    const found = conjunction ? firstVisibleEvening(coords, conjunction) : null;

    return {
      hijri,
      riseSet,
      nextFull: phases.full,
      nextNew: phases.newMoon,
      fullMoonHijriDay,
      hilal: found && when ? { ...found, when } : null,
      eclipse: relevantEclipse(coords, dayStart),
    };
  }, [dayStart, latitude, longitude, settings.hijriOffset]);

  // The sentences themselves are string building over what the almanac already found, so this
  // half is free and may follow the finer clock.
  const notes = useMemo(
    () =>
      moonNotes({
        ...almanac,
        illumination: sky.illumination,
        waxing: sky.waxing,
        time: formatTime,
        date: formatShortDate,
      }),
    [almanac, sky.illumination, sky.waxing],
  );

  const { hijri } = almanac;
  const white = dayMark(hijri.month, hijri.day)?.kind === 'white';
  // Brass on the white days — carried by the Moon itself, and by the dial's notches. The
  // status pill deliberately stays neutral: a brass pill under a brass moon beside brass
  // notches is three voices saying one thing, and the pill is the one that can be spared.
  const ink = useMoonInk(white);
  const noteInk = useMoonInk();
  const phase = phaseKey(sky.phaseAngle);

  // The month the RING shows: the one being lived, stepped by the sheet's chevrons. Counted
  // in whole months rather than walked one at a time — the arithmetic is exact and the cost
  // does not grow with the offset.
  const viewed = useMemo(
    () => addHijriMonths(hijri.year, hijri.month, monthOffset),
    [hijri.year, hijri.month, monthOffset],
  );
  const ring = useMemo(() => monthRing(viewed.year, viewed.month), [viewed.year, viewed.month]);
  const onViewedMonth = viewed.year === hijri.year && viewed.month === hijri.month;

  // Where the Moon is. This does not depend on the phone's compass at all — it is a fact
  // about the sky over this place — so it is stated on its own and the heading only decides
  // whether the DIAL can be trusted to be turned the right way round.
  const skyFact =
    sky.altitude > 0
      ? `Månen står i ${compassPoint(sky.azimuth)}, ${Math.round(sky.altitude)}° upp`
      : `Månen är under horisonten, i ${compassPoint(sky.azimuth)}`;

  const status =
    mode === 'month'
      ? PHASE_NAMES[phase]
      : noCompass
        ? // No magnetometer, or the permission was refused. The rose stays north-up and the
          // needle still carries the true bearing, so the reader loses the turn-with-you
          // behaviour and keeps every fact — which is worth saying rather than replacing the
          // whole line with an apology, as this screen first did.
          `${skyFact} – räknat från norr`
        : heading == null
          ? // Live and permitted, but no reading has arrived yet — the first frames after the
            // switch. Telling the reader to figure-eight the phone here would be asking them
            // to fix something that has not gone wrong; the 2.5 s no-event timeout inside
            // useHeading replaces this with the no-compass line if none ever comes.
            'Söker riktning…'
          : !reliable
            ? 'Kalibrera – rör telefonen i en åtta'
            : skyFact;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="close" fallback="/bonetider" />
      <View style={styles.header}>
        <Text style={styles.title}>Månen</Text>
        {locationIsFallback ? (
          <Pressable
            onPress={() => {
              hapticLight();
              router.push('/(settings)/byt-plats');
            }}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={({ pressed }) => [styles.placePick, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Ingen plats vald – tiderna gäller standardplatsen. Tryck för att välja stad"
          >
            <Icon name="place" size={14} color={c.accent} />
            <Text style={styles.placePickText} numberOfLines={1}>
              Välj plats
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {placeLabel}
          </Text>
        )}
      </View>

      {/* The dial is a drawing. Its notches and rotating letters convey nothing to a screen
          reader and would only clutter the swipe order — the readout below carries the state,
          and the month sheet carries the month day by day. */}
      <View
        style={styles.dialArea}
        onLayout={onAreaLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <MoonDial
          size={dial}
          mode={mode}
          ring={ring}
          today={onViewedMonth ? hijri.day : null}
          illumination={sky.illumination}
          tilt={sky.limbAngle}
          azimuth={sky.azimuth}
          altitude={sky.altitude}
          roseDeg={roseDeg}
          live={live}
          c={c}
        />
      </View>

      <View style={[styles.readout, { paddingBottom: Math.max(space.xl, space.md + insets.bottom) }]}>
        <View style={styles.modeRow}>
          <SegmentedChoice
            options={MODES}
            value={mode}
            onChange={(next) => {
              hapticSelection();
              setMode(next);
            }}
          />
        </View>

        <View style={styles.statusPill} accessible accessibilityRole="text" accessibilityLiveRegion="polite">
          <MoonDisc size={16} illumination={sky.illumination} tilt={sky.limbAngle} {...ink} />
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {/* The hero stays the DATE in both modes. The switch changes what the instrument is
            pointed at, not what the screen is about. */}
        <Pressable
          onPress={() => {
            hapticLight();
            setPickingMonth(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${hijri.day} ${HIJRI_MONTHS[hijri.month - 1]} ${hijri.year}. ${moonFacts(sky.illumination, sky.waxing, sky.ageDays)}. Visa hela månaden.`}
          accessibilityHint="Öppnar månadens dagar."
          style={({ pressed }) => [styles.dateTap, pressed && styles.pressed]}
        >
          <View style={styles.factsRow}>
            <Text style={styles.dayNum} maxFontSizeMultiplier={1.6}>
              {hijri.day}
            </Text>
            <View style={styles.monthCol}>
              <Text style={styles.monthName} numberOfLines={1}>
                {HIJRI_MONTHS[hijri.month - 1]}
              </Text>
              <Text style={styles.yearText}>{hijri.year}</Text>
            </View>
            <Icon name="calendar" size={18} color={c.accent} />
          </View>
        </Pressable>
        <Text style={styles.factLine} numberOfLines={2}>
          {moonFacts(sky.illumination, sky.waxing, sky.ageDays)}
        </Text>

        <View style={styles.notes}>
          {notes.map((note) =>
            note.action === 'hijriOffset' ? (
              <Pressable
                key={note.text}
                onPress={() => {
                  hapticLight();
                  router.push('/(settings)/installningar');
                }}
                accessibilityRole="button"
                accessibilityLabel={`${note.text}. Öppnar Inställningar.`}
                style={({ pressed }) => [styles.noteRow, pressed && styles.pressed]}
              >
                <MoonDisc size={16} illumination={note.moon} tilt={almanacTilt(note.waxing)} {...noteInk} />
                <Text style={[styles.noteText, styles.noteLink]}>{note.text}</Text>
                <Icon name="chevronRight" size={14} color={c.accent} />
              </Pressable>
            ) : (
              <View key={note.text} style={styles.noteRow}>
                <MoonDisc size={16} illumination={note.moon} tilt={almanacTilt(note.waxing)} {...noteInk} />
                <Text style={styles.noteText}>{note.text}</Text>
              </View>
            ),
          )}
        </View>
      </View>

      {pickingMonth ? (
        <MoonMonthSheet
          year={viewed.year}
          month={viewed.month}
          today={onViewedMonth ? hijri.day : null}
          offsetDays={settings.hijriOffset}
          onStepMonth={(step) =>
            setMonthOffset((o) => Math.min(MAX_MONTH_OFFSET, Math.max(-MAX_MONTH_OFFSET, o + step)))
          }
          canStepBack={monthOffset > -MAX_MONTH_OFFSET}
          canStepForward={monthOffset < MAX_MONTH_OFFSET}
          onClose={() => {
            // The ring goes back to the month being lived. A reader who wandered to Rajab and
            // closed the sheet must not be left with a dial quietly showing someone else's
            // month behind today's date.
            setMonthOffset(0);
            setPickingMonth(false);
          }}
          c={c}
        />
      ) : null}
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // No `makeDialStyles` spread here, deliberately. The face, ticks, index and hub belong to
    // the INSTRUMENT and are built inside MoonDial, which spreads them itself; this screen
    // draws none of them. (qibla.tsx does spread them, because its dial is written inline.)
    safe: { flex: 1, backgroundColor: c.paper },
    header: { paddingHorizontal: space.lg, paddingTop: space.xs },
    title: { ...type.title, color: c.ink },
    subtitle: { ...type.callout, color: c.inkMuted, marginTop: 2 },
    placePick: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    placePickText: { ...type.callout, color: c.accent, fontWeight: '600', flexShrink: 1 },

    dialArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    readout: { alignItems: 'center', paddingHorizontal: space.lg, gap: space.sm },
    // The switch is capped so it does not stretch to the full width of a tablet, where a
    // two-word segmented control spanning the screen reads as a tab bar.
    modeRow: { alignSelf: 'stretch', maxWidth: 320, width: '100%' },

    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: space.sm,
      paddingHorizontal: space.lg,
      borderRadius: radius.round,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.hairline,
      maxWidth: '100%',
      ...shadow.button,
      shadowOpacity: 0.06,
    },
    statusText: { ...type.callout, fontWeight: '600', color: c.ink, flexShrink: 1 },

    dateTap: { minHeight: 44, justifyContent: 'center' },
    factsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
    // A bespoke display numeral, the same instrument reading Qibla's bearing is — 54px,
    // capped against Dynamic Type because uncapped it takes the readout off the screen while
    // the accessibility label above carries the whole date for anyone who needs it spoken.
    dayNum: { fontSize: 54, fontWeight: '400', color: c.ink, letterSpacing: 0.5, ...mono },
    monthCol: { flexShrink: 1 },
    monthName: { ...type.bodyStrong, color: c.ink },
    yearText: { ...type.callout, color: c.inkMuted, ...mono },
    factLine: { ...type.callout, color: c.inkMuted, textAlign: 'center', ...mono },

    notes: { alignSelf: 'stretch', gap: space.xs, marginTop: space.xs },
    noteRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 22 },
    noteText: { ...type.caption, color: c.inkFaint, flexShrink: 1 },
    noteLink: { color: c.accent },
    pressed: { opacity: 0.6 },
  });
}
