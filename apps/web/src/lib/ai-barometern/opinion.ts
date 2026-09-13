// What Swedes answered when a reputable survey asked the same question, or nearly the same, as a
// statement the barometer puts to the models. It is shown beside the models' answers, never on
// their scale: a share of a population and one model's position are different quantities, and a
// survey's wording is almost never ours.
//
// Rules for an entry (opinion.test.ts holds the mechanical ones):
// - fieldwork 2022 or later, read from the survey's own report or, where the pollster published
//   none, from the commissioner's; never from a third party's summary;
// - `wording` is the survey's question as printed, and `shares` its categories;
// - `v` places each category on OUR statement's scale, so the bar wears the matrix's colours by
//   meaning: for »Offentliga koranbränningar bör vara förbjudna«, a survey answer »förbjudet« is
//   agreement. A plain yes/no answer counts as the full step; »ingen uppfattning« is null;
// - `match: "close"` whenever the wording differs from the statement, with a `note` saying how.
//
// Checked against the primary sources on 2026-09-13. Left out on purpose: the Verian/SVT figure
// on the age of criminal responsibility (only 83 % of its answers are published), SOM's nuclear
// power question (only merged shares are printed, 16 points unaccounted for) and MPF's Ukraine
// question (it asks about support in general, never about weapons).

export type PollValue = -2 | -1 | 0 | 1 | 2 | null;

export interface PollShare {
	readonly label: string;
	readonly percent: number;
	readonly v: PollValue;
}

export interface Poll {
	readonly questionIds: readonly string[];
	readonly pollster: string;
	/** As the report gives it: »15 september–30 december 2025«. */
	readonly fieldwork: string;
	readonly sample?: number;
	/** Who was asked: »16 år och äldre«. */
	readonly population?: string;
	readonly wording: string;
	/** The survey published its question in English only; `wording` is islam.se's translation. */
	readonly translated?: true;
	readonly shares: readonly PollShare[];
	readonly url: string;
	readonly match: "same" | "close";
	/** Required when `match` is "close": how the survey's question differs from the statement. */
	readonly note?: string;
}

const SOM = "SOM-institutet, Göteborgs universitet";
const SOM_2025 = "15 september–30 december 2025";
const SOM_2025_TABLES =
	"https://www.gu.se/sites/default/files/2026-06/Allm%C3%A4nhetens%20%C3%A5sikter%20om%20politiska%20f%C3%B6rslag%202025.pdf";
const SOM_AI = "https://www.gu.se/sites/default/files/2025-06/Svensk%20AI-opinion_0.pdf";

/** SOM's five-step proposal scale, most in favour first. */
const proposal = (shares: readonly number[], none?: number): PollShare[] => [
	...[
		"Mycket bra förslag",
		"Ganska bra förslag",
		"Varken bra eller dåligt förslag",
		"Ganska dåligt förslag",
		"Mycket dåligt förslag",
	].map((label, i) => ({ label, percent: shares[i] ?? 0, v: (2 - i) as PollValue })),
	...(none === undefined ? [] : [{ label: "Ingen uppfattning", percent: none, v: null }]),
];

/** Eurobarometer's agreement scale, in islam.se's translation. */
const agreement = (shares: readonly number[], dontKnow?: number): PollShare[] => [
	...["Instämmer helt", "Instämmer delvis", "Tar delvis avstånd", "Tar helt avstånd"].map(
		(label, i) => ({
			label,
			percent: shares[i] ?? 0,
			v: ([2, 1, -1, -2] as const)[i] ?? null,
		}),
	),
	...(dontKnow === undefined ? [] : [{ label: "Vet inte", percent: dontKnow, v: null }]),
];

