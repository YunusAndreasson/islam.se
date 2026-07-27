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
		term: "Bönetider för din ort",
		gloss: "Dygnets fem böner, ställda efter den metod din moské följer.",
	},
	{
		term: "Solens gång över landet",
		gloss:
			"En karta där ljuset vandrar över Sverige och visar hur långt det är kvar till nästa bön.",
	},
	{
		term: "Qiblan",
		gloss: "En kompass mot Kaba, räknad för platsen där du står.",
	},
	{
		term: "Påminnelse före bön",
		gloss: "En avisering när det närmar sig, och nästa bön på hem- och låsskärmen.",
	},
	{
		term: "Ingen spårning",
		gloss: "Inget konto, inga annonser. Orten du väljer stannar i telefonen.",
	},
] as const;

/** One line, shown under the heading everywhere the app is mentioned. No em dash. */
export const APP_TAGLINE =
	"Bönetider för hela Sverige, uträknade i telefonen och ritade efter solens gång över landet.";
