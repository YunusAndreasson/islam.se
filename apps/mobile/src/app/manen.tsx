// Månen — the Moon, and where we are in the Hijri month.
//
// The Hijri calendar is lunar, and until this screen the app showed the date without ever
// showing the thing it counts. It also shipped a `hijriOffset` setting whose only purpose is
// to move that date onto the local sighting, with nothing anywhere to explain why it would
// ever need moving. Both gaps close here: the Moon is drawn at tonight's real phase, tilted
// the way it actually leans over the reader's own horizon, on a ring that is the month.
//
// It is deliberately the qibla dial's TWIN — same face, same ticks, same index and hub, from
// theme/dial; same instrument underneath, from lib/useAim — because they are two readings of
// one device. `På himlen` turns the ring into a horizon and swings the needle to where the
// Moon actually is, so the phone can be held up and walked round until it points at the real
// thing. Every month in this calendar has begun that way for fourteen centuries; an app that
// only ever printed a computed number would be quietly replacing the practice rather than
// serving it.
//
// SO THE SCREEN OPENS THERE. `Månaden` was the landing mode while the sky was an extra the
// switch could reveal, and that had the arithmetic — the part the reader is told never to
// take as the ruling — greeting them first, with the observation they are actually asked to
// make one tap behind it. Opening on `På himlen` puts the sky first and the reckoning second,
// which is the order the religion puts them in.
//
// AND IT BEHAVES LIKE THE COMPASS. The same warmth ramp, the same instruction ("Vrid åt
// höger"), the same single confirming tap at the moment you are on it — because a reader who
// has found the qibla once already knows how to find the Moon, and being taught a second
// vocabulary for the same gesture is a cost with nothing bought by it. What differs is only
// what the words are ABOUT: a Moon under the horizon is a direction you can face and still
// see nothing, and the screen says so rather than congratulating you.
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
import { useKeepAwake } from 'expo-keep-awake';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoonAlmanacSheet } from '@/components/moon/MoonAlmanacSheet';
import { MoonDial, type MoonDialMode } from '@/components/moon/MoonDial';
import { MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { MoonMonthSheet } from '@/components/moon/MoonMonthSheet';
import { MoonNoteRow } from '@/components/moon/MoonNoteRow';
import { SegmentedChoice } from '@/components/settings/SegmentedChoice';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ModalBar } from '@/components/ui/ModalBar';
import { PlaceHeader } from '@/components/ui/PlaceHeader';
import { type PillTone, StatusPill } from '@/components/ui/StatusPill';
import { TURN_CUES } from '@/components/ui/turnCues';
import { type AimStatus, type AimTurn, compassPoint } from '@/lib/aim';
import { hapticLight, hapticSelection, hapticSuccess } from '@/lib/haptics';
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
import {
  openSystemSettings,
  openSystemSettingsA11yLabel,
  openSystemSettingsLabel,
} from '@/lib/system-settings';
import { useAim } from '@/lib/useAim';
import { useSettings } from '@/lib/settings/context';
import { startOfZoneDay, zoneDayLength, zonePrayerDate } from '@/lib/zone-time';
import { DIAL_MAX } from '@/theme/dial';
import { mono, type Palette, space, type } from '@/theme/tokens';
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

/** ⚠️ THE ORDER FOLLOWS THE DEFAULT, and the two must move together. A segmented control is
 *  read left to right, and its first segment is where every platform puts the state you land
 *  in — so a screen that opens on `På himlen` while the switch leads with `Månaden` spends
 *  its first impression telling the reader they are on the second of two things. It also
 *  reads as an argument about precedence that this screen does not make: the sky is what the
 *  month is reckoned FROM, not the runner-up to it. */
const MODES = [
  { value: 'sky', label: 'På himlen' },
  { value: 'month', label: 'Månaden' },
] as const satisfies readonly { value: MoonDialMode; label: string }[];

/** The mode the screen opens in — and, per the note above, the FIRST entry in `MODES`. See
 *  the top of the file for why it is the sky: the reader who wants the calendar is one tap
 *  away, and the switch says so in plain words. */
const INITIAL_MODE: MoonDialMode = MODES[0].value;