export const POLLS: readonly Poll[] = [
	{
		questionIds: ["klimat-manniskan"],
		pollster: "Eurobarometer för Europeiska kommissionen",
		fieldwork: "18 februari–10 mars 2025",
		sample: 1020,
		wording:
			"I vilken utsträckning instämmer du i följande påstående om klimatförändringarna? Klimatförändringarna orsakas av mänsklig aktivitet.",
		translated: true,
		shares: agreement([73, 23, 3, 1]),
		url: "https://europa.eu/eurobarometer/surveys/detail/3472",
		match: "close",
		note: "Mätningen frågade om klimatförändringarna orsakas av mänsklig aktivitet, utan ordet »främst«.",
	},
	{
		questionIds: ["ai-hot-mot-manskligheten"],
		pollster: SOM,
		fieldwork: "16 september–30 december 2024",
		sample: 1608,
		population: "16 år och äldre",
		wording: "Vilken är din bedömning av följande påståenden? AI är ett hot mot mänskligheten.",
		shares: [
			{ label: "Helt riktigt", percent: 14, v: 2 },
			{ label: "Delvis riktigt", percent: 43, v: 1 },
			{ label: "Delvis felaktigt", percent: 30, v: -1 },
			{ label: "Helt felaktigt", percent: 13, v: -2 },
		],
		url: SOM_AI,
		match: "close",
		note: "Mätningen frågade om AI är ett hot mot mänskligheten, inte om AI kan komma att hota mänsklighetens överlevnad.",
	},
	{
		questionIds: ["pausa-ai"],
		pollster: SOM,
		fieldwork: "16 september–30 december 2024",
		sample: 1640,
		population: "16 år och äldre",
		wording: "Vilken är din åsikt om följande förslag? Pausa utvecklingen av AI.",
		shares: proposal([15, 18, 38, 19, 10]),
		url: SOM_AI,
		match: "close",
		note: "Mätningen frågade om att pausa utvecklingen av AI i allmänhet, inte bara de mest kraftfulla systemen tills de kan göras säkra.",
	},
	{
		questionIds: ["sociala-medier-barn"],
		pollster: "Novus för Internetstiftelsen",
		fieldwork: "30 april–7 maj 2026",
		sample: 1095,
		population: "internetanvändare 18–84 år",
		wording: "Vad tycker du om förslaget att förbjuda barn under 15 år att använda sociala medier?",
		shares: [
			{ label: "Ser främst fördelar med förslaget", percent: 53, v: 1 },
			{ label: "Kluven", percent: 35, v: 0 },
			{ label: "Ser främst nackdelar med förslaget", percent: 7, v: -1 },
			{ label: "Ingen åsikt", percent: 4, v: null },
		],
		url: "https://svenskarnaochinternet.se/rapporter/aldersgranser-pa-sociala-medier/vuxna-om-aldersgranser-pa-sociala-medier/",
		match: "close",
		note: "Mätningen frågade efter fördelar och nackdelar med ett förbud, inte om man är för eller emot det.",
	},
	{
		questionIds: ["minska-invandringen"],
		pollster: SOM,
		fieldwork: SOM_2025,
		sample: 10654,
		population: "16 år och äldre",
		wording: "Vilken är din åsikt om följande förslag? Ta emot färre flyktingar i Sverige.",
		shares: proposal([30, 24, 26, 13, 7]),
		url: SOM_2025_TABLES,
		match: "close",
		note: "Mätningen frågade om att ta emot färre flyktingar, inte om invandringen i stort.",
	},
	{
		questionIds: ["visitationszoner"],
		pollster: SOM,
		fieldwork: SOM_2025,
		sample: 1850,
		population: "16 år och äldre",
		wording:
			"Vilken är din åsikt om följande förslag? Öka antalet visitationszoner i brottsutsatta områden.",
		shares: proposal([30, 30, 24, 10, 6]),
		url: SOM_2025_TABLES,
		match: "close",
		note: "Mätningen frågade om att öka antalet visitationszoner i brottsutsatta områden.",
	},
	{
		questionIds: ["ansiktsigenkanning"],
		pollster: "Novus för Internetstiftelsen",
		fieldwork: "9–25 januari 2024",
		population: "internetanvändare 16 år och äldre",
		wording:
			"Vilket av följande påståenden stämmer bäst in på dig? Jag tycker att kameraövervakning med ansiktsigenkänning på offentlig plats ska vara tillåtet för att underlätta brottsbekämpning, eller förbjudet för att skydda medborgarnas personliga integritet.",
		shares: [
			{ label: "Tillåtet", percent: 70, v: 2 },
			{ label: "Förbjudet", percent: 19, v: -2 },
			{ label: "Kan ej ta ställning", percent: 10, v: null },
		],
		url: "https://svenskarnaochinternet.se/rapporter/svenskarna-och-internet-2024/overvakning-pa-natet/",
		match: "close",
		note: "Mätningen frågade om kameraövervakning med ansiktsigenkänning på offentlig plats i allmänhet, inte om polisens användning i realtid.",
	},
	{
		questionIds: ["koranbranning", "bibelbranning"],
		pollster: "Kantar Public för SVT",
		fieldwork: "juli 2023",
		sample: 1004,
		wording:
			"Tycker du att det skall vara förbjudet eller tillåtet att bränna olika religioners heliga böcker offentligt som koranen och bibeln?",
		shares: [
			{ label: "Förbjudet", percent: 53, v: 2 },
			{ label: "Tillåtet", percent: 34, v: -2 },
			{ label: "Tveksamma", percent: 13, v: null },
		],
		url: "https://www.svt.se/nyheter/inrikes/majoriteten-svenskar-vill-forbjuda-koranbranningar",
		match: "close",
		note: "Mätningen frågade om Koranen och Bibeln i en och samma fråga, så svaret gäller båda.",
	},
	{
		questionIds: ["gud-finns"],
		pollster: SOM,
		fieldwork: SOM_2025,
		population: "16 år och äldre",
		wording: "Tror du på Gud?",
		shares: [
			{ label: "Ja", percent: 36, v: 2 },
			{ label: "Nej", percent: 64, v: -2 },
		],
		url: "https://www.gu.se/sites/default/files/2026-03/Svenska%20trender%201986-2025.pdf",
		match: "close",
		note: "Mätningen frågade om den svarande själv tror på Gud. Andelarna gäller dem som svarade.",
	},
	{
		questionIds: ["aktiv-dodshjalp"],
		pollster: SOM,
		fieldwork: SOM_2025,
		sample: 1856,
		population: "16 år och äldre",
		wording:
			"Nedan följer ett antal förslag hämtade från den svenska samhällsdebatten. Vilken är din åsikt om vart och ett av dem? Tillåta aktiv dödshjälp.",
		shares: proposal([23, 35, 22, 6, 6], 8),
		url: SOM_2025_TABLES,
		match: "same",
	},
	{
		questionIds: ["samkonade-aktenskap"],
		pollster: "Eurobarometer för Europeiska kommissionen",
		fieldwork: "11 april–1 maj 2023",
		sample: 1019,
		population: "15 år och äldre",
		wording:
			"I vilken utsträckning instämmer du i följande påstående? Samkönade äktenskap bör vara tillåtna i hela Europa.",
		translated: true,
		shares: agreement([88, 6, 2, 3], 1),
		url: "https://europa.eu/eurobarometer/surveys/detail/2972",
		match: "close",
		note: "Mätningen frågade om hela Europa, inte om Sverige.",
	},
];

export function pollsFor(questionId: string): Poll[] {
	return POLLS.filter((poll) => poll.questionIds.includes(questionId));
}
