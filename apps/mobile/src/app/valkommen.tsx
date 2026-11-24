// The introduction. Four steps, once per install, in front of the map.
//
// It is a full-screen route rather than cards on the map because the map's own soft-ask
// queue (bonetider's pickOffer) can only ever ask ONE question per cold launch — the
// right design for an app you already understand, and no use at all for explaining what
// the app is. The two coexist rather than compete: this flow writes noteXResolved() only
// when the OS actually answered, so a step the user walked past leaves the map's card its
// later, calmer chance. See lib/intro for the gate and lib/hints for that policy.
//
// The fifth "what the lines mean" step used to live here too, as a bundled Sweden
// silhouette standing in for a map the user hadn't seen yet — which was itself the
// problem: "kartan" meant nothing to someone looking at a different, non-interactive
// object. It now lives on bonetider.tsx itself (MapLessonCard), driving the REAL map the
// user is about to use. complete() arms it; see lib/intro-context's mapLessonPending.
//
// Deliberately NOT blocking: every step can be walked past, and walking past one is a real
// answer. The app is fully usable with no location (Stockholm fallback, and the dock says
// so), no reminders, and the default method — so a wizard that refuses to let go would be
// pretending the setup matters more than it does. Each question has one quiet way past:
// the neutral location step says "Nästa", while declining the explicit notification ask
// says "Inte nu". The welcome step keeps its skip, because there it means something
// different — leave the introduction now, not answer this question later.
import { router } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { usePendingBack } from '@/components/nav/usePendingBack';
import { IntroStep } from '@/components/intro/IntroStep';
import { StepLocation } from '@/components/intro/StepLocation';
import { StepMethod } from '@/components/intro/StepMethod';
import { StepNotifications } from '@/components/intro/StepNotifications';
import { StepWelcome } from '@/components/intro/StepWelcome';
import { ANALYTICS_EVENTS, afterAppOpen, analytics } from '@/lib/analytics';
import { remindersState } from '@/lib/analytics/properties';
import { hapticSelection, hapticSuccess } from '@/lib/haptics';
import { INTRO_STEPS, type IntroOutcome, saveIntroStep } from '@/lib/intro';
import { useIntro } from '@/lib/intro-context';
import { useLocation } from '@/lib/location/context';
import { getNotificationPermissionState } from '@/lib/notifications';
import { type } from '@/theme/tokens';
import { useSettings } from '@/lib/settings/context';
import { useColors } from '@/theme/useColors';

const TOTAL_STEPS = INTRO_STEPS.length;

/** The steps as analytics names them, in order. A step's name, not its title: the titles
 *  are copy and change, the funnel must not. */
const stepName = (index: number): (typeof INTRO_STEPS)[number] | 'unknown' =>
  INTRO_STEPS[index] ?? 'unknown';

export default function Valkommen() {
  const { initialStep, status } = useIntro();
  if (status === 'unknown') return null;
  return <Introduction initialStep={status === 'pending' ? initialStep : 0} />;
}