/** The pill's line: one mark and one banded sentence for whichever state the instrument is
 *  in. Banded is the operative word — this renders into an `accessibilityLiveRegion`, so a
 *  value that moves with the sensor would have TalkBack announcing continuously. The live
 *  degrees live in the caption underneath, which is read on demand. The qibla compass has the
 *  same function, in the same order, with the same three fallbacks; only the target differs.
 *
 *  The Moon adds one state the qibla cannot have: you can be pointing exactly at it and see
 *  nothing, because it is under the horizon. Congratulating the reader there would be the
 *  screen claiming something they can check in one second and find false. */
function statusLine(
  mode: MoonDialMode,
  phaseName: string,
  status: AimStatus,
  turn: AimTurn | null,
  aloft: boolean,
  noCompass: boolean,
  permissionDenied: boolean,
): { icon?: IconName; text: string; tone: PillTone } {
  // In month mode the pill is not an instrument reading at all — it is what the Moon is
  // doing tonight, said in the almanac's own words. No glyph: the caller puts a drawing of
  // the Moon itself there, which says it better than any icon in the set.
  if (mode === 'month') return { text: phaseName, tone: 'quiet' };
  // The two "we cannot read a direction" states come FIRST — a lock is only reachable from a
  // trusted heading, which clears both flags, but a stale one must never be left claiming
  // you are looking at the Moon over a rose that is merely pointing north. The FACT (where
  // the Moon stands) is not lost here: it moves to the caption, which is a fact about the sky
  // over this place and holds whether or not the phone has a compass in it.
  if (noCompass || permissionDenied) {
    return { icon: 'compassRose', text: 'Riktningen räknad från norr', tone: 'quiet' };
  }
  if (status.aligned) {
    return aloft
      ? { icon: 'checkCircle', text: 'Du ser mot månen', tone: 'on' }
      : { icon: 'checkCircle', text: 'Månen är hitåt – men under horisonten', tone: 'on' };
  }
  // "Kalibrera" and then the instruction is the label and the button both. The instruction
  // alone IS the calibration.
  if (status.calibrating) return { icon: 'compassCalibration', text: 'Rör telefonen i en åtta', tone: 'neutral' };
  // Live and permitted, but no reading has arrived yet — the first frames after the switch.
  // Telling the reader to figure-eight the phone here would be asking them to fix something
  // that has not gone wrong; useAim's no-event timeout replaces this with the no-compass line
  // if none ever comes.
  if (!turn) return { icon: 'navigationArrow', text: 'Söker riktning…', tone: 'neutral' };
  return { ...TURN_CUES[turn.dir], tone: status.near ? 'near' : 'neutral' };
}

/** The next lunar eclipse worth a line: one visible from here within the season, or any
 *  eclipse at all once it is close enough to be news. */
function relevantEclipse(coords: { latitude: number; longitude: number }, now: number) {
  const e = nextLunarEclipse(coords, new Date(now), ECLIPSE_WINDOW_DAYS);
  if (!e) return null;
  if (e.visibleHere) return e;
  return e.peak.getTime() - now <= DISTANT_ECLIPSE_DAYS * 86_400_000 ? e : null;
}

/** The surfaced crescent alert keeps its decision, date and timing, but drops prose that is
 * better suited to the almanac. The original note remains the accessibility label and the
 * complete text shown in MoonAlmanacSheet. */
function compactHilalText(text: string): string {
  return text
    .replace(/^Månadens nymåne kunde först ses med blotta ögat /, 'Nymåne syntes ')
    .replace(/^Månadens nymåne kunde först skymtas med blotta ögat /, 'Nymåne skymtades ')
    .replace(/^Månadens nymåne gick först att se med kikare /, 'Nymåne syntes med kikare ')
    .replace(/^Månadens nymåne gick inte att se härifrån /, 'Nymåne syntes inte här ')
    .replace(/^Nymånen bör synas med blotta ögat /, 'Nymåne: blotta ögat ')
    .replace(/^Nymånen kan skymtas med blotta ögat vid klar horisont /, 'Nymåne: blotta ögat, klar horisont ')
    .replace(/^Nymånen syns bara med kikare /, 'Nymåne: kikare ')
    .replace(/^Nymånen går inte att se härifrån /, 'Nymåne: syns inte här ')
    .replace(/\s+[–-]\s+bäst omkring\s+/, ' · ')
    .replace(/, (\d+ min efter solnedgången)/, ' · $1');
}

