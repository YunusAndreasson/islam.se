import type { APIContext, InferGetStaticPropsType } from "astro";
import { INDEXED_PLACES, OG_POPULATION } from "../../../lib/bonetider/places-index";
import { hasRamadanSheet, ramadanPdf } from "../../../lib/bonetider/ramadan-pdf";

// Ramadan som utskriftsfärdigt A4-ark: /bonetider/<stad>/ramadan.pdf
//
// Samma orter som månadsarket (över OG_POPULATION), och bara de där varje fastedag går
// att räkna ut — samma villkor som ortssidan länkar på, så att länken aldrig pekar på
// en fil som inte byggdes. Arket cachas per ort och ramadan, så kostnaden betalas en gång
// per år och inte varje natt.
export function getStaticPaths() {
	const sample = Number(process.env.BONETIDER_SAMPLE ?? 0);
	const places = sample > 0 ? INDEXED_PLACES.slice(0, sample) : INDEXED_PLACES;
	return places
		.filter((p) => p.population >= OG_POPULATION && hasRamadanSheet(p))
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

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export function GET({ props }: APIContext<Props>) {
	const pdf = ramadanPdf(props);
	if (!pdf)
		throw new Error(`ramadan.pdf: no sheet for ${props.slug}, though getStaticPaths listed it`);
	return new Response(new Uint8Array(pdf), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `inline; filename="ramadan-${props.slug}.pdf"`,
		},
	});
}
