import { INDEXED_PLACES, OG_POPULATION } from "../../../lib/bonetider/places-index";
import { ogEndpoint } from "../../../lib/og-endpoints";

// Personalised OG cards for the larger towns only (population ≥ OG_POPULATION); smaller
// places fall back to the shared /bonetider/og.png card, keeping the build cheap. Prayer
// names are kept ASCII here so the vendored satori fonts render them without tofu.
export function getStaticPaths() {
	return INDEXED_PLACES.filter((p) => p.population >= OG_POPULATION).map((p) => ({
		params: { stad: p.slug },
		props: { name: p.name, county: p.county },
	}));
}

export const GET = ogEndpoint<{ name: string; county: string }>((p) => ({
	kicker: "Bönetider",
	title: p.name,
	framing: `Fajr · Dhuhr · Asr · Maghrib · Isha – varje dag${p.county ? `, ${p.county}` : ""}`,
}));
