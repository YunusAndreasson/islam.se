// Mobile-app identities and copy — the single source of truth for every web→app
// promotion surface (AppPromo component, the Smart App Banner meta, the /app page).
// Kept dependency-free so any page or layout can import it without pulling in data.

/** App Store numeric id — drives the iOS Smart App Banner (apple-itunes-app meta). */
export const APP_STORE_ID = "6774383118";
export const APP_STORE_URL = `https://apps.apple.com/se/app/islam-se/id${APP_STORE_ID}`;

/** Google Play package name — also used in the manifest's related_applications. */
export const PLAY_PACKAGE = "se.islam.mobile";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

/** The app's pillars — each a short term and an explanatory line. Drawn from the
 *  App Store description, trimmed to the house voice (calm, sentence case, no
 *  sectarian framing). Rendered as the feature list on the /app page. */
export const APP_FEATURES = [
	{
		term: "Exakta bönetider",
		gloss: "Tider för dygnets fem böner, beräknade på din enhet och justerbara efter din moské.",
	},
	{
		term: "Solur över Sverige",
		gloss:
			"Solens båge över landet visar var på dygnet du är och hur långt det är kvar till nästa bön.",
	},
	{
		term: "Qibla mot Mecka",
		gloss: "En tydlig kompass mot Kaba, rättad för platsen där du står.",
	},
	{
		term: "Påminnelser och widget",
		gloss: "En stillsam avisering före bön, och nästa bön på hem- och låsskärmen.",
	},
	{
		term: "Privat som standard",
		gloss: "Ingen inloggning, ingen spårning, ingen reklam. Din plats stannar på enheten.",
	},
] as const;

/** One-line value proposition. Swedish house style: no em dash. */
export const APP_TAGLINE =
	"Bönetider för hela Sverige, beräknade på din enhet och ritade med solens vandring över landet.";
