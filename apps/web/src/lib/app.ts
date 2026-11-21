// Mobile-app identities and copy — the single source of truth for every web→app
// promotion surface (AppPromo component, the Smart App Banner meta, the /app page).
// Kept dependency-free so any page or layout can import it without pulling in data.

const APP_STORE_ID = "6774383118";
/** The app's identity on the App Store: for structured data (sameAs, installUrl) and the
 *  manifest. A link a reader clicks takes appStoreUrl(campaign) instead. */
export const APP_STORE_URL = `https://apps.apple.com/se/app/islam-se/id${APP_STORE_ID}`;

// Public App Store Connect campaign provider identifier from Marketer's islam-se config.
const APP_STORE_PROVIDER_ID = "2189605";

/** Google Play package name — also hand-mirrored in public/manifest.webmanifest's
 *  related_applications, which can't reference this module. */
const PLAY_PACKAGE = "se.islam.mobile";
/** The app's identity on Google Play; see APP_STORE_URL. */
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

/** Every place on the site that sends a reader to a store, one campaign each, so the
 *  store consoles can say which surface brought an install (docs/store-attribution-check.md).
 *  The same token goes to both stores. All 2 128 city pages share one: a campaign per
 *  city would sit under Apple's five-download threshold and never show. App Store
 *  campaign tokens are at most 40 characters. */
export const APP_CAMPAIGNS = {
	/** iOS Safari's Smart App Banner, on every page (Base.astro). */
	safariBanner: "web-safari-banner",
	/** The Android-only strip on /bonetider/. */
	androidStrip: "web-android-strip",
	/** /app/, the app's own page. */
	appPage: "web-app-page",
	/** The front page's closing band. */
	home: "web-home",
	/** »Ta med tiderna« on each /bonetider/<stad>/. */
	city: "web-city",
	/** /bonetider/metod/. */
	method: "web-metod",
	/** /bonetider/ramadan/. */
	ramadan: "web-ramadan",
} as const;
export type AppCampaign = (typeof APP_CAMPAIGNS)[keyof typeof APP_CAMPAIGNS];

/** An App Store link that App Store Connect counts under `campaign`. */
export function appStoreUrl(campaign: AppCampaign): string {
	const query = new URLSearchParams({ pt: APP_STORE_PROVIDER_ID, ct: campaign, mt: "8" });
	return `${APP_STORE_URL}?${query}`;
}

/** A Google Play link whose install referrer Play Console reports as UTM campaign `campaign`. */
export function playStoreUrl(campaign: AppCampaign): string {
	const referrer = new URLSearchParams({
		utm_source: "islam-se",
		utm_medium: "referral",
		utm_campaign: campaign,
	});
	return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer.toString())}`;
}

export const SMART_APP_BANNER_CONTENT = `app-id=${APP_STORE_ID}, affiliate-data=pt=${APP_STORE_PROVIDER_ID}&ct=${APP_CAMPAIGNS.safariBanner}`;
export const ANDROID_PRAYER_STRIP_URL = playStoreUrl(APP_CAMPAIGNS.androidStrip);

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
