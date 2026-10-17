// ⚠️ THE ONE THING THIS FILE EXISTS FOR: every instrument in the app shares ONE
// `watchHeadingAsync` subscription.
//
// Two concurrent heading watches on Android starve each other — NEITHER delivers events,
// silently, with no error and no warning. The map carries two instruments side by side (the
// qibla compass and the Moon disc), so the day the second one was given its own subscription,
// both went dead and reported "kompassen är inte tillgänglig" on a phone whose compass was
// working fine. It took an emulator to find; typecheck, lint and 1102 unit tests all passed
// over it, because every one of them mounts a single consumer.
//
// So this asserts the *call count*, which is the only observable that would have caught it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { Text } from 'react-native';

import { useAim } from '@/lib/useAim';

/** A minimal consumer: mounts the hook and renders whatever the band says. */
function Instrument({ bearing, active = true }: { bearing: number; active?: boolean }) {
  const { status } = useAim({ active, request: false, bearing });
  return <Text>{status.aligned ? 'aimed' : 'searching'}</Text>;
}

describe('useAim — one sensor, many instruments', () => {
  let emit: ((h: { trueHeading: number; magHeading: number; accuracy: number }) => void) | null;
  let removed: number;

  beforeEach(() => {
    emit = null;
    removed = 0;
    jest.clearAllMocks();
    jest.mocked(Location.watchHeadingAsync).mockReset();
    jest.mocked(Location.watchHeadingAsync).mockImplementation((async (cb: never) => {
      emit = cb;
      return {
        remove: () => {
          removed += 1;
          emit = null;
        },
      };
    }) as never);
    jest.mocked(Location.getForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'granted', granted: true })) as never);
  });

  afterEach(() => {
    jest.mocked(Location.watchHeadingAsync).mockReset();
  });

  it('opens the sensor ONCE for two instruments, and feeds both', async () => {
    // 0° and 90°: one consumer is aimed, the other is not, off the same reading. If they were
    // sharing state rather than sharing a subscription, both would say the same thing.
    const view = await render(
      <>
        <Instrument bearing={0} />
        <Instrument bearing={90} />
      </>,
    );
    await waitFor(() => expect(emit).not.toBeNull());

    expect(jest.mocked(Location.watchHeadingAsync)).toHaveBeenCalledTimes(1);

    await act(async () => {
      emit?.({ trueHeading: 0, magHeading: 0, accuracy: 3 });
    });
    expect(view.getByText('aimed')).toBeTruthy();
    expect(view.getByText('searching')).toBeTruthy();
  });

  it('keeps the sensor open while any instrument is still listening', async () => {
    const view = await render(
      <>
        <Instrument bearing={0} />
        <Instrument bearing={90} />
      </>,
    );
    await waitFor(() => expect(emit).not.toBeNull());

    // One goes: the watch must stay, or the surviving instrument dies with it.
    await view.rerender(<Instrument bearing={0} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(removed).toBe(0);
    expect(emit).not.toBeNull();

    // The last one goes: now the sensor is released, so the magnetometer is not left running
    // behind a screen nobody is looking at.
    await view.unmount();
    await waitFor(() => expect(removed).toBe(1));
  });

  it('re-opens after the last instrument has left', async () => {
    const first = await render(<Instrument bearing={0} />);
    await waitFor(() => expect(emit).not.toBeNull());
    await first.unmount();
    await waitFor(() => expect(removed).toBe(1));

    const second = await render(<Instrument bearing={0} />);
    await waitFor(() => expect(emit).not.toBeNull());
    expect(jest.mocked(Location.watchHeadingAsync)).toHaveBeenCalledTimes(2);
    await second.unmount();
  });

  it('hands a joining instrument the reading the sensor has already given', async () => {
    // ⚠️ THE SECOND INSTRUMENT MUST NOT START BLIND. expo-location emits only when the field
    // MOVES, so a joiner attaching to a running watch hears nothing at all while the phone is
    // held still — which is the posture a reader is in when they open the Qibla sheet from the
    // map. Without the replay it would arm its no-event timeout and print "Ingen kompass på den
    // här enheten" over a map whose compass disc was reading the sensor moments earlier.
    // The shape stays constant so React keeps the FIRST instrument mounted — swapping a bare
    // element for a fragment remounts the lot, which empties the listener set and closes the
    // very watch the joiner is supposed to be joining.
    function Pair({ second }: { second: boolean }) {
      return (
        <>
          <Instrument bearing={0} />
          {second ? <Instrument bearing={0} /> : null}
        </>
      );
    }
    const view = await render(<Pair second={false} />);
    await waitFor(() => expect(emit).not.toBeNull());
    await act(async () => {
      emit?.({ trueHeading: 0, magHeading: 0, accuracy: 3 });
    });
    expect(view.getByText('aimed')).toBeTruthy();

    // A second instrument arrives, and the sensor stays silent from here on.
    await view.rerender(<Pair second />);
    // Flushed, not polled. The joiner's whole path — permission check, addHeadingListener,
    // the replay — is a chain of already-resolved promises, so one act() drains it exactly.
    // `waitFor` polls on a 50 ms timer against a 1 s budget instead, and on a loaded machine
    // (the full suite runs 94 files across 8 workers) the event loop is starved past that
    // budget: this test failed roughly one run in two under `nproc` busy loops, on a
    // replay that had in fact already happened.
    await act(async () => {});
    expect(view.getAllByText('aimed')).toHaveLength(2);
    expect(jest.mocked(Location.watchHeadingAsync)).toHaveBeenCalledTimes(1);
  });

  it('forgets the last reading once the sensor is released', async () => {
    // Otherwise a bearing from a previous session is replayed into a new one — a direction
    // taken from wherever the phone was pointing minutes ago, presented as current.
    const first = await render(<Instrument bearing={0} />);
    await waitFor(() => expect(emit).not.toBeNull());
    await act(async () => {
      emit?.({ trueHeading: 0, magHeading: 0, accuracy: 3 });
    });
    expect(first.getByText('aimed')).toBeTruthy();
    await first.unmount();
    await waitFor(() => expect(removed).toBe(1));

    const second = await render(<Instrument bearing={0} />);
    await waitFor(() => expect(emit).not.toBeNull());
    expect(second.getByText('searching')).toBeTruthy();
    await second.unmount();
  });

  it('takes the listener back out when the sensor refuses to open', async () => {
    // A rejected watch used to leave the listener in the shared set for the life of the
    // process: `listeners.size` could never reach 0 again, so the watch a LATER consumer
    // opened was never released and the magnetometer ran behind every screen from then on.
    jest.mocked(Location.watchHeadingAsync).mockReset();
    jest
      .mocked(Location.watchHeadingAsync)
      .mockImplementation((async () => {
        throw new Error('no magnetometer');
      }) as never);
    const failed = await render(<Instrument bearing={0} />);
    await act(async () => {
      await Promise.resolve();
    });
    await failed.unmount();

    // A healthy consumer now opens the watch — and releasing it must actually close it.
    jest.mocked(Location.watchHeadingAsync).mockImplementation((async (cb: never) => {
      emit = cb;
      return { remove: () => { removed += 1; } };
    }) as never);
    const healthy = await render(<Instrument bearing={0} />);
    await waitFor(() => expect(emit).not.toBeNull());
    await healthy.unmount();
    await waitFor(() => expect(removed).toBe(1));
  });

  it('asks again on every press, because Android grants two refusals', async () => {
    // `askPermission` is a call and not a flag for exactly this: a boolean would be already
    // true on the second press, re-run no effect and raise no dialog, leaving the reader
    // pressing a control that visibly does nothing.
    jest.mocked(Location.requestForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'denied', granted: false, canAskAgain: true })) as never);
    jest.mocked(Location.getForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'denied', granted: false, canAskAgain: true })) as never);

    // Pressed through a real control, the way the screens call it.
    function Asker() {
      const { askPermission } = useAim({ active: true, request: false, bearing: 0 });
      return (
        <Text accessibilityRole="button" onPress={askPermission}>
          ask
        </Text>
      );
    }
    const view = await render(<Asker />);
    await act(async () => {
      await Promise.resolve();
    });
    // The silent check only; no dialog was raised by landing here.
    expect(jest.mocked(Location.requestForegroundPermissionsAsync)).not.toHaveBeenCalled();

    for (const expected of [1, 2, 3]) {
      await act(async () => {
        await fireEvent.press(view.getByText('ask'));
      });
      await waitFor(() =>
        expect(jest.mocked(Location.requestForegroundPermissionsAsync)).toHaveBeenCalledTimes(expected),
      );
    }
  });

  it('does not open the sensor at all for an inactive instrument', async () => {
    await render(<Instrument bearing={0} active={false} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(jest.mocked(Location.watchHeadingAsync)).not.toHaveBeenCalled();
  });
});
