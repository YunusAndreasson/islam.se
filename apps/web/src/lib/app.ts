// Mobile-app identities and copy — the single source of truth for every web→app
// promotion surface (AppPromo component, the Smart App Banner meta, the /app page).
// Kept dependency-free so any page or layout can import it without pulling in data.

const APP_STORE_ID = "6774383118";
export const APP_STORE_URL = `https://apps.apple.com/se/app/islam-se/id${APP_STORE_ID}`;

// Public App Store Connect campaign provider identifier from Marketer's islam-se config.
const APP_STORE_PROVIDER_ID = "2189605";
export const SMART_APP_BANNER_CONTENT = `app-id=${APP_STORE_ID}, affiliate-data=pt=${APP_STORE_PROVIDER_ID}&ct=web-safari-banner`;

/** Google Play package name — also hand-mirrored in public/manifest.webmanifest's
 *  related_applications, which can't reference this module. */
const PLAY_PACKAGE = "se.islam.mobile";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;
const ANDROID_PRAYER_STRIP_REFERRER = new URLSearchParams({
	utm_source: "islam-se",
	utm_medium: "referral",
	utm_campaign: "web-android-strip",
});
export const ANDROID_PRAYER_STRIP_URL = `${PLAY_STORE_URL}&referrer=${encodeURIComponent(ANDROID_PRAYER_STRIP_REFERRER.toString())}`;

/** The app's pillars — each a short term and an explanatory line. Drawn from the
 *  App Store description, trimmed to the house voice (calm, sentence case, no
 *  sectarian framing). Rendered as the feature list on the /app page. */
export const APP_FEATURES = [
	{
		key: "tider",
		term: "Bönetider för din ort",
		gloss: "Dygnets fem böner, beräknade med samma metod som din moské.",
	},
	{
		key: "karta",
		term: "Solens gång över landet",
		gloss: "Se solens läge över Sverige och hur lång tid det är kvar till nästa bön.",
	},
	{
		key: "qibla",
		term: "Qiblan",
		gloss: "Visar riktningen mot Kaba från din plats.",
	},
	{
		key: "paminnelse",
		term: "Påminnelse före bön",
		gloss: "En avisering när bönen närmar sig, och nästa bön på hem- och låsskärmen.",
	},
	{
		key: "integritet",
		term: "Inget konto",
		gloss: "Inga annonser, ingen spårning mellan appar. Orten du väljer stannar i telefonen.",
	},
] as const;

/** One line, shown under the heading everywhere the app is mentioned. No em dash. */
export const APP_TAGLINE = "Bönetider för din ort, även utan uppkoppling.";
