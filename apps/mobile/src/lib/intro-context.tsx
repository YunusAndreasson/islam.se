// App-wide "has the introduction run?" state, hydrated once on mount.
//
// Four consumers, and each needs a different thing from it:
//   • src/app/index.tsx  — the gate. Redirects to /valkommen or /bonetider.
//   • src/app/bonetider.tsx — belt-and-braces: the map's soft-ask queue must not spend
//     one of its two showings while the intro is on top of it. (A deep link could in
//     principle reach the map without passing through index.) It also reads
//     mapLessonPending to show the map lesson in place of the dock on the one landing
//     that earned it.
//   • src/app/valkommen.tsx — calls complete() when the flow finishes or is skipped.
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
  useState,
} from 'react';

import { completeIntro, type IntroStatus, loadIntroStatus } from './intro';

interface IntroContextValue {
  /** 'unknown' until the AsyncStorage read lands — the gate renders nothing on it. */
  status: IntroStatus;
  /** The introduction finished or was skipped. Flips to 'done' immediately and persists
   *  behind it, so the map is never held back by a storage write. Also arms
   *  mapLessonPending — see that field. */
  complete: () => void;
  /** Show it again (Inställningar → Visa introduktionen igen). In-session only, and see
   *  ./intro for why persisting it would be a no-op dressed up as a feature. */
  replay: () => void;
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
  const [mapLessonPending, setMapLessonPending] = useState(false);

  useEffect(() => {
    let active = true;
    void loadIntroStatus().then((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
    };
  }, []);

  // Optimistic in both directions: the in-memory value is the navigation truth, and the
  // write trails it. loadIntroStatus already treats a failed read as 'done', so the
  // worst case of a failed WRITE is that the intro is offered once more — never a user
  // stuck behind a wizard because a disk write was slow.
  const complete = useCallback(() => {
    setStatus('done');
    setMapLessonPending(true);
    void completeIntro();
  }, []);

  const replay = useCallback(() => {
    setStatus('pending');
  }, []);

  const dismissMapLesson = useCallback(() => {
    setMapLessonPending(false);
  }, []);

  const value = useMemo<IntroContextValue>(
    () => ({ status, complete, replay, mapLessonPending, dismissMapLesson }),
    [status, complete, replay, mapLessonPending, dismissMapLesson],
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

/** Non-throwing variant of the map-lesson pair, same reasoning as useOptionalIntroStatus
 *  — a screen mounted without a provider (most of bonetider.tsx's own tests) simply never
 *  has a lesson pending. */
export function useOptionalMapLesson(): { pending: boolean; dismiss: () => void } {
  const ctx = useContext(IntroContext);
  return ctx
    ? { pending: ctx.mapLessonPending, dismiss: ctx.dismissMapLesson }
    : { pending: false, dismiss: () => {} };
}
