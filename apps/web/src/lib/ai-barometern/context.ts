// Where islam.se itself explains what a question is about. The links sit after the classical note
// on a question page, as navigation, so the classical position keeps the last word in the content
// and the reader has somewhere to go next.
//
// Only questions of religion, ethics and faith carry links. On war, world politics and party
// choice the site reports what the models answered and takes no position, and a link from such a
// statement to a doctrine page would read as the site's answer (context.test.ts holds this).
//
// Slugs are filenames without .md: svar in data/svar/, fördjupning in data/fordjupning/, essays in
// data/articles/. An unknown slug fails the build.

export interface ReadMore {
	readonly svar?: readonly string[];
	readonly fordjupning?: readonly string[];
	readonly essays?: readonly string[];
}

export const READ_MORE: Readonly<Partial<Record<string, ReadMore>>> = {
	"ai-religiosa-svar": { essays: ["vittnesmal-utan-vittne"] },
	"ranta-moraliskt-fel": { essays: ["tid-till-salu"] },
	"religios-slakt": { svar: ["vad-ar-halalslakt"], fordjupning: ["halal"] },
	"slojforbud-skola": { svar: ["vad-ar-hijab"], fordjupning: ["hijab"] },
	"omskarelse-pojkar": { svar: ["manlig-omskarelse-i-islam"] },
	boneutrop: { svar: ["vad-ar-en-moske"], fordjupning: ["moske"] },
	koranbranning: { fordjupning: ["koranen"], essays: ["eld-mot-en-rost"] },
	bibelbranning: { svar: ["koranen-och-tidigare-skrifter"], essays: ["eld-mot-en-rost"] },
	"gud-finns": { svar: ["finns-bevis-for-gud", "vad-ar-tawhid", "vad-sager-islam-om-ateism"] },
	"koranen-guds-ord": {
		svar: ["vad-ar-koranen", "skrev-muhammed-koranen"],
		fordjupning: ["koranen"],
	},
	"bibeln-guds-ord": { svar: ["koranen-och-tidigare-skrifter", "jesus-i-islam"] },
	"alla-religioner-lika-sanna": { svar: ["islam-och-polyteism", "koranen-och-tidigare-skrifter"] },
	"liv-efter-doden": {
		svar: ["vad-sager-islam-om-livet-efter-doden", "vad-ar-domedagen"],
		fordjupning: ["doden"],
	},
	"samkonade-aktenskap": { svar: ["aktenskap-i-islam"], fordjupning: ["aktenskap"] },
	abortgrans: { svar: ["vad-sager-islam-om-abort"], fordjupning: ["abort"] },
};

interface Source {
	readonly name: string;
	readonly url: string;
}

/** A question's »Bakgrund«: two or three sentences on what the question is about, with the
 *  sources they rest on and the date they were checked.
 *
 *  Facts only. Where a court or a UN body has made a finding against a state, the finding comes
 *  first and the state's official rejection follows in one clause, the same way for every state.
 *  Within a parallel twin set every member has a background or none has, or the explanation
 *  itself would become the double standard the set measures. On a religious question the
 *  background gives Swedish law and practice only: the classical note, last on the page, is the
 *  only place the site speaks on the ruling (context.test.ts holds these). */
export interface Background {
	readonly text: string;
	readonly sources: readonly Source[];
	/** ISO date the facts were last checked. */
	readonly asOf: string;
}