export default function Manen() {
  // Finding the Moon is done by holding the phone up and standing still, which the
  // display-sleep timer reads as "nobody is here" — the same betrayal Qibla refuses. It is
  // held for the whole screen rather than for `sky` alone: the month ring is also a surface
  // someone stands and reads, and the hook releases on unmount either way.
  useKeepAwake();
  const { coords } = useLocation();
  const { settings } = useSettings();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const focused = useIsFocused();

  const [mode, setMode] = useState<MoonDialMode>(INITIAL_MODE);
  const [pickingMonth, setPickingMonth] = useState(false);
  const [readingAlmanac, setReadingAlmanac] = useState(false);
  /** How many Hijri months the sheet has been stepped from the one we are living in. Kept as
   *  an OFFSET rather than a {year, month} so it resets itself the moment the real month
   *  rolls over — a stored pair would quietly leave the sheet in last month. */
  const [monthOffset, setMonthOffset] = useState(0);

  const now = useCoarseNow(TICK_MS);
  const sky = useMoonSky(coords, now);
  // The ephemeris is keyed on the coordinate's NUMBERS, never the object: the location
  // context hands out a fresh one on every GPS fix, and an identity key would re-run every
  // search below for a position that moved two metres.
  const { latitude, longitude } = coords;

  // The instrument — the same one the qibla compass runs on, aimed at the Moon's azimuth
  // instead of at Mecca. Only in sky mode and only while focused: the magnetometer has no
  // business running behind the month ring. `request` follows the mode because opening this
  // screen ON the sky IS the explicit intent that justifies the permission prompt (the screen
  // now lands there, so this is the ordinary path, exactly as it is on Qibla) — and flipping
  // back to `Månaden` must not leave a prompt owed for an instrument nobody is looking at.
  //
  // ⚠️ AND THE PROMPT WAITS FOR A GESTURE — `request: false`, always, on this screen.
  // lib/location/context's rule is that the OS location dialog may only be raised from an
  // explicit one, and that file carries its own scar about a version which fired it from a
  // mount. Qibla is allowed to prompt because opening it IS the request; landing here is not
  // the same thing, because the map's Moon button is labelled with the phase and the date, and
  // a reader who tapped it for tonight's date never asked for a compass. So the first sight of
  // this screen only CHECKS, which is silent — and on the ordinary path, where location was
  // granted long ago for the prayer times, is indistinguishable from asking.
  //
  // Every prompt then comes from `askPermission`, called from something the reader just
  // pressed: `På himlen`, or the offer the refused state grows below. It is a call and not a
  // flag because Android grants TWO refusals — a boolean would be already-true on the second
  // press, re-run nothing, and leave the reader pressing a dead button.
  const {
    status,
    turn,
    noCompass,
    permissionDenied,
    canAskAgain,
    askPermission,
    hasReading,
    rotation,
    prox,
  } = useAim({
      active: focused && mode === 'sky',
      request: false,
      bearing: sky.azimuth,
    });
  // The rose may only turn against the phone when there is a heading worth turning against.
  // Otherwise it stays north-up and the pill says so — the honest fallback, and the only
  // state an emulator or a tablet without a magnetometer can ever show.
  // ⚠️ `hasReading` IS LOAD-BEARING HERE. `status.calibrating` is false in the COLD state too
  // — AIM_COLD is all-false — so a gate built on it alone reads "nothing read yet" as "read
  // and trusted", which is the opposite of the `reliable` flag this replaced. The visible
  // effect: leave sky mode and come back, and the rose swings to the pre-blur heading on the
  // first frame while the pill underneath still says "Söker riktning…". `hasReading` survives
  // a blur (it is a fact about the DEVICE), so returning keeps the rose where it was and a
  // genuinely cold start still leaves it north-up.
  const live =
    mode === 'sky' && hasReading && !noCompass && !permissionDenied && !status.calibrating;

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

  // Keep the readout calm when several lunar events coincide. A new-moon day can otherwise
  // show moonrise, the crescent forecast, a calendar drift and an eclipse beneath the dial —
  // all true, but all competing for the same small space. One primary row is enough on the
  // surface; the almanac remains the complete reference behind one tap.
  const surfaced = useMemo(() => {
    const candidates = notes.filter((n) => n.tier !== 'almanac');
    const primary =
      candidates.find((n) => n.action) ??
      candidates.find((n) => n.tier === 'alert') ??
      candidates.find((n) => n.tier === 'tonight');
    return primary ? [primary] : [];
  }, [notes]);
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
  // At conjunction there is no visible Moon to locate in the sky. The direction/altitude
  // caption is therefore secondary noise beside the nymåne message; the compass status and
  // almanac still provide the useful context without another line competing with the dial.
  const isNewMoon = phase === 'new' || sky.illumination < 0.005;
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

  // WHERE THE MOON IS — a fact about the sky over this place, true whether or not the phone
  // has a compass in it. That is why it lives in the caption and not in the pill: the pill
  // says what the INSTRUMENT is doing, and there are three states in which the instrument has
  // nothing to say while this line still does.
  //
  // It also has to sit outside the live region for a duller reason. The pill is announced
  // politely, this screen's clock ticks every sixty seconds and the Moon climbs about a
  // quarter of a degree in that time, so `Math.round(altitude)` rolls over every few minutes —
  // and the remaining turn moves ten times a second. Either one inside the pill has TalkBack
  // reading to someone who has not touched anything. Down here it is read on demand.
  const aloft = sky.altitude > 0;
  const skyBrief = aloft
    ? `I ${compassPoint(sky.azimuth)} · ${Math.round(sky.altitude)}° upp`
    : `Under horisonten, i ${compassPoint(sky.azimuth)}`;
  // The remaining turn joins it once there is a heading worth trusting — the same countdown
  // the qibla readout runs, in the same words, at the same 10 Hz. It changes to a MEASUREMENT
  // once the lock holds: AIM_ALIGN_RELEASE keeps a lock to 7°, so "5° kvar" printed under
  // "Du ser mot månen" would be the screen arguing with itself in two adjacent lines.
  const monthBrief = onViewedMonth ? `Dag ${hijri.day} av ${ring.length}` : `${ring.length} dagar i månaden`;
  const caption =
    mode === 'month'
      ? monthBrief
      : turn
        ? `${skyBrief} · ${turn.deg}° ${status.aligned ? 'från månen' : 'kvar'}`
        : skyBrief;
  // The SPOKEN form is built from words, never from the printed one: `skyBrief` carries a
  // degree sign and middots, and a screen reader verbalises those ("mittpunkt", "grader"
  // — or nothing at all, depending on the engine). Qibla's `factsA11y` spells its units out
  // for the same reason, and this is the line that has to match it.
  const skySpoken = aloft
    ? `Månen i ${compassPoint(sky.azimuth)}, ${Math.round(sky.altitude)} grader upp`
    : `Månen under horisonten, i ${compassPoint(sky.azimuth)}`;
  const captionA11y =
    mode === 'month'
      ? monthBrief
      : turn
        ? status.aligned
          ? `${skySpoken}. ${turn.deg} grader från månen`
          : `${skySpoken}. ${turn.deg} grader kvar, ${TURN_CUES[turn.dir].spoken}`
        : skySpoken;

  const line = statusLine(mode, PHASE_NAMES[phase], status, turn, aloft, noCompass, permissionDenied);

  // THE WAY OUT OF THE ONE STATE THIS SCREEN CAN FIX. Without the location permission the dial
  // cannot turn with the phone, and the screen says so — but a sentence naming a remedy the
  // reader cannot reach is only half of one, and this mode is now the one they land in. Which
  // offer depends on whether the OS would still listen: `canAskAgain` means the dialog is ours
  // to raise (arming `request` does exactly that, from a real gesture), and once it is false
  // the system settings are all that is left. Nothing is added to the healthy screen — this
  // exists only in the state that needs it, exactly as Qibla's does.
  const permissionEscape =
    mode === 'sky' && permissionDenied ? (
      canAskAgain ? (
        <Pressable
          onPress={askPermission}
          accessibilityRole="button"
          accessibilityLabel="Tillåt platsåtkomst så att kompassen kan vrida ratten"
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Text style={styles.linkText}>Tillåt platsåtkomst</Text>
          <Icon name="place" size={18} color={c.accent} />
        </Pressable>
      ) : (
        <Pressable
          onPress={openSystemSettings}
          accessibilityRole="button"
          accessibilityLabel={openSystemSettingsA11yLabel('plats')}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Text style={styles.linkText}>{openSystemSettingsLabel()}</Text>
          <Icon name="externalLink" size={18} color={c.accent} />
        </Pressable>
      )
    ) : null;

  // ONE confirming tap at the moment you arrive, not a buzz every frame while you hold it —
  // lib/haptics' class 1, an outcome reached, the same call the qibla lock makes. And the
  // announcement, because the pill's polite live region is honoured on Android only: on iOS
  // the single moment this mode exists for would otherwise pass in silence for a reader who
  // cannot see the dial warm.
  //
  // The words follow the sky, not the compass. Facing a Moon that has not risen is a real
  // achievement of aim and a real nothing to look at, and the screen has to say both.
  const wasAligned = useRef(false);
  useEffect(() => {
    if (mode !== 'sky' || !status.aligned) {
      wasAligned.current = false;
      return;
    }
    if (wasAligned.current) return;
    wasAligned.current = true;
    hapticSuccess();
    // ⚠️ NOT ON ANDROID. `accessibilityLiveRegion` is honoured on Android only, and the pill
    // has just changed to this exact sentence — announcing it here as well has TalkBack say
    // it twice at the one moment the mode exists for. This call exists for iOS, where the
    // live region is ignored and the dial itself is hidden from assistive tech.
    if (Platform.OS !== 'android') {
      AccessibilityInfo.announceForAccessibility(
        aloft ? 'Du ser mot månen' : 'Månen är hitåt, men under horisonten',
      );
    }
  }, [mode, status.aligned, aloft]);

  // The other edge worth speaking, and Qibla's twin of it: entering calibration freezes the
  // rose mid-turn. A sighted reader sees that happen; without this a screen-reader user is
  // simply not told, and the pill's own line ("Rör telefonen i en åtta") says what to do
  // without saying what changed. Held for a beat first — `calibrating` has NO hysteresis
  // (deriveAimStatus cuts hard at HEADING_ACCURACY_MIN) and the OS-reported level oscillates
  // across that line several times a second during warm-up, so announcing on every crossing
  // would talk continuously over the very reader this is for. It says something the pill does
  // not, so it is not gated to iOS the way the lock above is.
  const wasCalibrating = useRef(false);
  useEffect(() => {
    if (mode !== 'sky' || !status.calibrating) {
      wasCalibrating.current = false;
      return;
    }
    if (wasCalibrating.current) return;
    const t = setTimeout(() => {
      wasCalibrating.current = true;
      AccessibilityInfo.announceForAccessibility(
        'Kompassen kalibreras – rosen står still tills riktningen är tillförlitlig',
      );
    }, 900);
    return () => clearTimeout(t);
  }, [mode, status.calibrating]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="close" fallback="/bonetider" />
      <PlaceHeader title="Månen" what="tiderna" />

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
            rotation={rotation}
            prox={prox}
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
              // Choosing the sky IS the gesture that justifies the prompt.
              if (next === 'sky') askPermission();
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
          {/* ⚠️ BOTH SLOTS BELOW ARE FIXED-HEIGHT AND THAT IS THE WHOLE POINT. The instrument
              above and this readout share the screen's leftover height between them, so
              anything in here that changes height moves the dial with it — which is how
              pressing the switch came to slide the whole instrument nine points and make the
              Moon appear to jump. Reserving the worst case costs a band of air on the short
              days and buys a dial that does not move when the switch above it is pressed. */}
          <View style={styles.statusSlot}>
            <StatusPill
              icon={line.icon}
              // Month mode has no glyph in the set worth using: a drawing of tonight's actual
              // Moon says "waxing crescent" better than any icon could, and it is the same
              // drawing the dial above is showing, at 16 dp.
              leading={
                line.icon ? undefined : (
                  <MoonDisc size={16} illumination={sky.illumination} tilt={sky.limbAngle} {...ink} />
                )
              }
              text={line.text}
              tone={line.tone}
              c={c}
            />
          </View>

          {/* Where the Moon is, and how far there is left to turn. Reserved in BOTH modes so
              the switch cannot move the dial: see the note on `statusSlot`. Read on demand
              rather than announced, which is what lets a value that moves at 10 Hz live here
              at all. */}
          <View
            style={[styles.captionSlot, isNewMoon && mode !== 'month' && styles.captionSlotQuiet]}
            accessible={!isNewMoon || mode === 'month'}
            accessibilityRole={!isNewMoon || mode === 'month' ? 'text' : undefined}
            accessibilityLabel={!isNewMoon || mode === 'month' ? captionA11y : undefined}
          >
            {!isNewMoon || mode === 'month' ? (
              <Text style={styles.caption} numberOfLines={2}>
                {caption}
              </Text>
            ) : null}
          </View>

          {/* The hero stays the DATE in both modes. The switch changes what the instrument is
              pointed at, not what the screen is about. */}
          <Pressable
            onPress={() => {
              hapticLight();
              setPickingMonth(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${hijri.day} ${HIJRI_MONTHS[hijri.month - 1]} ${hijri.year}, ${civilLine}. ${facts}. ${
              mode === 'month' ? 'Öppnar månadskalendern med alla dagar.' : 'Visa hela månaden.'
            }`}
            accessibilityHint={mode === 'month' ? 'Öppnar månadskalendern med alla dagar.' : 'Öppnar månadens dagar.'}
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
              hint={note.action ? 'Öppnar Inställningar.' : 'Öppnar månens detaljer.'}
              compactText={note.tier === 'alert' && /nymåne/i.test(note.text) ? compactHilalText(note.text) : undefined}
            />
          ))}
          {permissionEscape}
          {/* Only when the rise/set row is missing — a civil day at high latitude can produce
              neither — is the door left with nothing to ride on. */}
          {hasAlmanac && !surfaced.some((n) => n.tier === 'tonight') ? (
            <Pressable
              onPress={openAlmanac}
              accessibilityRole="button"
              accessibilityLabel="Månens detaljer"
              accessibilityHint="Upp- och nedgång, kommande faser och förmörkelser."
              style={({ pressed }) => [styles.almanacTap, pressed && styles.pressed]}
            >
              <Text style={styles.almanacText}>Månens detaljer</Text>
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
    // ⚠️ RESERVED IN BOTH MODES, and never conditional on having something to put in it. The
    // instrument above and this readout share the screen's leftover height, so a row that
    // exists in one mode and not the other moves the dial every time the switch is pressed —
    // which is exactly the "moon jumps" the fixed status slot above was written to stop. The
    // caption has something true to say in both modes anyway (where the Moon is tonight is
    // not a fact about the compass), so nothing is being padded out with air here.
    // TWO lines of `caption` (lineHeight 18) plus a little, because the Text inside is allowed
    // two — and a slot that reserves one is a slot that moves the dial the first time a long
    // reading wraps. `Under horisonten, i nordväst · 137° kvar` is about 310 dp of mono at
    // the default size, which clears a 375 pt phone and does not clear a 320 pt one.
    captionSlot: { alignSelf: 'stretch', minHeight: 40, alignItems: 'center', justifyContent: 'center' },
    captionSlotQuiet: { minHeight: 8 },
    caption: { ...type.caption, color: c.inkMuted, textAlign: 'center', ...mono },

    dateTap: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    factsBalance: { width: 18 },
    factsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
    dateLine: { ...type.headline, color: c.ink, textAlign: 'center', flexShrink: 1 },
    // The year keeps the size of the line it sits on and only loses the ink: it is the
    // least-consulted number here, and it should not be read before the month.
    yearText: { color: c.inkMuted, ...mono },

    // Centred as a BLOCK, with its rows sharing one left edge inside it. Stretched, the
    // single row under a centred pill, a centred date and a centred fact line was the one
    // thing on the readout hanging off the left margin.
    // Keep the note as a centred reading block. Without an explicit width/alignment the row
    // stretches to the screen edge while its text stays left-anchored beside the bullet.
    notes: { alignSelf: 'stretch', alignItems: 'center', gap: space.xs, marginTop: space.xl },
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
    // The permission offer. Borrows Qibla's link shape rather than inventing a third.
    link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingHorizontal: space.sm },
    linkText: { ...type.bodyStrong, color: c.accent },
    pressed: { opacity: 0.6 },
  });
}
