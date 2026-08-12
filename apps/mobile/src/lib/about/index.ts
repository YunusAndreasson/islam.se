// Shared data + helpers for the Om / Vanliga frågor / Kontakt screens — split
// out so the three sub-screens, all pushed independently from Inställningar,
// can read from one source rather than each re-declaring URLs and FAQ copy.
//
// Kept thin: only data + a few "open the right place, never crash" wrappers.
// The screens themselves own their layout.
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Linking } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';

// Reached only through emailSupport() below — the screens never render the address
// itself, so it stays module-private.
const SUPPORT_EMAIL = 'support@islam.se';

// The project's website — the app is one part of islam.se. Linked from the Om page
// as the outward "read more about the project" anchor.
export const ISLAMSE_URL = 'https://islam.se';

// Open-source projects credited on the Om page — linked so each name is plainly
// a real project, not a stray word.
export const ADHAN_URL = 'https://github.com/batoulapps/adhan-js';
export const MAPLIBRE_URL = 'https://maplibre.org';
export const OSM_URL = 'https://www.openstreetmap.org/copyright';
export const OPENFREEMAP_URL = 'https://openfreemap.org';
export const MAPTILER_URL = 'https://www.maptiler.com/copyright/';
// Elevation tiles behind the map's hillshade on the key-less path. Credited separately
// from the vector tiles because it is a different project with its own data sources.
export const AWS_TERRAIN_URL = 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md';

export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';

/**
 * Short, human-readable label for the JS bundle that's actually running, so the
 * colophon shows precisely what landed: an OTA update (e.g. "OTA 019e7195 · 29
 * maj 2026") or the binary's embedded bundle ("Inbäddad"). On dev builds (`expo
 * start`) the JS is served from Metro — neither an OTA nor the embedded bundle —
 * so we report "Utveckling" for honesty.
 *
 * `Updates.updateId` is null until an OTA has been downloaded and applied; once
 * applied, every subsequent launch returns it. `isEmbeddedLaunch` is true when
 * the binary's baked-in bundle is what booted (no OTA, or OTA on a different
 * runtimeVersion sitting waiting — the case for users on a 1.0.1 binary while a
 * 1.0.2 OTA exists).
 */
export const OTA_LABEL: string = (() => {
  if (__DEV__) return 'Utveckling';
  if (Updates.isEmbeddedLaunch) return 'Inbäddad';
  const id = Updates.updateId;
  if (!id) return 'Inbäddad';
  const short = id.slice(0, 8);
  const at = Updates.createdAt;
  if (!at) return `OTA ${short}`;
  // Swedish short-form date — keep the colophon scannable.
  const date = new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(at);
  return `OTA ${short} · ${date}`;
})();

// The questions a reader actually has, answered truthfully. Kept as data so the
// copy lives in one place and the FAQ screen just maps over it.
export const FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Hur räknas bönetiderna ut?',
    answer:
      'Tiderna beräknas med det öppna biblioteket adhan, som bygger på vedertagna astronomiska metoder. islam.se har inget eget uträkningssystem utan använder dessa etablerade metoder. Du väljer själv beräkningsmetod (Diyanet är appens standard), madhhab och hur höga breddgrader hanteras under Inställningar.',
  },
  {
    question: 'Stämmer det islamiska datumet?',
    answer:
      'Datumet följer den aritmetiska Hijri-kalendern, som räknas ut i förväg och alltid ger ett bestämt datum. Det kan därför avvika en dag från officiella besked. Stämmer det inte med din lokala kalender kan du justera det med Hijri-justeringen under Inställningar.',
  },
  {
    question: 'När börjar ramadan och de stora högtiderna?',
    answer:
      'Starten på ramadan och högtider som Eid fastställs av officiella islamiska institutioner genom månsiktning, inte av appens beräknade kalender. Datumet i appen är vägledande – följ din lokala moské eller en officiell institution för det slutgiltiga beskedet.',
  },
  {
    question: 'Hur fungerar qibla?',
    answer:
      'Qibla-vyn visar riktningen till Kaba i Mecka från din plats, beräknad som den kortaste vägen längs jordens yta, och anger fågelvägen dit i kilometer. Saknar enheten kompass visas riktningen räknad från norr.',
  },
  {
    question: 'Använder appen min plats?',
    answer:
      'Platsen används bara i din enhet för att räkna ut bönetider och qibla. Appen har inga konton och samlar inte in några uppgifter om dig. Du kan också ange en plats för hand under Inställningar.',
  },
  {
    // The permanent home for the map lesson (bonetider's MapLessonCard, shown once after
    // onboarding finishes). The intro runs once; this is where the answer lives for
    // everyone who skipped it, installed the app before it existed, or simply wants to
    // read it again.
    question: 'Vad betyder linjerna på kartan?',
    answer:
      'Varje linje är en bön. Maghrib-linjen visar var i landet klockan just nu är exakt Maghrib – den vandrar västerut med jordens rotation, tänds, sveper över kartan och slocknar. Färgtoningen är något annat: solens höjd under horisonten, punkt för punkt, vilket är därför sommarnatten i söder är djupblå men aldrig svart. Norr om den streckade linjen går solen inte ner på sommaren (och inte upp på vintern) – där saknar Fajr och ʿIshāʾ tider, och deras linjer tonar bort. Du hittar hela genomgången under Inställningar → Visa introduktionen igen.',
  },
  {
    question: 'Varifrån kommer kartan?',
    answer:
      'Kartan visas med MapLibre. Kartdatan kommer från MapTiler (med höjdrelief), OpenMapTiles och OpenStreetMap-bidragsgivare. Saknas en MapTiler-nyckel används OpenFreeMap utan kostnad.',
  },
];

/** Open a URL in an in-app browser (stays inside the app, themable). Never throws. */
export function openUrl(url: string): void {
  void WebBrowser.openBrowserAsync(url).catch(() => {});
}

/** Ask for a store rating in-place when the platform offers it (the native review
 *  sheet); otherwise fall back to the store listing. Silent on devices/emulators
 *  without either, never throws. */
export function rateApp(): void {
  void (async () => {
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
        return;
      }
      const url = StoreReview.storeUrl();
      if (url) await Linking.openURL(url);
    } catch {
      // Rating is a nicety — a failed prompt must never disrupt the screen.
    }
  })();
}

/** Prefer the native mail composer; fall back to a mailto: link on devices
 *  without one (most emulators). Never rejects. */
export function emailSupport(): void {
  void (async () => {
    try {
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({ recipients: [SUPPORT_EMAIL] });
      } else {
        await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
      }
    } catch {
      // A contact tap should never crash the screen.
    }
  })();
}