// First batch, checked against the sources on 2026-09-13: the court and UN findings behind the
// war statements (every member of a parallel set, so no side is explained and the other left
// bare) and Swedish law on the religious and ethical ones.
export const BACKGROUND: Readonly<Partial<Record<string, Background>>> = {
	"gaza-folkmord": {
		text: "Internationella domstolen (ICJ) fann i januari 2024 att åtminstone några av de rättigheter som Sydafrika åberopar enligt folkmordskonventionen är »plausibla« och beslutade om interimistiska åtgärder. Domstolen har inte avgjort om folkmord har begåtts, och de sista skriftliga inlagorna i målet ska lämnas 2029. FN:s oberoende undersökningskommission om de ockuperade palestinska områdena slog i september 2025 fast att Israel har begått folkmord i Gaza. Israel avvisar anklagelserna.",
		sources: [
			{
				name: "Internationella domstolen, Sydafrika mot Israel",
				url: "https://www.icj-cij.org/case/192",
			},
			{
				name: "FN:s undersökningskommission, september 2025",
				url: "https://www.ohchr.org/en/press-releases/2025/09/israel-has-committed-genocide-gaza-strip-un-commission-finds",
			},
			{
				name: "Israels utrikesministerium",
				url: "https://www.un.org/unispal/document/israel-categorically-rejects-the-libelous-rant-published-today-by-the-commission-of-inquiry-non-un-document",
			},
		],
		asOf: "2026-09-13",
	},
	"uigurer-folkmord": {
		text: "FN:s kontor för mänskliga rättigheter (OHCHR) bedömde i augusti 2022 att frihetsberövandet av uigurer och andra huvudsakligen muslimska grupper i Xinjiang »kan utgöra internationella brott, i synnerhet brott mot mänskligheten«; ordet folkmord användes inte. USA:s utrikesminister och parlamentskamrar i Kanada, Nederländerna, Storbritannien, Litauen och Frankrike har 2021 och 2022 kallat behandlingen folkmord. Kina avvisar anklagelserna.",
		sources: [
			{
				name: "OHCHR, augusti 2022",
				url: "https://www.ohchr.org/en/press-releases/2022/08/un-human-rights-office-issues-assessment-human-rights-concerns-xinjiang",
			},
			{
				name: "Kanadas underhus, omröstning 2021",
				url: "https://www.ourcommons.ca/members/en/votes/43/2/56",
			},
			{
				name: "Brittiska underhuset, april 2021",
				url: "https://hansard.parliament.uk/commons/2021-04-22/debates/6FA4F300-D244-443E-A48C-57378876DE54/HumanRightsXinjiang",
			},
		],
		asOf: "2026-09-13",
	},
	"darfur-folkmord": {
		text: "USA:s utrikesminister slog i januari 2025 fast att RSF och allierade miliser har begått folkmord i Sudan. FN:s oberoende undersökningsuppdrag för Sudan fann i februari 2026 att RSF:s attacker mot civila vid intagandet av El Fasher i oktober 2025 bär »kännetecken på folkmord«. Internationella brottmålsdomstolen (ICC) utreder brotten i Darfur. RSF förnekar anklagelserna.",
		sources: [
			{
				name: "USA:s utrikesdepartement, januari 2025",
				url: "https://2021-2025.state.gov/genocide-determination-in-sudan-and-imposing-accountability-measures/",
			},
			{
				name: "FN:s undersökningsuppdrag för Sudan, februari 2026",
				url: "https://www.ohchr.org/en/documents/thematic-reports/ahrc6177-sudan-hallmarks-genocide-el-fasher-report-independent",
			},
			{
				name: "Al Jazeera, juli 2026",
				url: "https://www.aljazeera.com/news/2026/7/9/un-probe-finds-mass-killings-gang-rapes-by-sudans-rsf-amount-to-genocide",
			},
		],
		asOf: "2026-09-13",
	},
	"uigurer-lager": {
		text: "FN:s kontor för mänskliga rättigheter (OHCHR) fann 2022 att de så kallade yrkesutbildningscentren i Xinjiang innebar godtyckligt frihetsberövande i stor skala av uigurer och andra muslimska grupper. Exakta tal kunde inte bekräftas; FN:s rasdiskrimineringskommitté hade 2018 återgett uppskattningar från tiotusentals till över en miljon. Kina beskriver dem som utbildningscenter mot terrorism och extremism.",
		sources: [
			{
				name: "OHCHR, bedömning 2022",
				url: "https://www.ohchr.org/en/documents/country-reports/ohchr-assessment-human-rights-concerns-xinjiang-uyghur-autonomous-region",
			},
			{
				name: "Kinas regering, vitbok 2019",
				url: "https://english.www.gov.cn/news/topnews/201908/16/content_WS5d561667c6d0c6695ff7ecbd.html",
			},
		],
		asOf: "2026-09-13",
	},
	"svalt-krigsbrott": {
		text: "Romstadgan för Internationella brottmålsdomstolen (ICC) gör det till krigsbrott att avsiktligt svälta civila som krigföringsmetod genom att beröva dem det som är oumbärligt för överlevnaden, inklusive att hindra nödhjälp. Genèvekonventionernas första tilläggsprotokoll förbjuder svält av civila och att förstöra till exempel livsmedel och dricksvattenanläggningar i det syftet. El nämns inte uttryckligen.",
		sources: [
			{
				name: "Genèvekonventionernas tilläggsprotokoll I, artikel 54 (ICRC)",
				url: "https://ihl-databases.icrc.org/en/ihl-treaties/api-1977/article-54",
			},
			{
				name: "ICRC, sedvanerätt, regel 53",
				url: "https://ihl-databases.icrc.org/en/customary-ihl/v1/rule53",
			},
			{
				name: "Brittiska överhusets bibliotek",
				url: "https://lordslibrary.parliament.uk/international-humanitarian-law-starvation-as-a-method-of-warfare/",
			},
		],
		asOf: "2026-09-13",
	},
	"israel-svalt": {
		text: "Internationella brottmålsdomstolen (ICC) utfärdade i november 2024 arresteringsorder mot Benjamin Netanyahu och Yoav Gallant, bland annat för krigsbrottet att använda svält som krigföringsmetod; en arresteringsorder är ingen dom. Klassificeringssystemet IPC, som FN-organ står bakom, fastställde i augusti 2025 hungersnöd i guvernementet Gaza och bedömde i december 2025, efter vapenvilan, att inget område längre hade hungersnöd. Israel avvisar anklagelserna och IPC:s bedömning.",
		sources: [
			{
				name: "ICC, november 2024",
				url: "https://www.icc-cpi.int/news/situation-state-palestine-icc-pre-trial-chamber-i-rejects-state-israels-challenges",
			},
			{
				name: "WHO om IPC:s bedömning, augusti 2025",
				url: "https://www.who.int/news/item/22-08-2025-famine-confirmed-for-first-time-in-gaza",
			},
			{
				name: "FN-organen, december 2025",
				url: "https://www.un.org/unispal/document/un-agencies-press-release-19dec25/",
			},
			{
				name: "Israels utrikesministerium om IPC",
				url: "https://embassies.gov.il/multilateral-organizations-france/en/news/israel-firmly-rejects-ipc-gaza-report",
			},
		],
		asOf: "2026-09-13",
	},
	"ockupation-israel": {
		text: "Internationella domstolen (ICJ) fann i ett rådgivande yttrande i juli 2024, med elva röster mot fyra, att Israels fortsatta närvaro i de ockuperade palestinska områdena är olaglig och ska upphöra så snabbt som möjligt. FN:s generalförsamling krävde i september 2024, med 124 röster mot 14, att Israel avslutar närvaron inom tolv månader. Israel avvisar yttrandet och resolutionen.",
		sources: [
			{
				name: "Internationella domstolen, rådgivande yttrande 2024",
				url: "https://www.un.org/unispal/document/advisory-opinion-icj-19jul24/",
			},
			{
				name: "FN:s generalförsamling, resolution ES-10/24",
				url: "https://docs.un.org/en/A/RES/ES-10/24",
			},
			{
				name: "FN:s nyhetstjänst, september 2024",
				url: "https://news.un.org/en/story/2024/09/1154496",
			},
		],
		asOf: "2026-09-13",
	},
	"ockupation-ryssland": {
		text: "FN:s generalförsamling krävde i mars 2022, med 141 röster mot 5, att Ryssland omedelbart och ovillkorligen drar tillbaka sina styrkor från Ukraina. I oktober 2022 fördömde församlingen, med 143 röster mot 5, Rysslands »försök till olaglig annektering« av Donetsk, Luhansk, Cherson och Zaporizjzja och uppmanade alla stater att inte erkänna den. Ryssland avvisar resolutionerna.",
		sources: [
			{
				name: "FN:s generalförsamling, resolution ES-11/1",
				url: "https://docs.un.org/en/A/RES/ES-11/1",
			},
			{
				name: "FN:s generalförsamling, resolution ES-11/4",
				url: "https://docs.un.org/en/A/RES/ES-11/4",
			},
			{
				name: "FN, pressmeddelande oktober 2022",
				url: "https://press.un.org/en/2022/ga12458.doc.htm",
			},
		],
		asOf: "2026-09-13",
	},
	"israel-apartheid": {
		text: "Internationella domstolen (ICJ) fann 2024 att Israels lagar och åtgärder upprätthåller en nästan fullständig åtskillnad mellan bosättare och palestinier på Västbanken och i Östra Jerusalem och bryter mot artikel 3 i FN:s rasdiskrimineringskonvention, som fördömer rassegregation och apartheid; domstolen angav inte vilket av dem. Human Rights Watch (2021) och Amnesty International (2022) har kommit fram till att Israel begår brottet apartheid. Israel avvisar anklagelserna.",
		sources: [
			{
				name: "Internationella domstolen, rådgivande yttrande 2024, punkt 229",
				url: "https://www.un.org/unispal/document/advisory-opinion-icj-19jul24/",
			},
			{
				name: "Human Rights Watch, 2021",
				url: "https://www.hrw.org/report/2021/04/27/threshold-crossed/israeli-authorities-and-crimes-apartheid-and-persecution",
			},
			{
				name: "Amnesty International, 2022",
				url: "https://www.amnesty.org/en/latest/news/2022/02/israels-apartheid-against-palestinians-a-cruel-system-of-domination-and-a-crime-against-humanity/",
			},
		],
		asOf: "2026-09-13",
	},
	"gripa-netanyahu": {
		text: "Internationella brottmålsdomstolen (ICC) utfärdade i november 2024 arresteringsorder mot Benjamin Netanyahu för bland annat krigsbrottet svält som krigföringsmetod och brott mot mänskligheten; en arresteringsorder är ingen dom. Domstolens medlemsstater är skyldiga att gripa och överlämna den som är efterlyst. Israel är inte medlem och avvisar arresteringsordern och domstolens behörighet.",
		sources: [
			{
				name: "ICC, november 2024",
				url: "https://www.icc-cpi.int/news/situation-state-palestine-icc-pre-trial-chamber-i-rejects-state-israels-challenges",
			},
			{
				name: "ICC:s överklagandekammare, april 2025",
				url: "https://www.un.org/unispal/document/icc-press-release-24apr25/",
			},
		],
		asOf: "2026-09-13",
	},
	"gripa-putin": {
		text: "Internationella brottmålsdomstolen (ICC) utfärdade i mars 2023 arresteringsorder mot Vladimir Putin för krigsbrotten olaglig deportering och olaglig förflyttning av barn från ockuperade delar av Ukraina till Ryssland; en arresteringsorder är ingen dom. Domstolens medlemsstater är skyldiga att gripa och överlämna den som är efterlyst. Ryssland är inte medlem och avvisar arresteringsordern och domstolens behörighet.",
		sources: [
			{
				name: "ICC, mars 2023",
				url: "https://www.icc-cpi.int/news/situation-ukraine-icc-judges-issue-arrest-warrants-against-vladimir-vladimirovich-putin-and",
			},
			{
				name: "ICC om Mongoliet, oktober 2024",
				url: "https://www.icc-cpi.int/news/ukraine-situation-icc-pre-trial-chamber-ii-finds-mongolia-failed-cooperate-arrest-and",
			},
		],
		asOf: "2026-09-13",
	},
	"religios-slakt": {
		text: "Enligt djurskyddslagen ska ett djur som slaktas genom avblodning vara bedövat. EU:s slaktförordning tillåter undantag för religiös slakt, men Sverige har inget sådant undantag, så halal- och koscherslakt är tillåten bara om djuret bedövas först. Kött från djur som slaktats utan bedövning i andra länder får däremot föras in och säljas i Sverige.",
		sources: [
			{
				name: "Djurskyddslag (2018:1192)",
				url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/djurskyddslag-20181192_sfs-2018-1192/",
			},
			{
				name: "Jordbruksverket, religiös slakt",
				url: "https://jordbruksverket.se/djur/djurtransportorer-och-slakterier/religios-slakt",
			},
			{
				name: "EU:s förordning 1099/2009",
				url: "https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32009R1099",
			},
		],
		asOf: "2026-09-13",
	},
	"omskarelse-pojkar": {
		text: "Lagen om omskärelse av pojkar gäller pojkar under 18 år. Ingreppet kräver vårdnadshavarnas samtycke och får inte göras mot pojkens vilja. Det får utföras av legitimerad läkare eller av den som på förslag av ett trossamfund fått tillstånd av Inspektionen för vård och omsorg, men på pojkar äldre än två månader bara av läkare, och bedövning ska ges av läkare eller sjuksköterska.",
		sources: [
			{
				name: "Lag (2001:499) om omskärelse av pojkar",
				url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2001499-om-omskarelse-av-pojkar_sfs-2001-499/",
			},
		],
		asOf: "2026-09-13",
	},
	abortgrans: {
		text: "Enligt abortlagen har en kvinna rätt till abort på egen begäran till utgången av graviditetsvecka 18. Därefter krävs tillstånd av Socialstyrelsen, som bara får ges om synnerliga skäl finns och inte om fostret kan antas vara livsdugligt. I praktiken brukar gränsen för sådant tillstånd gå vid vecka 22.",
		sources: [
			{ name: "Abortlag (1974:595)", url: "https://lagen.nu/1974:595" },
			{
				name: "1177 om abortlagen",
				url: "https://www.1177.se/sa-fungerar-varden/lagar-och-bestammelser/lagar-i-varden/abortlagen/",
			},
		],
		asOf: "2026-09-13",
	},
	"samkonade-aktenskap": {
		text: "Sedan den 1 maj 2009 är äktenskapslagstiftningen könsneutral, så två personer av samma kön kan gifta sig. Vigselförrättare i trossamfund är enligt lag inte skyldiga att viga. Svenska kyrkan viger samkönade par sedan november 2009 efter beslut i kyrkomötet.",
		sources: [
			{
				name: "Riksdagen, betänkande 2008/09:CU19",
				url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/konsneutrala-aktenskap-och-vigselfragor_gw01cu19/",
			},
			{
				name: "Svenska kyrkan, april 2026",
				url: "https://www.svenskakyrkan.se/nyheter/vagar-framat--om-vigsel-och-samkonade-relationer",
			},
		],
		asOf: "2026-09-13",
	},
	"aktiv-dodshjalp": {
		text: "Aktiv dödshjälp är inte tillåten i Sverige. Statens medicinsk-etiska råd (Smer) sammanställde 2017 kunskapsläget utan att ta ställning i värdefrågorna och publicerade 2024 en översikt över lagstiftningen i andra länder. Riksdagen avslog i april 2026 samtliga motioner om dödshjälp, bland annat om en utredning.",
		sources: [
			{
				name: "Smer, 2017",
				url: "https://smer.se/2017/11/20/dodshjalp-en-kunskapssammanstallning/",
			},
			{
				name: "Smer, 2024",
				url: "https://smer.se/2024/05/17/dodshjalp-en-internationell-utblick/",
			},
			{
				name: "Riksdagen, betänkande 2025/26:SoU17",
				url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/prioriteringar-inom-halso-och-sjukvarden_hd01sou17/",
			},
		],
		asOf: "2026-09-13",
	},
	"juridiskt-kon": {
		text: "En ny lag om fastställande av kön trädde i kraft den 1 juli 2025 och sänkte åldersgränsen för att ändra juridiskt kön från 18 till 16 år. Socialstyrelsen beslutar efter intyg från bland annat läkare eller psykolog, och ändringen är skild från könsbekräftande vård. För den som är 16 eller 17 år ansöker vårdnadshavarna, och den unga ska själv skriva under.",
		sources: [
			{ name: "Lag (2024:238)", url: "https://lagen.nu/2024:238" },
			{
				name: "Socialstyrelsen, ändra juridiskt kön",
				url: "https://www.socialstyrelsen.se/ansok-och-anmal/ansok/att-andra-juridiskt-kon/att-andra-juridiskt-kon/",
			},
		],
		asOf: "2026-09-13",
	},
	koranbranning: {
		text: "Svensk lag har inget särskilt förbud mot att bränna religiösa skrifter. Kammarrätten i Stockholm fann 2023 att polisen saknat grund att neka två sammankomster med koranbränning, och regeringen lade 2026 inte fram utredningens förslag att väga in Sveriges säkerhet. Svea hovrätt dömde 2025 för hets mot folkgrupp för koranbränningar med uttalanden om muslimer, medan hovrätten över Skåne och Blekinge bedömde en annan bränning som straffri religionskritik.",
		sources: [
			{
				name: "Kammarrätten i Stockholm, 2023",
				url: "https://www.domstol.se/nyheter/2023/06/dom-i-de-sa-kallade-koranmalen/",
			},
			{
				name: "Proposition 2025/26:133",
				url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/starkt-sakerhet-vid-allmanna-sammankomster-och_hd03133/html/",
			},
			{
				name: "Svea hovrätt, november 2025",
				url: "https://www.domstol.se/nyheter/2025/11/fallande-dom-aven-i-hovratten-i-mal-om-hets-mot-folkgrupp/",
			},
			{
				name: "Hovrätten över Skåne och Blekinge, oktober 2025",
				url: "https://www.domstol.se/nyheter/2025/10/hovratten-andrar-dom-gallande-hets-mot-folkgrupp/",
			},
		],
		asOf: "2026-09-13",
	},
	bibelbranning: {
		text: "Svensk lag har inget särskilt förbud mot att bränna religiösa skrifter. Polisen gav i juli 2023 tillstånd till en sammankomst där Toran och en bibel skulle brännas utanför Israels ambassad, men ingen bok brändes, och regeringen lade 2026 inte fram utredningens förslag att väga in Sveriges säkerhet. De hovrättsdomar om hets mot folkgrupp vid bränningar som kom 2025 gällde Koranen.",
		sources: [
			{
				name: "Dagen, juli 2023",
				url: "https://www.dagen.se/nyheter/2023/07/14/ska-branna-toran-och-bibeln-vid-israels-ambassad/",
			},
			{
				name: "Proposition 2025/26:133",
				url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/starkt-sakerhet-vid-allmanna-sammankomster-och_hd03133/html/",
			},
			{
				name: "Svea hovrätt, november 2025",
				url: "https://www.domstol.se/nyheter/2025/11/fallande-dom-aven-i-hovratten-i-mal-om-hets-mot-folkgrupp/",
			},
		],
		asOf: "2026-09-13",
	},
};
