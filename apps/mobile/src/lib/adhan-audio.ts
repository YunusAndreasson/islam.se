// Playing the adhan inside the app, so a sound choice can be heard before it is committed to.
//
// Every other control in Påminnelser can be judged on the spot — a lead time moves the
// "Nästa påminnelse" line, a toggle changes what the summary says. The sound picker could
// not: the reader picked a name and found out what it meant days later, at Fajr, in the
// dark. A preview is the smallest thing that closes that loop.
//
// ⚠️ THIS IS NOT THE NOTIFICATION SOUND. The two are separate mechanisms and only one of
// them is JavaScript:
//
//   • The NOTIFICATION sound is a native bundle resource on iOS and a res/raw entry inside a
//     frozen channel on Android, both written at build time by the expo-notifications config
//     plugin. It is played by the OS, from the lock screen, with the app closed.
//   • THIS plays the same file through expo-audio while the app is open and the reader is
//     looking at the picker.
//
// They must therefore be the same asset, and — because iOS refuses a custom notification
// sound longer than 30 seconds — that asset is a short excerpt, not a full adhan. An excerpt
// is also the right thing to audition: nobody wants to sit through two minutes to find out
// which recitation they picked.
//
// ── TURNING IT ON (one asset, two edits, one build) ──────────────────────────────────────
//
//   1. Put the file at assets/sounds/adhan.wav — PCM, mono, ≤ 30 s. (iOS accepts
//      .wav/.aiff/.caf; anything longer is silently replaced by the default tone.)
//   2. Here: ADHAN_SOURCE = require('../../assets/sounds/adhan.wav').
//   3. In lib/notifications: ADHAN_SOUND_FILE = 'adhan.wav', AND bump CHANNEL_VERSION —
//      an Android channel's sound is frozen at creation, so existing installs keep the old
//      silent channel forever otherwise.
//   4. In app.json, add it to the expo-notifications plugin's `sounds` array.
//   5. `eas build`. None of this is OTA-able; the file is a native resource.
//
// The constant is null rather than the module being absent so that the plumbing above,
// the UI that renders it, and the tests that cover both are already in place and proven —
// the flip is an asset decision (which recitation, whose licence), not an engineering one.
//
// ⚠️ THE PLUGIN CONFIG IN app.json IS NOT OPTIONAL, AND IT IS NOT TIDINESS. expo-audio's
// config plugin defaults to `recordAudioAndroid: true` and `enableBackgroundPlayback: true`,
// because the module can record and can play in the background. This app does neither. Left
// at the defaults, a prebuild silently writes into AndroidManifest.xml:
//
//     android.permission.RECORD_AUDIO
//     android.permission.FOREGROUND_SERVICE
//     android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK
//     (plus a mediaPlayback foreground service, and NSMicrophoneUsageDescription on iOS)
//
// A prayer-times app asking for the MICROPHONE is not a cosmetic problem. The Om page
// promises »Appen har inga konton och samlar inte in några uppgifter om dig«, and that
// promise is checkable — the permission list is one tap from the app's own settings page.
// It also drags in a Play Store data-safety declaration for a capability the app does not
// have. So app.json pins all four flags off, and MODIFY_AUDIO_SETTINGS — a normal-level
// permission, no prompt, no disclosure — is the only thing this module adds to the build.
// Verify with `grep android.permission android/app/src/main/AndroidManifest.xml` after any
// prebuild that touches audio.
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioSource } from 'expo-audio';
import { useCallback, useEffect } from 'react';

/** The bundled adhan, or null until one ships. See the header for what turning it on takes. */
export const ADHAN_SOURCE: AudioSource | null = null;

/** Whether this build can play an adhan at all. Callers gate the RENDER on this rather than
 *  letting the hook run and return `available: false` — a hook that runs allocates a native
 *  AudioPlayer and subscribes to its status, and doing that on every open of Påminnelser for
 *  a row that cannot draw is pure cost. See notiser.tsx's call site. */
export const HAS_ADHAN_AUDIO = ADHAN_SOURCE !== null;

export interface AdhanPreview {
  /** False when this build carries no adhan — the caller renders nothing at all. */
  available: boolean;
  /** True while the excerpt is sounding. */
  playing: boolean;
  /** Start from the beginning, or stop if it is already playing. */
  toggle: () => void;
}

/**
 * @param source Injectable so the preview can be exercised without shipping an asset;
 * production callers pass nothing and get {@link ADHAN_SOURCE}.
 */
export function useAdhanPreview(source: AudioSource | null = ADHAN_SOURCE): AdhanPreview {
  const player = useAudioPlayer(source ?? undefined);
  const status = useAudioPlayerStatus(player);
  const available = source != null;

  // Leaving the adhan sounding out of a screen the reader has already left would be both
  // startling and, in a mosque, worse than startling.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // The player may already be released; there is nothing to stop.
      }
    };
  }, [player]);

  const toggle = useCallback(() => {
    if (!available) return;
    if (player.playing) {
      player.pause();
      void player.seekTo(0);
      return;
    }
    // Configured per press rather than once at startup, because this is the only thing in
    // the app that makes a sound and the session should not be claimed until it does.
    //
    //   • duckOthers, not doNotMix — someone auditioning a notification sound while a
    //     recitation or a podcast plays should get their audio back, not have it stopped.
    //   • playsInSilentMode — the reader PRESSED PLAY. Honouring the silent switch here
    //     means they press it, hear nothing, and conclude the sound is broken.
    void setAudioModeAsync({
      interruptionMode: 'duckOthers',
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => undefined);
    void player.seekTo(0);
    player.play();
  }, [available, player]);

  return { available, playing: available && status.playing, toggle };
}
