import { monthPdf } from "../../../lib/bonetider/pdf";
import { INDEXED_PLACES, OG_POPULATION } from "../../../lib/bonetider/places-index";

// Månadens bönetider som utskriftsfärdig A4: /bonetider/<stad>/kalender.pdf
//
// Samma befolkningströskel som OG-korten (5 000), av samma skäl: 273 filer kostar drygt
// två minuter en gång i månaden, 2 128 hade kostat arton. Mindre orter har .ics-filen,
// som byggs för alla — se ./kalender.ics.ts.
export function getStaticPaths() {
	const sample = Number(process.env.BONETIDER_SAMPLE ?? 0);
	const places = sample > 0 ? INDEXED_PLACES.slice(0, sample) : INDEXED_PLACES;
	return places
		.filter((p) => p.population >= OG_POPULATION)
		.map((p) => ({
			params: { stad: p.slug },
			props: {
				name: p.name,
				slug: p.slug,
				county: p.county,
				lat: p.lat,
				lon: p.lon,
			},
		}));
}

interface Props {
	name: string;
	slug: string;
	county?: string | undefined;
	lat: number;
	lon: number;
}

export function GET({ props }: { props: Props }) {
	const pdf = monthPdf(props);
	return new Response(new Uint8Array(pdf), {
		headers: {
			"Content-Type": "application/pdf",
			// `inline`: en månadstabell tittar man på först och skriver ut sedan. Filnamnet
			// är ändå satt, så "spara som" ger något som går att hitta igen.
			"Content-Disposition": `inline; filename="bonetider-${props.slug}.pdf"`,
		},
	});
}
