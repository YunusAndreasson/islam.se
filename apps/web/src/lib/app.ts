// Mobile-app identities and copy — the single source of truth for every web→app
// promotion surface (AppPromo component, the Smart App Banner meta, the /app page).
// Kept dependency-free so any page or layout can import it without pulling in data.

/** App Store numeric id — drives the iOS Smart App Banner (apple-itunes-app meta). */
export const APP_STORE_ID = "6774383118";
export const APP_STORE_URL = `https://apps.apple.com/se/app/islam-se/id${APP_STORE_ID}`;

/** Google Play package name — also used in the manifest's related_applications. */
export const PLAY_PACKAGE = "se.islam.mobile";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

/** What the native app gives a prayer-times reader that the web can't — the pitch.
 *  House style: sentence case, no sectarian terms. Reused across every variant. */
export const APP_FEATURES = [
	"Påminnelser före varje bön",
	"En widget på hemskärmen",
	"Qibla-kompass",
	"Fungerar även offline",
] as const;

/** One-line value proposition. Swedish house style: no em dash. */
export const APP_TAGLINE =
	"Påminnelser före varje bön, en widget på hemskärmen och qibla-kompass. Fungerar även offline.";
