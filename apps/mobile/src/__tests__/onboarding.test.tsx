// The introduction, end to end.
//
// Two things here are worth a test rather than a careful reading, and both are about the
// OS permission dialogs the flow stands in front of:
//
//   1. A dialog is spent exactly once per install. So the prompt must fire on a TAP and
//      never on a mount, and a double-tap must not put two of them in flight.
//   2. Whether the flow writes a hint "resolution" is what decides if the map's soft-ask
//      card ever gets a second chance. Answering the OS closes the question for good;
//      SKIPPING the step must leave it wide open. That asymmetry is the whole reason the
//      two surfaces can coexist, and nothing about it is visible from either file alone.
//
// Everything else asserted below is ordinary wiring: the steps advance, the pickers write
// settings, and finishing (or skipping) records the flow as seen.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { BackHandler } from 'react-native';

import Valkommen from '@/app/valkommen';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { resetLocationLaunchCountForTests } from '@/lib/location-hint';
import { hapticSelection, hapticSuccess } from '@/lib/haptics';
import { resetNotificationLaunchCountForTests } from '@/lib/notification-hint';
import { SettingsProvider } from '@/lib/settings/context';

// The cues are stubbed at the wrapper, so the assertions read "which cue did this step
// deserve" rather than "which native taptic API did that reach on this platform" — the
// second is lib/haptics' contract and is covered by its own test.
jest.mock('@/lib/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticLight: jest.fn(),
  hapticWarning: jest.fn(),
  setHapticsEnabled: jest.fn(),
}));

const INTRO_KEY = 'introSeen:v1';
const SETTINGS_KEY = 'prayerSettings:v1';
const LOCATION_HINT_KEY = 'locationHintSeen:v1';
const NOTIFICATION_HINT_KEY = 'notificationHintSeen:v1';

function permission(status: 'granted' | 'denied' | 'undetermined') {
  return { status, granted: status === 'granted', canAskAgain: status !== 'denied', expires: 'never' };
}

/** Answer the notification prompt with `status` — and make the read-only check agree.
 *  Both matter: the request is what the button fires, and the hook re-reads the state
 *  straight afterwards (that re-read is how a user who allowed notifications out in
 *  system settings gets picked up). A fixture that granted the request but kept
 *  reporting 'undetermined' on the read would describe an OS that does not exist. */
function answerNotifications(status: 'granted' | 'denied'): void {
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue(permission(status) as never);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(status) as never);
}

/** The same, for location. */
function answerLocation(status: 'granted' | 'denied'): void {
  jest
    .mocked(Location.requestForegroundPermissionsAsync)
    .mockResolvedValue(permission(status) as never);
  jest
    .mocked(Location.getForegroundPermissionsAsync)
    .mockResolvedValue(permission(status) as never);
}

/** Renders the flow and drains the providers' hydration promises, so nothing below runs
 *  against the pre-hydration `loaded === false` ground. */
async function launch(): Promise<void> {
  render(
    <SettingsProvider>
      <IntroProvider>
        <LocationProvider>
          <Valkommen />
        </LocationProvider>
      </IntroProvider>
    </SettingsProvider>,
  );
  await act(async () => {});
}

async function press(label: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
  await act(async () => {});
}

/** Fire Android's back gesture the way the OS does — by calling the handler the screen
 *  registered, since there is no control on screen to press. Returns that handler's own
 *  answer: `true` means the introduction consumed the gesture, `false` means it handed it
 *  back to the navigator (which, on a fullScreenModal, is what leaves the flow).
 *
 *  The LAST registration is the live one: the effect re-subscribes on every step change,
 *  so an earlier call in the list belongs to a listener that has already been removed. */
async function pressAndroidBack(): Promise<boolean> {
  const calls = jest.mocked(BackHandler.addEventListener).mock.calls;
  const handler = calls.filter(([event]) => event === 'hardwareBackPress').at(-1)?.[1];
  if (!handler) throw new Error('no hardwareBackPress listener was registered');
  let answered = false;
  await act(async () => {
    answered = (handler as () => boolean)();
  });
  await act(async () => {});
  return answered;
}

