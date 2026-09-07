// Mobile-app identities and copy — the single source of truth for every web→app
// promotion surface (AppPromo component, the Smart App Banner meta, the /app page).
// Kept dependency-free so any page or layout can import it without pulling in data.

/** App Store numeric id — drives the iOS Smart App Banner (apple-itunes-app meta). */
export const APP_STORE_ID = "6774383118";
export const APP_STORE_URL = `https://apps.apple.com/se/app/islam-se/id${APP_STORE_ID}`;

/** Google Play package name — also hand-mirrored in public/manifest.webmanifest's
 *  related_applications, which can't reference this module. */
const PLAY_PACKAGE = "se.islam.mobile";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

/** The app's pillars — each a short term and an explanatory line. Drawn from the
 *  App Store description, trimmed to the house voice (calm, sentence case, no
 *  sectarian framing). Rendered as the feature list on the /app page. */
export const APP_FEATURES = [
	{
		key: "tider",
		term: "Bönetider för din ort",
		gloss: "Dygnets fem böner, ställda efter den metod din moské följer.",
	},
	{
		key: "karta",
		term: "Solens gång över landet",
		gloss:
			"En karta där ljuset vandrar över Sverige och visar hur långt det är kvar till nästa bön.",
	},
	{
		key: "qibla",
		term: "Qiblan",
		gloss: "En kompass mot Kaba, räknad för platsen där du står.",
	},
	{
		key: "paminnelse",
		term: "Påminnelse före bön",
		gloss: "En avisering när det närmar sig, och nästa bön på hem- och låsskärmen.",
	},
	{
		key: "integritet",
		term: "Ingen spårning",
		gloss: "Inget konto, inga annonser. Orten du väljer stannar i telefonen.",
	},
] as const;

/** One line, shown under the heading everywhere the app is mentioned. No em dash. */
export const APP_TAGLINE =
	"Bönetider för hela Sverige, uträknade i telefonen och ritade efter solens gång över landet.";

/** What the city prayer pages lead with: the three things that page cannot do for
 *  itself. On a surface that is 91 % phones, naming them beats a bare badge pair —
 *  the page has just answered "when is the prayer", so the app has to answer
 *  something else to be worth a download. */
const CITY_KEYS = ["paminnelse", "qibla", "karta"] as const;
export const APP_CITY_FEATURES = CITY_KEYS.map((k) => {
	const f = APP_FEATURES.find((x) => x.key === k);
	if (!f) throw new Error(`APP_CITY_FEATURES: no APP_FEATURES entry keyed "${k}"`);
	return f;
});
