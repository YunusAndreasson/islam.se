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
// WHAT IS ON THE SURFACE. One instrument, one date, one line about tonight's Moon — and
// then a door. The almanac this screen can compute is large (moonrise and moonset, the next
// two instants, an eclipse a season out, the crescent forecast, the drift between the
// arithmetic and the sky) and printing all of it under the dial turned the readout into a
// stack of five true sentences with no order to them, on a screen whose whole argument is a
// single drawing. What reaches the surface now is decided by each note's `tier` in
// lib/moon/readout: the night the reader is standing in, and anything that asks them to act
// tonight. The rest is one tap away in MoonAlmanacSheet, in full, in the almanac's own order.
//
// WHAT THE SCREEN WILL NOT SAY. It never announces a date as correct. The month begins when
// the crescent is seen, or when the previous month has run its thirty days; the arithmetic
// here is an aid to that and no part of the ruling. Where the calculated calendar and the
// sky have drifted far enough for a reader to see it for themselves — the full moon landing
// outside the white days — it says so as an observation and offers the offset. Which day the
// month starts on stays where it belongs, with the reader's mosque.
import { router, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoonAlmanacSheet } from '@/components/moon/MoonAlmanacSheet';
import { MoonDial, type MoonDialMode } from '@/components/moon/MoonDial';
import { MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { MoonMonthSheet } from '@/components/moon/MoonMonthSheet';
import { MoonNoteRow } from '@/components/moon/MoonNoteRow';
import { SegmentedChoice } from '@/components/settings/SegmentedChoice';
import { Icon } from '@/components/ui/Icon';
import { ModalBar } from '@/components/ui/ModalBar';
import { hapticLight, hapticSelection } from '@/lib/haptics';
import {
  addHijriMonths,
  formatGregorian,
  formatShortDate,
  HIJRI_MONTHS,
  hijriMonthLength,
  toHijri,
} from '@/lib/hijri';
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

/** What the mode switch occupies under the dial: SegmentedChoice's own 44 dp control plus
 *  the `space.sm` it pads above and below. Subtracted from the instrument's box so the dial
 *  cannot be sized into it. */
const SWITCH_BLOCK = 44 + space.sm * 2;

/** How much of the window's height the instrument — the dial and the switch under it — may
 *  claim before DIAL_MAX or the screen's width takes over. Tuned so a phone of ordinary
 *  height lands on DIAL_MAX exactly, and a short one gives the readout its room back rather
 *  than pushing it off the bottom. */
const INSTRUMENT_SHARE = 0.46;

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
  const [readingAlmanac, setReadingAlmanac] = useState(false);
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

  // ⚠️ SIZED FROM THE WINDOW, NOT FROM THE BOX IT IS GIVEN. Qibla measures its own band and
  // clamps the dial to it, and this screen did the same — which works only while the band is
  // the LAST thing laid out. It is not any more: the instrument and the readout now share
  // the leftover height between them (see `instrument` / `readout` below), so a dial read
  // off the measured band would size the band that sizes the dial. That loop is stable today
  // only because DIAL_MAX happens to bind on a tall phone; on a short one it would oscillate.
  //
  // A window fraction is the same intent stated without the loop. The font scale divides it
  // because the readout is the part that grows under Dynamic Type, and the instrument is the
  // part that can afford to give the room back — which is exactly what the measured version
  // did, and the reason it was written that way.
  const { width, height } = useWindowDimensions();
  const dial = useMemo(() => {
    const byWidth = width - space.xxl * 2;
    const byHeight =
      (height * INSTRUMENT_SHARE) / Math.max(1, PixelRatio.getFontScale()) - SWITCH_BLOCK - space.md;
    return Math.max(0, Math.min(byWidth, byHeight, DIAL_MAX));
  }, [width, height]);

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
      /** The same instant as `hijri`, in the calendar the reader keeps their own dates in. */
      civil: today,
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

  // What the readout prints, and what waits behind the almanac's door. `tonight` is the one
  // row about the night the reader is in; `alert` is the crescent question at a month's edge,
  // an eclipse they can go outside and see, or a calendar drifted far enough to be worth
  // correcting — rare by construction, and never folded away, because a correction nobody
  // can see is a correction nobody makes.
  const surfaced = useMemo(() => notes.filter((n) => n.tier !== 'almanac'), [notes]);
  // No door when there is nothing new behind it.
  const hasAlmanac = notes.length > surfaced.length;

  const openSettings = useCallback(() => {
    hapticLight();
    router.push('/(settings)/installningar');
  }, []);
  const openAlmanac = useCallback(() => {
    hapticLight();
    setReadingAlmanac(true);
  }, []);

  const { hijri } = almanac;
  const white = dayMark(hijri.month, hijri.day)?.kind === 'white';
  // Brass on the white days — carried by the Moon itself, and by the dial's notches. The
  // status pill deliberately stays neutral: a brass pill under a brass moon beside brass
  // notches is three voices saying one thing, and the pill is the one that can be spared.
  const ink = useMoonInk(white);
  const noteInk = useMoonInk();
  const phase = phaseKey(sky.phaseAngle);
  // "73 % belyst · 9 dygn" — off the surface, into the almanac. It was the third line of the
  // hero block and the two most opaque numbers on the screen: a percentage nobody acts on,
  // and an age in dygn that has to be explained before it means anything. The pill above the
  // date already says what the Moon is doing in the language the almanac uses for it —
  // "Tilltagande måne" — which is the same fact, understood on sight. The numbers stay one
  // tap away, and stay in the spoken label of the date, where length costs nothing.
  const facts = moonFacts(sky.illumination, sky.waxing, sky.ageDays);
  // "I dag · lördag 22 augusti". The screen printed a Hijri date and nothing else, and the
  // verdict off a real device was "I don't immediately see that it is the 8th today" — twice
  // over: nothing on it said TODAY, and nothing tied 8 Rabīʿ al-awwal to a date the reader
  // already holds in their head. Both are one quiet line. It costs the line the illumination
  // percentage used to spend, and it buys the one thing the screen is for.
  // Sentence case, like every other line the app opens with. lib/relative-day's "i dag" is
  // deliberately lowercase — it is written to be spoken mid-sentence ("nästa bön i morgon") —
  // so this line states its own rather than upper-casing someone else's label.
  const civilLine = `I dag · ${formatGregorian(almanac.civil).toLowerCase()}`;

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
  // whether the DIAL can be trusted to be turned the right way round. It does not name the
  // Moon either: the pill carries a drawing of one beside the words.
  const skyFact =
    sky.altitude > 0
      ? `I ${compassPoint(sky.azimuth)}, ${Math.round(sky.altitude)}° upp`
      : `Under horisonten, i ${compassPoint(sky.azimuth)}`;

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
            ? // "Kalibrera" and then the instruction is the label and the button both. The
              // instruction alone IS the calibration.
              'Rör telefonen i en åtta'
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

      {/* THE INSTRUMENT, and the switch that says what it is pointed at, as one block. The
          switch used to head the readout, which left it floating forty points under the dial
          it controls and sitting eight above a date it has nothing to do with — so it read
          as the first item of a list rather than as the dial's own label. */}
      <View style={styles.instrument}>
        {/* The dial is a drawing. Its notches and rotating letters convey nothing to a screen
            reader and would only clutter the swipe order — the readout below carries the
            state, and the month sheet carries the month day by day. The switch must stay
            OUTSIDE this wrapper or it goes silent with them. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
      </View>

      <View style={[styles.readout, { paddingBottom: Math.max(space.xl, space.md + insets.bottom) }]}>
        {/* ONE GROUP: what today is, in the sky and in the calendar. Every block in this
            readout used to sit `space.sm` from the next one, which is why a screen with four
            things on it was read as six or seven — equal gaps make equal siblings, and the
            eye had nothing to group by. The gaps say it now: tight inside a group, a whole
            `space.xl` between them. Proximity is the cheapest hierarchy there is, and it
            costs no ink at all. */}
        <View style={styles.todayGroup}>
          {/* ⚠️ THE SLOT IS FIXED-HEIGHT AND THAT IS THE WHOLE POINT. The instrument above
              and this readout share the screen's leftover height between them, so anything
              in here that changes height moves the dial with it. `Tilltagande måne` is one
              line and `Under horisonten, i sydost – räknat från norr` can be two — which is
              how pressing the switch came to slide the whole instrument nine points and make
              the Moon appear to jump. Reserving two lines costs a band of air on the
              one-line days and buys a dial that does not move when the switch above it is
              pressed. */}
          <View style={styles.statusSlot}>
            <View style={styles.statusPill} accessible accessibilityRole="text" accessibilityLiveRegion="polite">
              <MoonDisc size={16} illumination={sky.illumination} tilt={sky.limbAngle} {...ink} />
              <Text style={styles.statusText} numberOfLines={2}>
                {status}
              </Text>
            </View>
          </View>

          {/* The hero stays the DATE in both modes. The switch changes what the instrument is
              pointed at, not what the screen is about. */}
          <Pressable
            onPress={() => {
              hapticLight();
              setPickingMonth(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${hijri.day} ${HIJRI_MONTHS[hijri.month - 1]} ${hijri.year}, ${civilLine}. ${facts}. Visa hela månaden.`}
            accessibilityHint="Öppnar månadens dagar."
            style={({ pressed }) => [styles.dateTap, pressed && styles.pressed]}
          >
            <View style={styles.factsRow}>
              {/* An invisible twin of the calendar glyph on the far side, so the row centres
                  its WORDS rather than words-plus-affordance — otherwise the date sits nine
                  points left of the pill above it and the line below it, two centred things
                  and one visibly not. Cheaper than positioning the icon absolutely, and it
                  cannot overlap a long month name at large type. */}
              <View style={styles.factsBalance} />
              {/* ONE LINE, and no 54 dp display numeral. The day was set as a bespoke hero
                  figure — Qibla's big bearing, borrowed — beside a two-line month column,
                  which made the readout a second loud thing under a dial that is already the
                  loudest. Now that today's mark on the rim carries its own number in brass,
                  that figure was also the same digit twice on one screen at two sizes. The
                  drawing is the hero; this names it. */}
              <Text style={styles.dateLine} numberOfLines={2} maxFontSizeMultiplier={1.8}>
                {hijri.day} {HIJRI_MONTHS[hijri.month - 1]}{' '}
                <Text style={styles.yearText}>{hijri.year}</Text>
              </Text>
              <Icon name="calendar" size={18} color={c.accent} />
            </View>
            <Text style={styles.civilLine} numberOfLines={1}>
              {civilLine}
            </Text>
          </Pressable>
        </View>
        {/* Tonight, and anything that asks for something tonight. Usually exactly one row —
            and that row is also the door, because the rest of the almanac is more of the
            same sentence. A separate "Almanacka ›" line under it was one more thing stacked
            on the pile to say something the chevron already says. */}
        <View style={styles.notes}>
          {surfaced.map((note) => (
            <MoonNoteRow
              key={note.text}
              note={note}
              ink={noteInk}
              c={c}
              onPress={
                note.action ? openSettings : note.tier === 'tonight' && hasAlmanac ? openAlmanac : undefined
              }
              hint={note.action ? 'Öppnar Inställningar.' : 'Öppnar almanackan.'}
            />
          ))}
          {/* Only when the rise/set row is missing — a civil day at high latitude can produce
              neither — is the door left with nothing to ride on. */}
          {hasAlmanac && !surfaced.some((n) => n.tier === 'tonight') ? (
            <Pressable
              onPress={openAlmanac}
              accessibilityRole="button"
              accessibilityLabel="Almanacka"
              accessibilityHint="Upp- och nedgång, kommande faser och förmörkelser."
              style={({ pressed }) => [styles.almanacTap, pressed && styles.pressed]}
            >
              <Text style={styles.almanacText}>Almanacka</Text>
              <Icon name="chevronRight" size={14} color={c.accent} />
            </Pressable>
          ) : null}
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

      {readingAlmanac ? (
        <MoonAlmanacSheet
          notes={notes}
          facts={facts}
          onAction={() => {
            // Close before navigating: an absolutely-positioned modal left standing over a
            // screen that has just pushed another one comes back up on the way out.
            setReadingAlmanac(false);
            openSettings();
          }}
          onClose={() => setReadingAlmanac(false)}
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

    // The dial is capped at DIAL_MAX so that it and Qibla's are the same instrument, which
    // on a tall phone leaves a hundred points of slack in this band whatever is done with
    // it. Centred, that slack splits evenly above the dial and below the switch — and the
    // half below then stacked on top of the readout's own leading gap into an eighty-nine
    // point void, the largest gap on the screen, sitting exactly where the eye needs
    // continuity. Pushing the pair to the bottom instead moved the whole hundred points
    // under the title and left the screen bottom-heavy. So the slack stays centred and the
    // READOUT gives up its leading gap instead (see `notes`), which is the half that was
    // never doing any work.
    // ⚠️ `flexGrow`, NOT `flex`. RN's `flex: 1` zeroes the basis, so two such siblings split
    // the screen in half and ignore what is in them — which here means the instrument gets
    // less than the dial is tall and the drawing runs out of its own band. With the basis
    // left at `auto` each box keeps its content height and only the LEFTOVER is halved.
    //
    // And that is the point of halving it. The dial is capped at DIAL_MAX so that it and
    // Qibla's are the same instrument, which on a tall phone leaves a hundred points spare
    // whatever is done with them. All of it under the header reads as an empty top; all of
    // it centred in this band puts half straight into the seam between the switch and the
    // line that labels it — an eighty-nine point hole in the middle of the screen. Split
    // between the two bands, and pushed to the OUTSIDE of each, it comes out as air above
    // the dial and air under the last row, with an ordinary group seam between them.
    instrument: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: space.md,
    },

    // No `gap` here, deliberately: a uniform gap would also put one ABOVE the first group,
    // which lands under the instrument's own slack and doubles a seam that is already wide
    // enough. The one gap this column needs is stated on the group that needs it.
    readout: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.lg,
      paddingTop: space.lg,
    },
    todayGroup: { alignSelf: 'stretch', alignItems: 'center' },
    // The switch is capped so it does not stretch to the full width of a tablet, where a
    // two-word segmented control spanning the screen reads as a tab bar.
    //
    // ⚠️ NO `alignSelf: 'stretch'` HERE. It used to carry one, and a stretched child whose
    // width is then clamped by maxWidth resolves to flex-START, not centre: the control sat
    // hard against the readout's left padding with eighty-odd points of air to its right,
    // under a dial that is centred and above a date that is centred. Letting the parent's
    // `alignItems: 'center'` apply is the whole fix.
    modeRow: { maxWidth: 320, width: '100%' },

    // Two lines of `callout` plus the pill's own padding and border. See the note at the
    // call site — this height is what stops the dial moving between modes.
    statusSlot: { alignSelf: 'stretch', minHeight: 62, alignItems: 'center', justifyContent: 'center' },

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

    dateTap: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    civilLine: { ...type.callout, color: c.inkMuted, textAlign: 'center', marginTop: 2 },
    factsBalance: { width: 18 },
    factsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
    dateLine: { ...type.headline, color: c.ink, textAlign: 'center', flexShrink: 1 },
    // The year keeps the size of the line it sits on and only loses the ink: it is the
    // least-consulted number here, and it should not be read before the month.
    yearText: { color: c.inkMuted, ...mono },

    // Centred as a BLOCK, with its rows sharing one left edge inside it. Stretched, the
    // single row under a centred pill, a centred date and a centred fact line was the one
    // thing on the readout hanging off the left margin.
    notes: { alignSelf: 'center', gap: space.xs, marginTop: space.xl },
    // The door to the rest. Centred and quiet — it is an offer, not an instruction, and on
    // most days it is the last thing on the screen.
    almanacTap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      minHeight: 44,
      paddingHorizontal: space.sm,
    },
    almanacText: { ...type.callout, fontWeight: '600', color: c.accent },
    pressed: { opacity: 0.6 },
  });
}