describe('the introduction', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    // Spied, not stubbed: the screen calls `sub.remove()` on cleanup, so the real
    // subscription has to keep working — this only records what was registered.
    jest.spyOn(BackHandler, 'addEventListener');
    resetLocationLaunchCountForTests();
    resetNotificationLaunchCountForTests();
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValue(permission('undetermined') as never);
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue(permission('undetermined') as never);
  });

  it('opens on the welcome step and asks the OS for nothing at all', async () => {
    await launch();

    expect(screen.getByText('Bönetider för Sverige')).toBeTruthy();
    // The point of a soft ask: arriving in the app must not, by itself, spend either
    // dialog. Both of these are the REQUEST calls, not the read-only checks.
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('walks all four steps and records itself as seen at the end', async () => {
    await launch();

    await press('Kom igång');
    expect(screen.getByText('Var är du?')).toBeTruthy();

    await press('Nästa');
    expect(screen.getByText('Ska vi påminna dig?')).toBeTruthy();

    await press('Nästa');
    expect(screen.getByText('Hur ska tiderna räknas ut?')).toBeTruthy();

    // The last step: no separate skip, "Visa bönetider" is the only way out — the map
    // lesson this used to lead into now lives on bonetider.tsx itself, driving the real
    // map (see MapLessonCard and intro-context.test.tsx's mapLessonPending coverage).
    await press('Visa bönetider');
    expect(await AsyncStorage.getItem(INTRO_KEY)).not.toBeNull();
  });

  // Going back is the Android gesture and NOTHING ELSE — there is no "Tillbaka" control
  // on any step. Every step writes straight to settings the moment it is answered and
  // every answer has a permanent home in Inställningar, so a step behind you is a thing
  // you can change later rather than one you are sealed into; the visible control bought
  // that little and cost a third tier of chrome in the action bar. The gesture is free,
  // and without this handler it would fall through to the navigator and drop the user out
  // of the introduction entirely — the opposite of what it implies.
  it('draws no back control on any step', async () => {
    await launch();
    expect(screen.queryByText('Tillbaka')).toBeNull();

    await press('Kom igång');
    expect(screen.queryByText('Tillbaka')).toBeNull();

    await press('Nästa');
    expect(screen.queryByText('Tillbaka')).toBeNull();

    await press('Nästa');
    expect(screen.getByText('Hur ska tiderna räknas ut?')).toBeTruthy();
    expect(screen.queryByText('Tillbaka')).toBeNull();
  });

  it('steps back on the Android gesture, and keeps what the user chose', async () => {
    await launch();

    await press('Kom igång');
    expect(screen.getByText('Var är du?')).toBeTruthy();
    await press('Nästa');
    expect(screen.getByText('Ska vi påminna dig?')).toBeTruthy();

    expect(await pressAndroidBack()).toBe(true);
    expect(screen.getByText('Var är du?')).toBeTruthy();
    // Returning to a step must not re-ask the OS. Each step writes straight to settings
    // and only prompts from its own button, so coming back is a view of what is already
    // chosen — not a second dialog the user has to dismiss again.
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();

    // And forward again from where they left off, not from the beginning.
    await press('Nästa');
    expect(screen.getByText('Ska vi påminna dig?')).toBeTruthy();
  });

  it('hands the gesture back to the system on the first step', async () => {
    await launch();

    // There is no previous step, and swallowing the gesture here would make the OS back
    // do nothing at all — which reads as a frozen app rather than as a boundary.
    expect(await pressAndroidBack()).toBe(false);
    expect(screen.getByText('Bönetider för Sverige')).toBeTruthy();
  });

  it('reaches the last step from the one before it, gesture included', async () => {
    // The final step has no skip: "Visa bönetider" is the only control in the bar. The
    // gesture is therefore the only way to revisit the method choice, and it is the one
    // choice most worth revisiting — so it must survive that emptier bar.
    await launch();

    await press('Kom igång');
    await press('Nästa');
    await press('Nästa');
    expect(screen.getByText('Hur ska tiderna räknas ut?')).toBeTruthy();
    expect(screen.queryByText('Hoppa över')).toBeNull();

    expect(await pressAndroidBack()).toBe(true);
    expect(screen.getByText('Ska vi påminna dig?')).toBeTruthy();
  });

  // "Nästa" and "Hoppa över" ran the IDENTICAL line of code on the two middle steps —
  // `onNext` and `onSkip` were both `next`. Two labels, two weights, stacked one above the
  // other, for one action: the reader was being asked to tell apart two controls that were
  // never different. Skipping is only a separate offer where it goes somewhere advancing
  // does not, which is the welcome step alone — there it abandons the introduction.
  it('offers exactly one way forward on the steps where skipping is not a different door', async () => {
    await launch();

    // The welcome step keeps its skip: that one really does leave.
    expect(screen.getByText('Hoppa över')).toBeTruthy();

    await press('Kom igång');
    expect(screen.getByText('Var är du?')).toBeTruthy();
    expect(screen.queryByText('Hoppa över')).toBeNull();

    await press('Nästa');
    expect(screen.getByText('Ska vi påminna dig?')).toBeTruthy();
    expect(screen.queryByText('Hoppa över')).toBeNull();
  });

  // Each step is FELT, not only seen. The three advancing taps land a selection tick — the
  // intro's progress mark is a discrete 1-of-4 counter the button steps through, the same
  // class as the scrubber crossing a prayer — and the last one lands the success cue,
  // because finishing onboarding is an outcome rather than another step. The cue sits on
  // the state change in valkommen's next(), not on the control, which is why the Android
  // back gesture ticks too: it moves the same counter, the other way.
  it('ticks through the steps and confirms at the end', async () => {
    await launch();

    await press('Kom igång');
    await press('Nästa');
    await press('Nästa');
    // Asserted at the CUE, not at the native call: which taptic API that reaches is
    // lib/haptics' business (and differs by platform), while valkommen's contract is
    // which of the four cues each step deserves.
    expect(hapticSelection).toHaveBeenCalledTimes(3);
    expect(hapticSuccess).not.toHaveBeenCalled();

    await press('Visa bönetider');
    // Confirm, not a fourth tick — the intro is done and the map is what comes next.
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(hapticSelection).toHaveBeenCalledTimes(3);
  });

  // Skipping from the FIRST step ends the intro without completing it. That is a dismissal,
  // and the policy in lib/haptics gives dismissals no cue — so this one stays silent while
  // the middle steps' skip (which advances the counter) does not.
  it('stays silent when the intro is dismissed outright', async () => {
    await launch();
    await press('Hoppa över');
    expect(hapticSelection).not.toHaveBeenCalled();
    expect(hapticSuccess).not.toHaveBeenCalled();
  });

  it('records itself as seen when skipped outright', async () => {
    await launch();
    await press('Hoppa över');

    // Skipping is a real answer to "shall I explain the app?", so it must not be asked
    // again on the next cold launch.
    expect(await AsyncStorage.getItem(INTRO_KEY)).not.toBeNull();
  });

  describe('the location step', () => {
    it('fires the OS prompt once, however fast the button is tapped twice', async () => {
      answerLocation('granted');
      jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
        coords: { latitude: 57.7089, longitude: 11.9746 },
      } as never);

      await launch();
      await press('Kom igång');

      // Both presses land in the same frame, before any state update has committed —
      // which is exactly the case a `busy` state cannot catch and the in-flight ref can.
      await act(async () => {
        fireEvent.press(screen.getByText('Använd min plats'));
        fireEvent.press(screen.getByText('Använd min plats'));
      });
      await act(async () => {});

      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('closes the map card question once the OS has answered — even with a refusal', async () => {
      answerLocation('denied');

      await launch();
      await press('Kom igång');
      await press('Använd min plats');

      // A refusal is still an ANSWER: the OS will not ask again, so the map's location
      // card has nothing left to offer and would only be a dead button.
      const record = JSON.parse((await AsyncStorage.getItem(LOCATION_HINT_KEY)) as string);
      expect(record.resolved).toBe(true);
      // ...and the user is not stranded: the city picker is still one tap away.
      expect(screen.getByText('Välj stad i stället')).toBeTruthy();
    });

    it('lets the user try again after a fix that timed out, and the retry really fires', async () => {
      // The OS said YES; the fix itself failed — services off, or no satellite before the
      // timeout. That is `error`, not `denied`, and the difference is the whole point:
      // nothing was refused, so the very next tap can succeed. The bug was that the
      // "Använd min plats" button rendered only in the `ask` phase, so a single indoor
      // timeout — the most ordinary outcome there is — deleted the recommended path for
      // the rest of the flow and left the city list as the only way forward, under a
      // message that tells the user to go switch location services on.
      // Deliberately NOT answerLocation(), which also makes the read-only check report
      // granted — that would let LocationProvider's mount effect fetch a fix of its own and
      // swallow the one rejection below. Granting only the REQUEST is the true first-run
      // shape anyway: undetermined on the read, granted once the user taps.
      jest
        .mocked(Location.requestForegroundPermissionsAsync)
        .mockResolvedValue(permission('granted') as never);
      jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(null);
      jest
        .mocked(Location.getCurrentPositionAsync)
        .mockRejectedValueOnce(new Error('location services off'));

      await launch();
      await press('Kom igång');
      await press('Använd min plats');

      expect(screen.getByText(/Kontrollera att platstjänster är på/)).toBeTruthy();
      expect(screen.getByText('Använd min plats')).toBeTruthy();

      // And the second tap must actually reach the OS: the in-flight guard is released in
      // a `finally`, so a phase that keeps the button alive can never leave it inert.
      jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
        coords: { latitude: 59.3293, longitude: 18.0686 },
      } as never);
      await press('Använd min plats');

      expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/Tiderna räknas ut för/)).toBeTruthy();
    });

    it('leaves the map card its second chance when the step is walked past', async () => {
      await launch();
      await press('Kom igång');
      // "Nästa" without touching the step's own button IS the skip — one control, both
      // meanings, which is why the step no longer draws a second one beside it.
      await press('Nästa');

      // THE asymmetry. Nothing was asked, so nothing is recorded, so the map may still
      // offer its location card on a later launch — see lib/hints for that policy. Writing
      // a resolution here would silently cost the user the feature for good.
      expect(await AsyncStorage.getItem(LOCATION_HINT_KEY)).toBeNull();
    });

    it('writes the chosen city, and the manual mode that goes with it', async () => {
      await launch();
      await press('Kom igång');
      await press('Välj stad i stället');
      await press('Göteborg');

      const stored = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) as string);
      expect(stored.locationMode).toBe('manual');
      expect(stored.manualLocation.name).toBe('Göteborg');
    });
  });

  describe('the reminders step', () => {
    it('turns reminders on and reveals the per-prayer choice once granted', async () => {
      answerNotifications('granted');

      await launch();
      await press('Kom igång');
      await press('Nästa');
      await press('Slå på påminnelser');

      expect(screen.getByText('Vilka böner?')).toBeTruthy();
      const stored = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) as string);
      expect(stored.notifications.enabled).toBe(true);
      const record = JSON.parse((await AsyncStorage.getItem(NOTIFICATION_HINT_KEY)) as string);
      expect(record.resolved).toBe(true);
    });

    it('enables reminders on a refusal too, and offers the way back', async () => {
      answerNotifications('denied');

      await launch();
      await press('Kom igång');
      await press('Nästa');
      await press('Slå på påminnelser');

      // Enabled-but-blocked is not a lie: it is what makes Inställningar show "Blockerat"
      // with its recovery link, and it means a user who later allows notifications in
      // system settings starts receiving them on the very next sync — without having to
      // find the toggle again. Same rule as the map's NotificationHint.
      const stored = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) as string);
      expect(stored.notifications.enabled).toBe(true);
      expect(screen.getByText(/Notiser är blockerade/)).toBeTruthy();
    });

    it('leaves the map card its second chance when the step is walked past', async () => {
      await launch();
      await press('Kom igång');
      await press('Nästa');
      // Same as the location step: advancing without pressing "Slå på påminnelser" asks
      // the OS nothing, so nothing is recorded.
      await press('Nästa');

      expect(await AsyncStorage.getItem(NOTIFICATION_HINT_KEY)).toBeNull();
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });
  });

  it('writes the calculation method the user picks', async () => {
    await launch();
    await press('Kom igång');
    await press('Nästa');
    await press('Nästa');

    await press('Muslim World League');

    const stored = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) as string);
    expect(stored.calculationMethod).toBe('MuslimWorldLeague');
  });
});
