import { describe, expect, it } from "vitest";
import { type PillarSpokes, pillarBySvar } from "./svar-fordjupning";

/** The nine live pillars, as `data/fordjupning/*.md` declare them. */
const PILLARS: PillarSpokes[] = [
	{
		id: "abort",
		term: "Abort",
		related: [
			"vad-sager-islam-om-abort",
			"koranen-och-embryologi",
			"islams-syn-pa-kvinnan",
			"vad-ar-sharia",
			"vad-sager-islam-om-livet-efter-doden",
			"maste-gravida-fasta",
		],
	},
	{
		id: "aktenskap",
		term: "Äktenskapet",
		related: [
			"aktenskap-i-islam",
			"far-muslimska-man-ha-flera-fruar",
			"islams-syn-pa-kvinnan",
			"vad-sager-islam-om-hedersmord",
			"vad-ar-sharia",
			"vad-ar-hijab",
		],
	},
	{
		id: "doden",
		term: "Döden",
		related: [
			"vad-sager-islam-om-livet-efter-doden",
			"vad-ar-domedagen",
			"vad-ar-odet-qadar",
			"tror-muslimer-pa-anglar",
			"vad-sager-islam-om-abort",
		],
	},
	{
		id: "griskott",
		term: "Griskött",
		related: ["varfor-ater-muslimer-inte-griskott", "far-muslimer-roka", "vad-ar-sharia"],
	},
	{
		id: "halal",
		term: "Halal och haram",
		related: [
			"vad-ar-halalslakt",
			"varfor-ater-muslimer-inte-griskott",
			"far-muslimer-dricka-alkohol",
			"ar-vinager-halal",
			"vad-ar-sharia",
			"eid-al-fitr-och-eid-al-adha",
		],
	},
	{
		id: "hijab",
		term: "Hijab",
		related: [
			"vad-ar-hijab",
			"islams-syn-pa-kvinnan",
			"vad-ar-sharia",
			"aktenskap-i-islam",
			"vad-sager-islam-om-hedersmord",
			"vad-ar-sunna",
		],
	},
	{
		id: "kaba",
		term: "Kaba",
		related: [
			"vad-ar-kaba",
			"vad-ar-hajj",
			"erovringen-av-mecka",
			"vad-ar-en-moske",
			"sa-ber-man-steg-for-steg",
			"vad-ar-tawhid",
			"islam-och-polyteism",
		],
	},
	{
		id: "ramadan",
		term: "Ramadan",
		related: [
			"vad-ar-ramadan",
			"islams-fem-pelare",
			"maste-gravida-fasta",
			"eid-al-fitr-och-eid-al-adha",
			"vad-ar-zakat",
			"sunni-och-shia",
		],
	},
	{
		id: "tvagning",
		term: "Tvagning",
		related: [
			"tvagning-wudu",
			"vad-ar-ghusl",
			"sa-ber-man-steg-for-steg",
			"islams-fem-pelare",
			"vad-ar-en-moske",
			"sunni-och-shia",
		],
	},
];

const home = (slug: string) => pillarBySvar(PILLARS).get(slug)?.slug ?? null;

describe("pillarBySvar", () => {
	it("gives a pillar its own headline spoke even when another pillar names it too", () => {
		// The regression this function exists for: resolution used to take the first
		// pillar in collection (= filename) order, so aktenskap.md — which names
		// vad-ar-hijab LAST — won over hijab.md, which names it FIRST. The hijab
		// answer read "Fördjupning: Äktenskapet" on the live site.
		expect(home("vad-ar-hijab")).toBe("hijab");
		expect(home("vad-sager-islam-om-livet-efter-doden")).toBe("doden");
		expect(home("varfor-ater-muslimer-inte-griskott")).toBe("griskott");
	});

	it("prefers the pillar that ranks the answer highest", () => {
		expect(home("maste-gravida-fasta")).toBe("ramadan");
		expect(home("sa-ber-man-steg-for-steg")).toBe("tvagning");
		expect(home("eid-al-fitr-och-eid-al-adha")).toBe("ramadan");
	});

	it("gives no pillar to an answer three or more of them merely mention", () => {
		// vad-ar-sharia is a late spoke of five pillars. Any winner is arbitrary, and
		// the arbitrary winner used to be "Fördjupning: Abort" on the sharia page.
		expect(home("vad-ar-sharia")).toBeNull();
		expect(home("islams-syn-pa-kvinnan")).toBeNull();
	});

	it("gives no pillar to an answer that is only ever a late see-also", () => {
		expect(home("vad-ar-tawhid")).toBeNull();
		expect(home("vad-ar-sunna")).toBeNull();
		expect(home("islam-och-polyteism")).toBeNull();
		expect(home("sunni-och-shia")).toBeNull();
	});

	it("does not depend on the order the collection hands the pillars over", () => {
		const forward = pillarBySvar(PILLARS);
		const reversed = pillarBySvar([...PILLARS].reverse());
		expect(Object.fromEntries(reversed)).toEqual(Object.fromEntries(forward));
	});

	it("carries the term the answer page prints", () => {
		expect(pillarBySvar(PILLARS).get("vad-ar-hijab")).toEqual({ slug: "hijab", term: "Hijab" });
	});

	it("leaves answers no pillar names at all out of the map", () => {
		expect(home("vad-betyder-alhamdulillah")).toBeNull();
	});
});