function Introduction({ initialStep }: { initialStep: number }) {
  const c = useColors();
  const { complete, replaying, status } = useIntro();
  const { source } = useLocation();
  // The steps write settings, so none of them may run before the persisted blob has
  // hydrated: SettingsProvider skips its persist effect until `loaded`, so an early
  // update() would be silently overwritten by the load that follows it.
  const { loaded, settings } = useSettings();
  const [saveFailed, setSaveFailed] = useState(false);
  const [step, setStep] = useState(initialStep);
  // Claim the transition before React commits it. A second tap from the old
  // screen must not advance the new step or replace the route a second time.
  const pendingStep = useRef<number | null>(initialStep);

  // One Onboarding Step Viewed per step shown, stepping back included (the funnel counts
  // readers per step, and a step seen twice is still one reader). `replay` is read through
  // an Effect Event so that complete() clearing it does not count the last step again.
  const stepViewed = useEffectEvent((index: number) => {
    const visible = AppState.currentState === 'active';
    const cancel = afterAppOpen(() => {
      void analytics.track(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, {
        step: stepName(index),
        index,
        replay: replaying,
      });
    });
    // A foreground step counts even if the reader advances while the open is pending.
    return visible ? undefined : cancel;
  });
  useEffect(() => {
    if (!loaded) return;
    return stepViewed(step);
  }, [loaded, step]);

  // What the introduction produced. The values are read now, from this render: complete()
  // is about to clear `replaying`, and the screen is about to go.
  const reportEnd = (outcome: IntroOutcome): void => {
    const properties = {
      at_step: stepName(step),
      replay: replaying,
      location_source: source,
    };
    const permission = getNotificationPermissionState();
    const enabled = settings.notifications.enabled;
    afterAppOpen(() => {
      void permission.then((state) => {
        const details = { ...properties, reminders: remindersState(enabled, state) };
        if (outcome === 'skipped') {
          void analytics.track(ANALYTICS_EVENTS.INTRO_SKIPPED, details);
        } else {
          void analytics.track(ANALYTICS_EVENTS.INTRO_COMPLETED, details);
        }
      });
    });
  };

  const finish = (outcome: IntroOutcome): void => {
    if (pendingStep.current !== step) return;
    pendingStep.current = null;
    if (outcome === 'completed') hapticSuccess();
    reportEnd(outcome);
    complete(outcome);
    // replace, not push: the introduction is not somewhere to go back to. Anyone who
    // wants it again gets it from Inställningar → Visa introduktionen igen.
    router.replace('/bonetider');
  };

  // The welcome step's "Hoppa över": the one way out that is not the last step.
  const skip = (): void => {
    finish('skipped');
  };

  // Advancing is felt, not just seen. This looks at first like the "navigation" case the
  // haptics policy excludes, and it is not: the intro's progress mark (IntroMarkProgress)
  // is a DISCRETE value the button steps through — 1 of 4 to 2 of 4 — which is the same
  // class as the scrubber crossing a prayer or an OptionGroup changing. Hence the selection
  // tick, and hence it lives in `next()` rather than on the button: it describes the state
  // change, so "Hoppa över" on a middle step (which also advances) gets it too.
  //
  // The last step is a different kind of moment — the intro is done and the map is what
  // comes next — so it lands on the success cue instead. Reaching the end of onboarding is
  // an OUTCOME; the three steps before it are not.
  // One way back, used by both the Android hardware gesture and the chrome control the
  // steps render. Sharing it is the point: they were two different behaviours on two
  // platforms before, which is how iOS ended up with none at all.
  const goToStep = useCallback(async (index: number): Promise<void> => {
    pendingStep.current = index;
    if (status === 'pending' && !replaying && !await saveIntroStep(index)) {
      pendingStep.current = step;
      setSaveFailed(true);
      return;
    }
    setSaveFailed(false);
    hapticSelection();
    setStep(index);
  }, [replaying, status, step]);
  const back = useCallback((): void => {
    if (step === 0 || pendingStep.current !== step) return;
    void goToStep(step - 1);
  }, [goToStep, step]);

  const next = (): void => {
    if (step >= TOTAL_STEPS - 1) {
      finish('completed');
    } else if (pendingStep.current === step) {
      void goToStep(step + 1);
    }
  };

  usePendingBack(step > 0, back);

  if (!loaded) {
    // A bare themed ground for the one frame the AsyncStorage read takes. An indicator
    // here would flash on every launch of a fresh install for no information.
    return <View style={[styles.fill, { backgroundColor: c.paper }]} />;
  }

  return (
    // A second SafeAreaProvider, nested inside the one at the app root. This screen is
    // presented as a native `fullScreenModal` (see _layout.tsx), which react-native-screens
    // gives its own UIViewController and its own view hierarchy — the root provider's insets
    // were measured against the ROOT screen's frame and don't get re-delivered into a
    // modally-presented one, so without this the SafeAreaView below reads a stale/zero top
    // inset and the title sits under the notch/Dynamic Island. Re-declaring the provider
    // here makes it measure fresh against this screen's own frame instead.
    <SafeAreaProvider>
      <SafeAreaView style={[styles.fill, { backgroundColor: c.paper }]} edges={['top', 'bottom']}>
        {saveFailed && <Text accessibilityRole="alert" style={[type.body, { color: c.ink }]}>Det gick inte att spara. Försök igen.</Text>}
        {step === 0 ? (
          <IntroStep
            index={0}
            total={TOTAL_STEPS}
            title="Bönetider för Sverige"
            // The privacy line this lead used to open with now sits in StepWelcome, as one
            // of the three things the app promises — see that file for why.
            //
            // Not "sedan visar vi kartan" (user, 2026-09-19). A reader opening a prayer-times
            // app is not expecting a map and has never seen this one; "kartan", in the
            // definite form, presumes both. Same reasoning, and the same promise, as the last
            // step's "Visa bönetider", which replaced "Öppna kartan". The map is introduced
            // by the first row below as a thing it lets you DO, and taught on the map itself
            // (MapLessonCard) once it is on screen.
            lead="Tre korta frågor, sedan ser du dina bönetider."
            nextLabel="Kom igång"
            onNext={next}
            onSkip={skip}
          >
            <StepWelcome />
          </IntroStep>
        ) : null}

        {step === 1 ? (
          <IntroStep
            index={1}
            total={TOTAL_STEPS}
            title="Var är du?"
            // The lead used to end "Appen kan använda din plats, eller så väljer du en
            // stad" — a narration of the two controls directly beneath it. What the
            // reader cannot see from those controls is what the quiet "Nästa" does, so
            // that is what the second sentence says instead.
            lead="Bönetiderna beror på var du står. Utan plats visar appen tiderna för Stockholm."
            // Om appen's promise, word for word, so the two never read as two policies.
            footnote="Din plats lämnar aldrig enheten."
            nextLabel="Nästa"
            // The step's own "Använd min plats" is the filled action here; the footer only
            // means "move on". See IntroStep's note on one filled accent per screen.
            nextTone="quiet"
            // No onSkip. Skipping this step and advancing it are the same journey to the
            // same place — walk past without touching the button and nothing is asked,
            // nothing is recorded, and the map keeps its own later chance to ask (see the
            // noteXResolved note at the top of this file). Rendering that one action twice,
            // once as "Nästa" and once as "Hoppa över", only asked the reader to tell apart
            // two controls that ran the identical line of code.
            onNext={next}
            onBack={back}
          >
            <StepLocation />
          </IntroStep>
        ) : null}

        {step === 2 ? (
          <IntroStep
            index={2}
            total={TOTAL_STEPS}
            title="Ska vi påminna dig?"
            // Not "Få en notis när det är dags för bön" — that was the title again, as a
            // statement. The lead says what a yes actually buys (when, and for which
            // prayers); the footnote says what else can be tuned and where.
            lead="En notis när bönetiden börjar, för de böner du väljer."
            footnote="Hur tidigt notisen kommer, och med vilket ljud, väljer du under Inställningar → Notiser."
            nextLabel={settings.notifications.enabled ? 'Nästa' : 'Inte nu'}
            // Same reasoning as the location step: "Slå på påminnelser" owns the fill, and
            // the quiet footer is the one way on. Before an answer, "Inte nu" names the
            // choice plainly; on replay (or after enabling), "Nästa" moves on without
            // pretending reminders still need to be enabled.
            nextTone="quiet"
            onNext={next}
            onBack={back}
          >
            <StepNotifications />
          </IntroStep>
        ) : null}

        {step === 3 ? (
          // The last step: no onSkip — the finishing CTA is the only way out, and "Visa
          // bönetider" already reads as "move on without fussing over this" just as well
          // as a separate skip would. The two steps before it now say the same thing with
          // "Nästa", so this is the rule rather than the exception it once was.
          // NOT "Öppna kartan": the user has never seen the map at this point (that's
          // still three steps back, one throwaway mention in the welcome lead) — naming
          // the screen assumes knowledge they don't have. "Visa bönetider" instead
          // promises the thing they actually came for, echoing step 0's own title.
          <IntroStep
            index={3}
            total={TOTAL_STEPS}
            title="Hur ska tiderna räknas ut?"
            // The first sentence is what the degree figures in the options MEAN — a
            // definition, deliberately not a claim that the methods differ in angles alone:
            // Diyanet and Muslim World League share theirs (their rows name the margin that
            // tells them apart), and Umm al-Qura's ʿIshāʾ is a fixed 90 minutes. A lead that
            // said "the methods differ in how deep the sun is" made those two identical-angle
            // rows look like one method listed twice. The second sentence is how to choose —
            // the same advice Inställningar → Beräkning gives — and "standarden" is the row
            // with the Standard tag.
            lead="Gradtalen anger hur djupt solen står under horisonten när Fajr och ʿIshāʾ börjar. Välj din moskés metod, eller behåll standarden."
            footnote="Sveriges ljusa sommarnätter hanteras automatiskt."
            nextLabel="Visa bönetider"
            onNext={next}
            onBack={back}
          >
            <StepMethod />
          </IntroStep>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
