/**
 * Editorial pull-quotes for the homepage Citat module (§7.5 / §13.4) — the
 * essay's own voice, verbatim, one per ämne. Distinct from the 59k-quote
 * pipeline database, which does not feed the website. Adding a quote is one
 * line: text + the slug of the essay it comes from.
 */
export interface PullQuote {
	text: string;
	slug: string;
}

export const pullQuotes: PullQuote[] = [
	{
		slug: "lognens-bokforing",
		text: "Lögnen skickar ingen räkning omedelbart. Den fakturerar på kredit. Och den tar ränta.",
	},
	{
		slug: "tigerns-bon",
		text: "Berget kan inte falla. Därför kan det heller inte resa sig. Den som legat sömnlös och ändå reser sig till gryningsbönen vet vad det kostar.",
	},
	{
		slug: "ater-ni-var-for-sig",
		text: "Bekvämligheten förfinar smaken. Den förfinade smaken gör aptiten privat. Den privata aptiten löser de band som en gång höll gruppen samman.",
	},
	{
		slug: "tid-till-salu",
		text: "Att ta ränta innebär att tvinga spegeln att alstra eget ljus. Men speglar alstrar inte ljus. De kastar det tillbaka.",
	},
	{
		slug: "vikingarna-hade-inte-angest",
		text: "Ingen tvekan, ingen ångest. Han ser, väljer, handlar.",
	},
];
