// Product analytics: the Mixpanel token, its server, and the only event names Mixpanel may
// receive.
import Constants from 'expo-constants';

import type { IntroHistory } from '@/lib/intro';
import type { LocationSource } from '@/lib/location/resolve';

// The token lives in app.json (expo.extra.mixpanelToken), beside sentryDsn and for the same
// reason: it is public by design (it ships inside every bundle), and one place holds what the
// binary reports to. Empty, analytics is a silent no-op.
const token: unknown = Constants.expoConfig?.extra?.mixpanelToken;
export const MIXPANEL_TOKEN = typeof token === 'string' && token.trim() !== '' ? token : undefined;

// The project uses Mixpanel's EU data residency. The SDK's default is the US endpoint, which
// an EU project does not accept, so this is handed to init() explicitly.
export const MIXPANEL_SERVER_URL = 'https://api-eu.mixpanel.com';

// Keep this list short. Every name here is something that leaves the device, and the
// privacy policy (apps/web/src/pages/integritetspolicy.astro, »Användningsstatistik«) and
// the store answers (docs/app-store-submission.md) list what that is. A new event or
// property that sends something new changes both before it ships.
//
// ⚠️ NO EVENT CARRIES A POSITION. Not the GPS fix, not the map camera, not a chosen place,
// not a mosque, not anything computed from them (a prayer time, a zone, a distance). The
// only geography Mixpanel has is the city it derives server-side from the request's IP
// address. See ./index.ts.
//
// ⚠️ SETTINGS LEAVE ONLY AS COARSE STATES, as the owner decided (2026-11-21: privacy first,
// but enough to explain who stays). Allowed: whether reminders are on and reach the phone,
// how many arrive per day, whether one plays the adhan, which prayer a reminder setting
// changed for and its new lead (minutes) or sound (default/silent/adhan), and HOW the
// location is set (gps/manual/default). Never: the place or its name, a coordinate, the
// calculation method, the madhab, or any free text. Every property is an enum, a number or
// a boolean — see ./properties for the functions that build them.
export const ANALYTICS_EVENTS = {
  /** The app came to the foreground. `launch`: 'cold' once per JS start (only once the app
   *  is actually active, so an iOS background launch never counts), 'warm' on a return
   *  after at least 30 s away. The "active user" event. */
  APP_OPENED: 'App Opened',
  /** Once per install, on the first open of a build that has it. `install_kind`: 'new'
   *  when the introduction was still pending (a fresh install), 'existing' for an update. */
  FIRST_OPEN: 'First Open',
  /** A route came into view. `screen` is the route's file path, never its parameters. The
   *  "/" gate, which only redirects, is not a screen and is never sent. */
  SCREEN_VIEWED: 'Screen Viewed',
  /** An introduction step came into view. `step` welcome|location|notifications|method,
   *  `index` 0–3, `replay` true when opened from Inställningar → Visa introduktionen igen. */
  ONBOARDING_STEP_VIEWED: 'Onboarding Step Viewed',
  /** The introduction reached its end through its last step. `at_step`, `replay`,
   *  `location_source` and `reminders` (on|off|blocked) describe what it produced. */
  INTRO_COMPLETED: 'Intro Completed',
  /** The introduction was left through the welcome step's "Hoppa över". Same properties as
   *  Intro Completed. */
  INTRO_SKIPPED: 'Intro Skipped',
  /** The OS permission dialog is about to appear. Sent only when it will: an already
   *  answered permission shows nothing. `permission`, `primed` (an in-app explanation came
   *  first), `source`. */
  PERMISSION_PROMPT_SHOWN: 'Permission Prompt Shown',
  /** The app asked for a permission and has the answer, dialog or not. `granted`,
   *  `prompted` (whether the dialog actually appeared), plus the Prompt Shown properties. */
  PERMISSION_RESULT: 'Permission Result',
  /** The map's soft-ask card appeared. `permission`, `showing` (1 or 2: the policy allows
   *  two, ever). */
  PERMISSION_CARD_SHOWN: 'Permission Card Shown',
  /** The card's ✕ was pressed. `permission`, `state` (ask|granted|denied|error: what the
   *  card was showing when it was closed). */
  PERMISSION_CARD_CLOSED: 'Permission Card Closed',
  /** A prayer reminder was tapped. `prayer` is the alert's slot (fajr…isha, sunrise,
   *  lastThird), `action` tap|button, `cold` whether the tap started the app. Delivered
   *  alerts that nobody taps send nothing. */
  NOTIFICATION_OPENED: 'Notification Opened',
  /** The home-screen widget opened the app. `cold` whether it started it. */
  WIDGET_OPENED: 'Widget Opened',
  /** The reminders master switch changed. `enabled`, `source` intro|map_card|settings. */
  REMINDERS_TOGGLED: 'Reminders Toggled',
  /** One control under Inställningar → Notiser changed. `setting`, `prayer` (a slot, or
   *  'all' for the "Gäller alla" controls), `value`: a boolean, minutes or a sound key. */
  NOTIFICATION_SETTINGS_CHANGED: 'Notification Settings Changed',
  /** A location was set. `source` gps|manual, `context` intro|map_card|dock|settings.
   *  Never the place. */
  LOCATION_SET: 'Location Set',
  /** The Qibla dial locked on, at most once per visit to the screen. */
  QIBLA_ALIGNED: 'Qibla Aligned',
  /** A mosque correction reached the server. `reason` is the ReportReason, nothing else. */
  MOSQUE_REPORT_SENT: 'Mosque Report Sent',
} as const;

/**
 * The events `analytics.track` accepts. A hand-written string is a compile error rather
 * than a row in Mixpanel under a name no report queries.
 */
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Which OS permission an event is about. */
export type PermissionKind = 'location' | 'notifications';

/** Where in the app a permission was asked for, or a setting changed. */
export type PermissionSource = 'intro' | 'map_card' | 'settings' | 'qibla';

/** Where a location was set from. `dock` is the dock's "Välj plats" while the app is on the
 *  Stockholm fallback. */
export type LocationContext = 'intro' | 'map_card' | 'dock' | 'settings';

/** Whether reminders are on, and whether they reach the phone. */
export type RemindersState = 'on' | 'off' | 'blocked';

/**
 * Super properties: coarse states every later event carries, so retention can be split by
 * them. Registered through `analytics.register` / `registerOnce`; see ./index.
 */
export interface SuperProperties {
  /** The day this app was first installed on the device (YYYY-MM-DD, the device's own
   *  calendar). Dates updaters as well as new installs. Registered once. */
  install_date: string;
  /** 'new' or 'existing', decided by First Open. Registered once. */
  install_kind: 'new' | 'existing';
  /** Reminders are switched on AND the OS lets them through. */
  notifications_enabled: boolean;
  /** Reminders asked for per day (the enabled prayers plus the two optional markers); 0
   *  while the master switch is off. */
  reminders_per_day: number;
  /** At least one enabled reminder plays the adhan, in a build that can play it. */
  adhan_sound: boolean;
  /** How the prayer-time location is set: GPS, a picked city, or the Stockholm fallback. */
  location_source: LocationSource;
  /** How this install came past the introduction. */
  intro_status: IntroHistory;
}
