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
// Deliberately NOT blocking: every step can be skipped, and skipping is a real answer.
// The app is fully usable with no location (Stockholm fallback, and the dock says so), no
// reminders, and the default method — so a wizard that refuses to let go would be
// pretending the setup matters more than it does.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { IntroStep } from '@/components/intro/IntroStep';
import { StepLocation } from '@/components/intro/StepLocation';
import { StepMethod } from '@/components/intro/StepMethod';
import { StepNotifications } from '@/components/intro/StepNotifications';
import { useIntro } from '@/lib/intro-context';
import { useSettings } from '@/lib/settings/context';
import { useColors } from '@/theme/useColors';

const TOTAL_STEPS = 4;

export default function Valkommen() {
  const c = useColors();
  const { complete } = useIntro();
  // The steps write settings, so none of them may run before the persisted blob has
  // hydrated: SettingsProvider skips its persist effect until `loaded`, so an early
  // update() would be silently overwritten by the load that follows it.
  const { loaded } = useSettings();
  const [step, setStep] = useState(0);

  const finish = (): void => {
    complete();
    // replace, not push: the introduction is not somewhere to go back to. Anyone who
    // wants it again gets it from Inställningar → Visa introduktionen igen.
    router.replace('/bonetider');
  };

  const next = (): void => {
    if (step >= TOTAL_STEPS - 1) finish();
    else setStep((s) => s + 1);
  };

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
        {step === 0 ? (
          <IntroStep
            index={0}
            total={TOTAL_STEPS}
            title="Bönetider för Sverige"
            lead="Tiderna räknas ut på din enhet – ingenting skickas vidare. Tre korta frågor, sedan visar vi kartan."
            nextLabel="Kom igång"
            onNext={next}
            onSkip={finish}
          />
        ) : null}

        {step === 1 ? (
          <IntroStep
            index={1}
            total={TOTAL_STEPS}
            title="Var är du?"
            lead="Bönetiderna beror på var du står. Appen kan använda din plats, eller så väljer du en stad."
            footnote="Platsen stannar i din enhet."
            nextLabel="Nästa"
            onNext={next}
            onSkip={next}
            // The city list is a FlatList and must never be wrapped in a ScrollView.
            scroll={false}
          >
            <StepLocation />
          </IntroStep>
        ) : null}

        {step === 2 ? (
          <IntroStep
            index={2}
            total={TOTAL_STEPS}
            title="Ska vi påminna dig?"
            lead="Få en notis när det är dags för bön. Tiderna planeras lokalt på din enhet – inget skickas online."
            footnote="Du kan ändra det här när som helst under Inställningar → Notiser."
            nextLabel="Nästa"
            onNext={next}
            onSkip={next}
          >
            <StepNotifications />
          </IntroStep>
        ) : null}

        {step === 3 ? (
          // The last step: no onSkip, same precedent the old final step set — the
          // finishing CTA is the only way out, and "Visa bönetider" already reads as
          // "move on without fussing over this" just as well as a separate skip would.
          // NOT "Öppna kartan": the user has never seen the map at this point (that's
          // still three steps back, one throwaway mention in the welcome lead) — naming
          // the screen assumes knowledge they don't have. "Visa bönetider" instead
          // promises the thing they actually came for, echoing step 0's own title.
          <IntroStep
            index={3}
            total={TOTAL_STEPS}
            title="Hur ska tiderna räknas ut?"
            lead="Olika metoder använder olika vinklar för Fajr och ʿIshāʾ. Vet du inte vilken du ska välja är standarden ett tryggt val."
            footnote="Sveriges ljusa sommarnätter hanteras automatiskt."
            nextLabel="Visa bönetider"
            onNext={next}
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
