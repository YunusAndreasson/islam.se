// The adhan preview's own logic — everything about it that is not the audio device.
//
// The build carries no adhan yet (ADHAN_SOURCE is null; see the module header for the four
// edits that turn it on), which is exactly why this suite exists ahead of the asset: the
// plumbing, the UI that renders it and the behaviour below are proven now, so shipping a
// recitation later is an asset decision rather than an engineering one.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import * as Audio from 'expo-audio';

import { ADHAN_SOURCE, useAdhanPreview } from './adhan-audio';

// The shared fake player from jest.setup.js — the same object useAudioPlayer hands back.
const player = (Audio as unknown as { __player: { playing: boolean; play: jest.Mock; pause: jest.Mock; seekTo: jest.Mock } }).__player;
const setAudioMode = Audio.setAudioModeAsync as unknown as jest.MockedFunction<
  typeof Audio.setAudioModeAsync
>;

/** Stands in for a bundled asset. The real one is a require() of a ≤30 s excerpt. */
const FAKE_ASSET = { uri: 'file:///adhan.wav' };

beforeEach(() => {
  player.playing = false;
  player.play.mockClear();
  player.pause.mockClear();
  player.seekTo.mockClear();
  setAudioMode.mockClear();
});

describe('with no adhan in the build', () => {
  it('reports itself unavailable, so the caller renders nothing', async () => {
    // Not a disabled play button: that promises a feature the build does not have.
    expect(ADHAN_SOURCE).toBeNull();
    const { result } = await renderHook(() => useAdhanPreview());
    expect(result.current.available).toBe(false);
  });

  it('stays silent even if something presses it anyway', async () => {
    const { result } = await renderHook(() => useAdhanPreview());
    await act(() => result.current.toggle());
    expect(player.play).not.toHaveBeenCalled();
  });
});

describe('with an adhan in the build', () => {
  it('plays from the beginning', async () => {
    // From the beginning every time, not from wherever the last press left off — an
    // audition that starts halfway through tells the reader nothing about the recitation.
    const { result } = await renderHook(() => useAdhanPreview(FAKE_ASSET));

    await act(() => result.current.toggle());

    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalled();
  });

  it('ducks other audio rather than stopping it', async () => {
    // Someone auditioning a notification sound over a recitation or a podcast should get
    // their audio back afterwards. 'doNotMix' would take it away for good.
    const { result } = await renderHook(() => useAdhanPreview(FAKE_ASSET));

    await act(() => result.current.toggle());

    expect(setAudioMode).toHaveBeenCalledWith(
      expect.objectContaining({ interruptionMode: 'duckOthers', shouldPlayInBackground: false }),
    );
  });

  it('plays even with the ringer on silent', async () => {
    // The reader PRESSED PLAY. Honouring the silent switch here means they press it, hear
    // nothing, and conclude the sound is broken.
    const { result } = await renderHook(() => useAdhanPreview(FAKE_ASSET));

    await act(() => result.current.toggle());

    expect(setAudioMode).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: true }));
  });

  it('stops and rewinds when pressed while sounding', async () => {
    player.playing = true;
    const { result } = await renderHook(() => useAdhanPreview(FAKE_ASSET));

    await act(() => result.current.toggle());

    expect(player.pause).toHaveBeenCalled();
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('never leaves the adhan sounding out of a screen the reader has left', async () => {
    // Startling anywhere; in a mosque, worse than startling.
    player.playing = true;
    const { unmount } = await renderHook(() => useAdhanPreview(FAKE_ASSET));

    await unmount();

    expect(player.pause).toHaveBeenCalled();
  });
});
