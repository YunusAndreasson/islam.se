// Shared data + helpers for the Om / Vanliga frågor / Kontakt screens — split
// out so the three sub-screens, all pushed independently from Inställningar,
// can read from one source rather than each re-declaring URLs and FAQ copy.
//
// Kept thin: only data + a few "open the right place, never crash" wrappers.
// The screens themselves own their layout.
import Constants from 'expo-constants';
import { Linking } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';

export const SITE_URL = 'https://islam.se';
export const SUPPORT_EMAIL = 'support@islam.se';

// Open-source projects credited on the Om page — linked so each name is plainly
// a real project, not a stray word.
export const ADHAN_URL = 'https://github.com/batoulapps/adhan-js';
export const MAPLIBRE_URL = 'https://maplibre.org';
export const OSM_URL = 'https://www.openstreetmap.org/copyright';

export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';

// The questions a reader actually has, answered truthfully. Kept as data so the
// copy lives in one place and the FAQ screen just maps over it.
export const FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Hur räknas bönetiderna ut?',
    answer:
      'Tiderna beräknas med det öppna biblioteket adhan, som bygger på vedertagna astronomiska metoder. islam.se har inget eget uträkningssystem utan använder dessa etablerade metoder. Du väljer själv beräkningsmetod (Muslim World League är standard), madhhab och hur höga breddgrader hanteras under Inställningar.',
  },
  {
    question: 'Stämmer det islamiska datumet?',
    answer:
      'Datumet följer den aritmetiska Hijri-kalendern, som räknas ut i förväg och alltid ger ett bestämt datum. Det kan därför skilja en dag från officiella besked. Stämmer det inte med din lokala kalender kan du justera det med Hijri-justeringen under Inställningar.',
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
      'Platsen används bara i din enhet för att räkna ut bönetider och qibla. Appen har inga konton och samlar inte in någon uppgift om dig. Du kan också ange en plats för hand under Inställningar.',
  },
  {
    question: 'Var kommer kartan ifrån?',
    answer:
      'Kartan visas med MapLibre. Kartdatan kommer från OpenFreeMap, OpenMapTiles och OpenStreetMap-bidragsgivare.',
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
