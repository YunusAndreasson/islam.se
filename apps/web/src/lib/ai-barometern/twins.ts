// The twin sets: statements the barometer asks in parallel so a reader can see whether a model
// measures with one yardstick. questions.ts is the instrument (what is asked, verbatim); this file
// is the reading guide laid over it, so changing a set never touches a series.
//
// Two kinds:
// - `parallel`: the same wording about different countries, religions or companies. A model that
//   answers them unevenly shows a double standard.
// - `principle`: a general rule and one case of it. A model that agrees with the rule but will not
//   apply it to the case shows the same thing more quietly. The rule is always the first member.
//
// A member's `label` names it in the lines under the chart: »Claude – Netanyahu: avstår; Putin:
// instämmer helt«. `lookFor` is a question to the reader, never a statement: a sentence telling
// the reader what the answers mean would be the site taking the position the barometer only
// measures (twins.test.ts holds this). It states no facts either; those belong in a source-backed
// background, not in a reading guide.

type TwinKind = "parallel" | "principle";

export interface TwinMember {
	readonly id: string;
	readonly label: string;
}

export interface TwinSet {
	/** Anchor of the set's section on a question page: `jamfor-<key>`. */
	readonly key: string;
	readonly kind: TwinKind;
	readonly title: string;
	readonly lookFor: string;
	readonly members: readonly TwinMember[];
}

// The company sets follow the question ids' slugs; each question's own `aboutFamily` says whose
// maker it names, so the pages ring that model's answer.
const COMPANIES: readonly { slug: string; label: string }[] = [
	{ slug: "openai", label: "OpenAI" },
	{ slug: "anthropic", label: "Anthropic" },
	{ slug: "deepseek", label: "DeepSeek" },
	{ slug: "google", label: "Google" },
	{ slug: "xai", label: "xAI" },
];

const companies = (prefix: string): TwinMember[] =>
	COMPANIES.map((c) => ({ id: `${prefix}-${c.slug}`, label: c.label }));

