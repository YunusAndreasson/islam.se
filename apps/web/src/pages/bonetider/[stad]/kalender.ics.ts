import { prayerCalendar } from "../../../lib/bonetider/ics";
import { INDEXED_PLACES } from "../../../lib/bonetider/places-index";

// En .ics per ort: /bonetider/<stad>/kalender.ics
//
// Till skillnad från OG-korten, som bara de större orterna får, byggs den här för alla
// 2 128 — en kalender är hela poängen med en liten ort, där ingen annan tjänst bryr sig
// om att räkna. Innevarande månad, ~155 händelser, ~37 kB per fil.
//
// ⚠️ Sampeln följer ../[stad].astro. Utan den skulle `pnpm build:fast` bygga alla 2 128
// kalendrarna medan sidorna de hör till hoppas över — tolv sidor och tvåtusen filer.
export function getStaticPaths() {
	const sample = Number(process.env.BONETIDER_SAMPLE ?? 0);
	const places = sample > 0 ? INDEXED_PLACES.slice(0, sample) : INDEXED_PLACES;
	return places.map((p) => ({
		params: { stad: p.slug },
		props: { name: p.name, slug: p.slug, lat: p.lat, lon: p.lon },
	}));
}

interface Props {
	name: string;
	slug: string;
	lat: number;
	lon: number;
}

export function GET({ props }: { props: Props }) {
	return new Response(prayerCalendar(props), {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			// `inline`, inte `attachment`: en prenumeration ska öppnas av kalenderappen,
			// inte hamna i nedladdningsmappen. Den som ändå vill spara filen kan.
			"Content-Disposition": `inline; filename="bonetider-${props.slug}.ics"`,
		},
	});
}
