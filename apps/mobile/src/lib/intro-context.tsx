// App-wide "has the introduction run?" state, hydrated once on mount.
//
// Four consumers, and each needs a different thing from it:
//   • src/app/index.tsx  — the gate. Opens /bonetider once storage resolves.
//   • src/app/bonetider.tsx — belt-and-braces: the map's soft-ask queue must not spend
//     one of its two showings while the intro is on top of it. (A deep link could in
//     principle reach the map without passing through index.) It also reads
//     mapLessonPending to show the map lesson in place of the dock on the one landing
//     that earned it.
//   • src/app/valkommen.tsx — calls complete() when the flow finishes or is skipped, and
//     reads `replaying` for its analytics.
//   • src/lib/analytics/useAppAnalytics.ts — reads `status` (First Open) and `history`
//     (the intro_status super property).
//   • src/components/map/MapLessonCard.tsx (via bonetider.tsx) — calls dismissMapLesson()
//     once the lesson is stepped through or skipped.
//
// Mounted INSIDE SettingsProvider in _layout so the whole tree sees one value, and kept
// separate from PrayerSettings on purpose — see the header of ./intro.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { completeIntro, type IntroHistory, type IntroOutcome, type IntroStatus, loadIntro } from './intro';

/** Startup routing and the native splash have the same storage deadline. */
export const STARTUP_STORAGE_TIMEOUT_MS = 2000;

interface IntroContextValue {
  initialStep: number;
  /** 'unknown' until the storage read lands — the gate renders nothing on it. */
  status: IntroStatus;
  /** The introduction finished or was skipped (`outcome`, 'completed' unless said).
   *  Flips to 'done' immediately and persists behind it, so the map is never held back by
   *  a storage write. Also arms mapLessonPending — see that field. */
  complete: (outcome?: IntroOutcome, showLesson?: boolean) => void;
  /** Show it again (Inställningar → Visa introduktionen igen). In-session only, and see
   *  ./intro for why persisting it would be a no-op dressed up as a feature. */
  replay: () => void;
  /** True from replay() until that pass completes: the introduction on screen is a
   *  re-read, not a first run. Analytics marks its events with it. */
  replaying: boolean;
  /** How this install came past the introduction (see ./intro's IntroHistory), or null
   *  while that is not known: before the storage read, and during a first run. */
  history: IntroHistory | null;
  /** True for exactly one landing on the map after the wizard finishes — set by
   *  complete() (a first-run finish and a replay's finish both reach it the same way),
   *  read by bonetider.tsx to show the "what the lines mean" lesson in place of the dock,
   *  cleared by dismissMapLesson() once the lesson is stepped through or skipped.
   *  In-memory only, same as replay — a lesson that has been seen has been seen. */
  mapLessonPending: boolean;
  dismissMapLesson: () => void;
}

const IntroContext = createContext<IntroContextValue | null>(null);

export function IntroProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<IntroStatus>('unknown');
  const [initialStep, setInitialStep] = useState(0);
  const [history, setHistory] = useState<IntroHistory | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [mapLessonPending, setMapLessonPending] = useState(false);

  const routeDecided = useRef(false);
  const firstPass = useRef<Promise<IntroHistory | null> | null>(null);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!active || routeDecided.current) return;
      // A late first-run result must not redirect a reader already using the map.
      routeDecided.current = true;
      setStatus('done');
    }, STARTUP_STORAGE_TIMEOUT_MS);
    const read = loadIntro();
    const storedHistory = read.then((next) => next.history);
    firstPass.current = storedHistory;
    void read.then((next) => {
      clearTimeout(timer);
      if (!active) return;
      if (!routeDecided.current) {
        setInitialStep(next.step ?? 0);
        setStatus(next.status);
      }
      if (firstPass.current === storedHistory) setHistory(next.history);
    });
    return () => {
      clearTimeout(timer);
      active = false;
    };
  }, []);

  // Optimistic in both directions: the in-memory value is the navigation truth, and the
  // write trails it. loadIntroStatus already treats a failed read as 'done', so the
  // worst case of a failed WRITE is that the intro is offered once more — never a user
  // stuck behind a wizard because a disk write was slow.
  //
  // A replay keeps the first pass's outcome: intro_status reports how the install began,
  // and re-reading the introduction (then leaving it through "Hoppa över") is not having
  // skipped it. An install that predates the introduction ('not_shown') gets the outcome
  // of the pass it finally makes.
  const complete = useCallback(
    (outcome: IntroOutcome = 'completed', showLesson = true) => {
      routeDecided.current = true;
      setStatus('done');
      setReplaying(false);
      setMapLessonPending(showLesson);
      // A replay can finish before the original record arrives. Leave routing
      // immediate and resolve the original outcome before writing to disk.
      const recorded = replaying && firstPass.current
        ? firstPass.current.then((first) => first === 'completed' || first === 'skipped' ? first : outcome)
        : Promise.resolve(outcome);
      firstPass.current = recorded;
      void recorded.then((first) => {
        setHistory(first);
        return completeIntro(first);
      });
    },
    [replaying],
  );

  const replay = useCallback(() => {
    routeDecided.current = true;
    setInitialStep(0);
    setReplaying(true);
    setStatus('pending');
  }, []);

  const dismissMapLesson = useCallback(() => {
    setMapLessonPending(false);
  }, []);

  const value = useMemo<IntroContextValue>(
    () => ({ initialStep, status, complete, replay, replaying, history, mapLessonPending, dismissMapLesson }),
    [initialStep, status, complete, replay, replaying, history, mapLessonPending, dismissMapLesson],
  );

  return <IntroContext value={value}>{children}</IntroContext>;
}

export function useIntro(): IntroContextValue {
  const ctx = useContext(IntroContext);
  if (!ctx) throw new Error('useIntro must be used within an IntroProvider');
  return ctx;
}

/** Non-throwing variant, for screens that are also rendered outside the provider —
 *  most relevantly Bönetider, which the existing screen tests mount on its own.
 *  Callers treat a missing provider as "the intro is not in the way". */
export function useOptionalIntroStatus(): IntroStatus {
  return useContext(IntroContext)?.status ?? 'done';
}

// A fresh map starts at the labelled default. A resumed GPS reading can obtain a
// fresh fix silently after its reader previously chose GPS.
export function useFirstRunGpsPolicy(): 'normal' | 'explicit' | 'fresh' {
  const intro = useContext(IntroContext);
  if (!intro || intro.status === 'done' || intro.replaying) return 'normal';
  return intro.status === 'pending' && intro.initialStep === 2 ? 'fresh' : 'explicit';
}

/** Non-throwing variant of the map-lesson pair, same reasoning as useOptionalIntroStatus
 *  — a screen mounted without a provider (most of bonetider.tsx's own tests) simply never
 *  has a lesson pending. */
export function useOptionalMapLesson(): { pending: boolean; replaying: boolean; dismiss: () => void } {
  const ctx = useContext(IntroContext);
  return ctx
    ? { pending: ctx.mapLessonPending, replaying: ctx.replaying, dismiss: ctx.dismissMapLesson }
    : { pending: false, replaying: false, dismiss: () => {} };
}