export const TWIN_SETS: readonly TwinSet[] = [
	{
		key: "vinst-fore-sakerhet",
		kind: "parallel",
		title: "Vinst före säkerhet",
		lookFor: "Är modellerna mildare mot det företag som har gjort dem?",
		members: companies("vinst-fore-sakerhet"),
	},
	{
		key: "vinklade-modeller",
		kind: "parallel",
		title: "Politiskt vinklade modeller",
		lookFor: "Kallar modellerna andra företags modeller vinklade, men inte sina egna?",
		members: companies("vinklade-modeller"),
	},
	{
		key: "folkmord",
		kind: "parallel",
		title: "Folkmord i Gaza, Xinjiang och Darfur",
		lookFor: "Använder modellerna ordet folkmord på samma sätt, oavsett vem som anklagas?",
		members: [
			{ id: "gaza-folkmord", label: "Gaza" },
			{ id: "uigurer-folkmord", label: "Xinjiang" },
			{ id: "darfur-folkmord", label: "Darfur" },
		],
	},
	{
		key: "lagren-i-xinjiang",
		kind: "principle",
		title: "Lägren i Xinjiang och ordet folkmord",
		lookFor: "Kallar modellerna det folkmord när de själva bekräftar lägren?",
		members: [
			{ id: "uigurer-lager", label: "lägren" },
			{ id: "uigurer-folkmord", label: "folkmord" },
		],
	},
	{
		key: "svalt-som-vapen",
		kind: "principle",
		title: "Principen om svält och kriget i Gaza",
		lookFor: "Tillämpar modellerna den princip de instämmer i när det gäller Israel i Gaza?",
		members: [
			{ id: "svalt-krigsbrott", label: "principen" },
			{ id: "israel-svalt", label: "Israel i Gaza" },
		],
	},
	{
		key: "sjalvforsvar-och-gaza",
		kind: "principle",
		title: "Rätten till självförsvar och kriget i Gaza",
		lookFor:
			"Bedömer modellerna krigföringen i Gaza på samma sätt som Israels rätt att försvara sig?",
		members: [
			{ id: "sjalvforsvar-israeler", label: "rätten att försvara sig" },
			{ id: "israel-sjalvforsvar", label: "kriget i Gaza" },
		],
	},
	{
		key: "sjalvforsvar",
		kind: "parallel",
		title: "Rätten att försvara sig",
		lookFor: "Ger modellerna israeler, palestinier och ukrainare samma rätt att försvara sig?",
		members: [
			{ id: "sjalvforsvar-israeler", label: "israelerna" },
			{ id: "sjalvforsvar-palestinier", label: "palestinierna" },
			{ id: "sjalvforsvar-ukrainare", label: "ukrainarna" },
		],
	},
	{
		key: "vapnat-motstand",
		kind: "parallel",
		title: "Väpnat motstånd mot ockupation",
		lookFor: "Får palestinierna samma rätt som ukrainarna till motstånd riktat mot militära mål?",
		members: [
			{ id: "motstand-palestinier", label: "palestinierna" },
			{ id: "motstand-ukrainare", label: "ukrainarna" },
		],
	},
	{
		key: "attacker-mot-soldater",
		kind: "parallel",
		title: "Attacker mot soldater på ockuperad mark",
		lookFor:
			"Kallas samma slags attack terrorism när palestinier utför den, men inte när ukrainare gör det?",
		members: [
			{ id: "terrorism-palestinier", label: "palestinier" },
			{ id: "terrorism-ukrainare", label: "ukrainare" },
		],
	},
	{
		key: "ockupation",
		kind: "parallel",
		title: "Ockupation och folkrätt",
		lookFor: "Prövas Israels och Rysslands ockupationer mot samma folkrätt?",
		members: [
			{ id: "ockupation-israel", label: "Israel" },
			{ id: "ockupation-ryssland", label: "Ryssland" },
		],
	},
	{
		key: "ratten-att-atervanda",
		kind: "parallel",
		title: "Flyktingars rätt att återvända",
		lookFor: "Har palestinska och ukrainska flyktingar samma rätt att återvända?",
		members: [
			{ id: "atervandande-palestinier", label: "palestinska flyktingar" },
			{ id: "atervandande-ukrainare", label: "ukrainska flyktingar" },
		],
	},
	{
		key: "vapen-pa-vastbanken",
		kind: "parallel",
		title: "Vapen på Västbanken",
		lookFor: "Får palestinier och bosättare samma rätt att bära vapen till skydd mot varandra?",
		members: [
			{ id: "vapen-palestinier-vastbanken", label: "palestinier" },
			{ id: "vapen-bosattare", label: "bosättare" },
		],
	},
	{
		key: "gripande-enligt-icc",
		kind: "parallel",
		title: "Gripande enligt ICC",
		lookFor: "Behandlas Netanyahu och Putin lika?",
		members: [
			{ id: "gripa-netanyahu", label: "Netanyahu" },
			{ id: "gripa-putin", label: "Putin" },
		],
	},
	{
		key: "sanktioner",
		kind: "parallel",
		title: "EU-sanktioner",
		lookFor: "Svarar modellerna likadant om sanktioner mot Israel och mot Ryssland?",
		members: [
			{ id: "sanktioner-israel", label: "Israel" },
			{ id: "sanktioner-ryssland", label: "Ryssland" },
		],
	},
	{
		key: "branning-av-skrifter",
		kind: "parallel",
		title: "Bränning av heliga skrifter",
		lookFor: "Skyddas Koranen och Bibeln lika?",
		members: [
			{ id: "koranbranning", label: "Koranen" },
			{ id: "bibelbranning", label: "Bibeln" },
		],
	},
	{
		key: "hat-mot-muslimer-och-judar",
		kind: "parallel",
		title: "Fientlighet mot muslimer och judar",
		lookFor: "Tas fientlighet mot muslimer lika allvarligt som fientlighet mot judar?",
		members: [
			{ id: "muslimfientlighet", label: "muslimfientlighet" },
			{ id: "antisemitism", label: "antisemitism" },
		],
	},
	{
		key: "guds-ord",
		kind: "parallel",
		title: "Heliga skrifter som Guds ord",
		lookFor: "Svarar modellerna likadant om Koranen och Bibeln?",
		members: [
			{ id: "koranen-guds-ord", label: "Koranen" },
			{ id: "bibeln-guds-ord", label: "Bibeln" },
		],
	},
];

/** The sets a question belongs to, parallel sets first. A question can sit in two
 *  (sjalvforsvar-israeler is both a twin and the rule of a principle set). */
export function twinSetsOf(questionId: string): TwinSet[] {
	return TWIN_SETS.filter((set) => set.members.some((m) => m.id === questionId)).sort(
		(a, b) => Number(a.kind === "principle") - Number(b.kind === "principle"),
	);
}
