import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sitemap, { ChangeFreqEnum } from "@astrojs/sitemap";
import type { AstroUserConfig } from "astro";
import { defineConfig, fontProviders } from "astro/config";
import remarkSmartypants from "remark-smartypants";
import { BONETIDER_DATA_DATE } from "./src/lib/bonetider/meta";
import { rehypeHonorific } from "./src/plugins/rehype-honorific";
import { rehypeQuranVerse } from "./src/plugins/rehype-quran-verse";
import { remarkAbbr } from "./src/plugins/remark-abbr";

// remark-smartypants resolves its own `unified` version, whose Plugin type does not
// nominally match Astro's bundled RemarkPlugin (they are identical at runtime). This
// alias lets us cast the plugin list to the type Astro's markdown config expects.
type RemarkPlugins = NonNullable<NonNullable<AstroUserConfig["markdown"]>["remarkPlugins"]>;

const articlesDir = fileURLToPath(new URL("../../data/articles", import.meta.url));
const articleDates: Record<string, string> = {};
try {
	for (const file of readdirSync(articlesDir).filter((f) => f.endsWith(".md"))) {
		const content = readFileSync(join(articlesDir, file), "utf-8");
		const match = content.match(/publishedAt:\s*"([^"]+)"/);
		if (match) {
			articleDates[file.replace(/\.md$/, "")] = match[1];
		}
	}
} catch {
	// articles dir may not exist during first build
}

// Old WordPress URLs with no counterpart on the new site — 301'd to the homepage to
// preserve SEO on the same domain. Emitted as a Cloudflare Pages `_redirects` file
// (true edge 301s) by the integration below, and excluded from the sitemap. Pages
// that DO have real content on the new site are deliberately not listed here.
const oldPaths = [
	// Posts (islam/)
	"/islam/liknelsen-for-den-fastande-ar-en-man-som-bar-pa-en-sack-mysk",
	"/islam/jag-har-delat-bonen-mellan-mig-och-min-tjanare",
	"/islam/en-grundlaggande-forklaring-av-koranens-forsta-kapitel-al-fatihah",
	"/islam/sara-varfor-jag-bar-sloja",
	"/islam/jenny-jag-angrar-inte-min-sjal",
	"/islam/rabia-vad-jag-tycker-om-min-sjal",
	"/islam/johara-att-bara-sloja-under-en-dag",
	"/islam/annica-folk-visar-mig-mer-respekt",
	"/islam/ahmad-ibn-hanbal",
	"/islam/ibn-taymiyyah",
	"/islam/muhammad-ibn-ismail-al-bukhari",
	"/islam/ramadan",
	"/islam/ingen-gud-utom-gud",
	"/islam/guds-attribut",
	"/islam/slojan-i-koranen",
	"/islam/tafsir",
	"/islam/fastans-inre-hemligheter",
	"/islam/fasta-under-graviditeten",
	"/islam/ingen-finns-som-kan-liknas-vid-honom",
	"/islam/dawah",
	"/islam/islams-troslara",
	"/islam/tron-pa-gud",
	"/islam/tron-pa-skrifterna",
	"/islam/tron-pa-sandebuden",
	"/islam/tron-pa-den-yttersta-dagen",
	"/islam/islams-behorighetskrav",
	"/islam/ar-islam-fatalistiskt",
	"/islam/ar-det-sant-att-muhammad-ma-guds-frid-och-valsignelser-vara-over-honom-skrev-koranen",
	"/islam/hur-skiljer-sig-koranen-fran-de-andra-skrifterna",
	"/islam/motsager-islam-vetenskap",
	"/islam/koranen-namner-att-manniskan-skapats-fran-jordstoff-men-den-namner-ocksa-att-hon-skapats-av-sadesvatska-ar-inte-detta-motsagelsefullt",
	"/islam/varfor-alagger-islam-sa-stranga-straff-for-utomaktenskapliga-forbindelser",
	"/islam/ar-islam-en-militant-religion",
	"/islam/koranen-sager-att-muslimer-skall-drapa-de-som-inte-tror-varhelst-de-finner-dem-betyder-detta-att-islam-stodjer-vald-och-blodspillan",
	"/islam/alla-religioner-lar-i-grund-och-botten-dess-anhangare-att-vara-goda-sa-varfor-skall-man-folja-just-islam",
	"/islam/ahlus-sunnah",
	"/islam/se-i-paradiset",
	"/islam/muslimer-svaga",
	"/islam/jan-malmsjo-talar-om-islam",
	"/islam/tron-pa-skrifterna-som-gud-sant-ned",
	"/islam/tron-pa-guds-anglar",
	"/islam/guds-profeter",
	"/islam/ateruppstandelsens-dag",
	"/islam/tron-pa-det-forutbestamda",
	"/islam/en-kar-mormor",
	"/islam/allah-eller-gud",
	"/islam/foraldrar",
	"/islam/kazakstans-matkultur",
	"/islam/afghanistans-matkultur",
	"/islam/malaysias-matkultur",
	"/islam/indonesiens-matkultur",
	"/islam/barns-rattigheter",
	"/islam/existensialism",
	"/islam/karma",
	"/islam/hinduismens-kastsystem",
	"/islam/hinduismens-manga-gudar",
	"/islam/antropomorfism",
	"/islam/religionernas-olika-namn",
	"/islam/ett-liv-utan-religion",
	"/islam/sjalens-existens-2",
	"/islam/balans-mellan-yttre-och-inre-valbefinnande",
	// Posts (featured/)
	"/featured/celler-och-stjarnor",
	"/featured/planeterna-i-solsystemet",
	"/featured/mangudemyten",
	"/featured/personlig-utveckling",
	"/featured/somnbrist",
	"/featured/meningen-med-livet",
	"/featured/en-gang-kom-en-okenbo-till-profeten-fred-vare-med-honom",
	"/featured/en-levande-planet-2",
	"/featured/fastans-historiska-anknytning",
	"/featured/omsesidig-karlek",
	// Posts (uncategorized/)
	"/uncategorized/terrorism",
	"/uncategorized/skapad-av-sadesvatska",
	"/uncategorized/vad-kvinnans-skote-doljer",
	"/uncategorized/religionens-ursprung",
	"/uncategorized/avgora-barnets-kon",
	"/uncategorized/orsak-och-verkan-varden",
	"/uncategorized/sitemap",
	"/uncategorized/bonetider",
	"/uncategorized/forsta-skyldigheten-som-aligger-manniskan",
	"/uncategorized/evolutio",
	"/uncategorized/forberedelser-infor-bonen-2",
	"/uncategorized/sa-blir-du-muslim-2",
	"/uncategorized/naderik-eller-bestraffande",
	// Posts (utvalda/)
	"/utvalda/fakta-om-islam",
	// Posts (other prefixes)
	"/tro/gud",
	"/tro/sandebuden-och-skrifterna",
	"/tro/sjalens-existens",
	"/tro/anglarna",
	"/tro/livet-efter-doden",
	"/tro/en-medelvag-mellan-tro-och-handling",
	"/tro/profeten-muhammed",
	"/tro/domedagen",
	"/tro/odet",
	"/tro/koranen",
	"/tro/forklaring-av-trosbekannelserna",
	"/kost/omskarelse",
	"/kost/amning",
	"/kost/rokning",
	"/kost/traning",
	"/kost/muslimsk-matkultur-i-historien",
	"/kost/medicinska-anledningar-for-alkoholforbud",
	"/kost/utbrandhet",
	"/kost/inre-och-yttre-valbefinnande",
	"/kost/partnerskapet-mellan-kropp-och-sjal",
	"/kost/mediciner",
	"/kost/vinager",
	"/gud/kunskap-om-guds-namn-och-attribut",
	"/gud/kalla-gud-for-han",
	"/gud/guds-harstamning",
	"/gud/verklig-kunskap-om-gud",
	"/gud/hur-manga-skapare-finns-det",
	"/gud/gud-skapar-men-manniskan-omvandlar",
	"/gud/gud-ar-skild-fran-skapelsen",
	"/gud/kan-gud-fa-en-son",
	"/gud/en-existens-tyder-pa-att-det-ocksa-finns-en-skapare",
	"/gud/gud-beskriver-sig-sjalv",
	"/gud/en-personlig-eller-icke-personlig-gud",
	"/gud/intellektets-begransningar",
	"/gud/big-bang",
	"/gud/argument-for-guds-existens",
	"/gud/allsmaktighetsparadoxen",
	"/gud/treenigheten",
	"/gud/anledning-till-att-vi-dyrkar-allah",
	"/gud/monoteism",
	"/gud/guds-namn",
	"/jihad/islam-spreds-inte-med-svardet",
	"/jihad/manniskors-lika-varde",
	"/jihad/misstolkade-koranverser",
	"/jihad/tvang-skall-inte-forekomma",
	"/jihad/samexistens-och-tolerans",
	"/jihad/mer-an-ett-heligt-krig",
	"/jihad/en-avslappnad-installning",
	"/jihad/jihad",
	"/jihad/attacker-mot-civila-under-jihad",
	"/jihad/extremism",
	"/jihad/terrorism-2",
	"/kvinna/abort",
	"/kvinna/kvinnlig-omskarelse-konsstympning",
	"/kvinna/modern-har-tre-rattigheter",
	"/kvinna/graviditet-ar-inte-ett-bevis",
	"/kvinna/kvinnans-mindre-arv",
	"/kvinna/kan-kvinnan-ha-flera-man",
	"/kvinna/kvinnofortryck",
	"/kvinna/vad-onskar-den-muslimska-kvinnan",
	"/kvinna/hedersrelaterat-vald",
	"/kvinna/temporara-aktenskap",
	"/kvinna/polygami-polygyni-polyandri",
	"/kvinna/hedersmord",
	"/kvinna/slojan",
	"/kvinna/kvinnosyn",
	"/kvinna/jamstalldhet",
	"/kvinna/fyra-vittnen-till-en-valdtakt",
	"/kvinna/tvangsaktenskap",
	"/kvinna/frun-foder-en-dotter",
	"/historia/ett-vetenskapligt-synsatt",
	"/historia/uthmans-kalifat",
	"/historia/uppenbarelsens-borjan",
	"/historia/rasism-och-fordomar-i-historien",
	"/historia/islamisk-ekonomi",
	"/historia/symboler",
	"/historia/emigrationen-till-medina",
	"/historia/erovringen-av-mecka",
	"/historia/abu-bakrs-och-umars-kalifat",
	"/historia/indien-malaysia-indonesien",
	"/historia/det-muslimska-arvet-i-spanien",
	"/historia/vetenskap-i-den-islamiska-varlden-under-medeltiden",
	"/historia/kultur-som-undervarderar-vetenskap",
	"/historia/den-islamiska-varlden-bilder",
	"/religion/filosofernas-gudssyn",
	"/religion/spadomar-och-horoskop",
	"/religion/religionen-i-historien",
	"/religion/kriterier-for-en-sann-religion",
	"/religion/en-kategorisering-av-varldsreligionerna",
	"/religion/alla-religioner-sager-sig-vara-den-ratta",
	"/religion/deism-och-sekularism",
	"/religion/mysticism",
	"/religion/anledningar-till-att-religionen-avvisats",
	"/religion/i-sjalen-medfott",
	"/religion/behovet-av-religion",
	"/religion/ateism",
	"/religion/vagarna-till-sann-religion",
	"/religion/sufism",
	"/religion/shia",
	"/religion/jesus",
	"/religion/vidskepelse",
	"/religion/overallt-och-alltid-for-alla",
	"/religion/pandoras-ask",
	"/religion/agnosticism",
	"/religion/skillnader-mellan-religion-och-vetenskap",
	"/religion/kristendomens-gudssyn",
	"/religion/judendomens-gudssyn",
	"/religion/islams-gudssyn",
	"/religion/de-flesta-har-trott-pa-gud",
	"/existens/universums-ursprung",
	"/existens/hur-manniskan-skapar",
	"/existens/en-levande-planet",
	"/existens/manniskans-plats-i-universum",
	"/existens/syftet-med-skapelsen-av-manniskoslaktet",
	"/existens/konstverket-ar-inte-konstnaren",
	"/pelare/dyrkan",
	"/pelare/sharia",
	"/pelare/sunna",
	"/pelare/mosken",
	"/pelare/allmosan",
	"/pelare/vallfarden",
	"/pelare/ramadan-2",
	"/guider/sa-blir-du-muslim",
	"/guider/forberedelser-infor-bonen",
	"/guider/lar-dig-be",
	"/guider",
	// Pages
	"/vetenskap",
	"/historia",
	"/trosartiklar",
	"/universum",
	"/livsaskadning",
	"/gudssyn",
	"/islam-i-praktik/konvertera",
	"/islam-i-praktik",
	"/islam-i-praktik/ghusl",
	"/islam-i-praktik/video-tvagningen",
	"/islam-i-praktik/video-bonen",
	"/islam-i-praktik/odmjukhet-under-bonen",
	"/halsa",
	"/arbete",
	"/arbete/salja-varor-till-olika-priser",
	"/arbete/arbete-och-valstand",
	"/arbete/strejker",
	"/vetenskap/att-soka-den-absoluta-sanningen-i-vetenskap",
	"/vetenskap/embryologi",
	"/portfolio",
	"/andra-religioners-syn-pa-gud",
	"/livsaskadning/genomgang",
	"/om/forslag",
	"/om/rattigheter",
	"/om/kontakt",
	"/om/om-islam-se",
	"/om/integritet",
	// Categories
	"/category/polare-1a",
	"/category/existens",
	"/category/featured",
	"/category/gud",
	"/category/guider",
	"/category/historia",
	"/category/jihad",
	"/category/kost",
	"/category/kvinna",
	"/category/nytt",
	"/category/islam",
	"/category/polare",
	"/category/religion",
	"/category/tro",
	"/category/uncategorized",
	"/category/utvalda",
	"/category/faq",
	"/category/xslider",
	// Tags
	"/tag/faste-tider",
	"/tag/fastetider",
	"/tag/ramadankalender",
	"/tag/ramdan-tidtabell",
	// Authors
	"/author/dr-abdullah-s-ash-shehri",
	"/author/muhammad-bin-salih-al-uthaymin",
	"/author/admin",
	"/author/knut",
];

// Legacy URLs that map to a *specific* new page instead of the homepage — funnels their
// existing search equity to the most relevant destination. The old WordPress prayer-time
// tag pages still earn impressions (Search Console, 2026-06), so point them at the
// bönetider hub rather than wasting that signal on a homepage 301. (Both slash forms are
// emitted by the redirect hook below, so list each path once.)
const customRedirects: [string, string][] = [
	["/tag/bonetider", "/bonetider/"],
	["/tag/bonetid", "/bonetider/"],
	// Dead WordPress reference URLs that still rank → the new /svar/ pages that
	// actually answer the query (a relevant 301 transfers the ranking; a homepage
	// 301 would be a soft-404 and lose it). See content.config.ts `svar`.
	["/kost/griskott", "/svar/varfor-ater-muslimer-inte-griskott/"],
	["/kost/halalslakt", "/svar/vad-ar-halalslakt/"],
	["/historia/kaba", "/svar/vad-ar-kaba/"],
	["/pelare/trosbekannelsen", "/svar/trosbekannelsen-shahada/"],
	["/pelare/hogtider", "/svar/eid-al-fitr-och-eid-al-adha/"],
	["/pelare/bonen", "/svar/sa-ber-man-steg-for-steg/"],
	["/islam-i-praktik/boneguide", "/svar/sa-ber-man-steg-for-steg/"],
	["/islam-i-praktik/nar-tvagning-kravs", "/svar/tvagning-wudu/"],
	["/islam-i-praktik/tvagningen", "/svar/tvagning-wudu/"],
	// === 2026-06-20 answer-page batch (GSC-ranked soft-404 recovery) ===
	// nar-ghusl-kravs had NO redirect at all — a hard 404 and the single biggest
	// leak (≈17.5k impressions / 1035 clicks over 90d, Search Console).
	["/islam-i-praktik/nar-ghusl-kravs", "/svar/vad-ar-ghusl/"],
	["/islam-i-praktik/ghusl", "/svar/vad-ar-ghusl/"],
	["/kvinna/slojan", "/svar/vad-ar-hijab/"],
	["/islam/slojan-i-koranen", "/svar/vad-ar-hijab/"],
	["/kvinna/abort", "/svar/vad-sager-islam-om-abort/"],
	["/historia/symboler", "/svar/islams-symboler/"],
	["/religion/shia", "/svar/sunni-och-shia/"],
	["/gud/kunskap-om-guds-namn-och-attribut", "/svar/vad-ar-tawhid/"],
	["/gud/guds-namn", "/svar/vad-ar-tawhid/"],
	["/guider/sa-blir-du-muslim", "/svar/hur-blir-man-muslim/"],
	["/religion/sufism", "/svar/vad-ar-sufism/"],
	["/kost/rokning", "/svar/far-muslimer-roka/"],
	["/kost/medicinska-anledningar-for-alkoholforbud", "/svar/far-muslimer-dricka-alkohol/"],
	["/kvinna/polygami-polygyni-polyandri", "/svar/far-muslimska-man-ha-flera-fruar/"],
	["/kvinna/kvinnosyn", "/svar/islams-syn-pa-kvinnan/"],
	["/kvinna/jamstalldhet", "/svar/islams-syn-pa-kvinnan/"],
	["/pelare/mosken", "/svar/vad-ar-en-moske/"],
	["/pelare/allmosan", "/svar/vad-ar-zakat/"],
	["/pelare/ramadan-2", "/svar/vad-ar-ramadan/"],
	["/jihad/jihad", "/svar/vad-ar-jihad/"],
	["/jihad/misstolkade-koranverser", "/svar/vad-ar-jihad/"],
	["/tro/profeten-muhammed", "/svar/vem-var-profeten-muhammed/"],
	["/tro/koranen", "/svar/vad-ar-koranen/"],
	["/kvinna/hedersmord", "/svar/vad-sager-islam-om-hedersmord/"],
	// Earlier-session pages (sunna/sharia/hajj), previously unwired:
	["/pelare/sunna", "/svar/vad-ar-sunna/"],
	["/pelare/sharia", "/svar/vad-ar-sharia/"],
	["/pelare/vallfarden", "/svar/vad-ar-hajj/"],
	// === 2026-06-20 batch 2 (GSC 180-day tail: more uncovered soft-404s) ===
	["/tro/livet-efter-doden", "/svar/vad-sager-islam-om-livet-efter-doden/"],
	["/tro/odet", "/svar/vad-ar-odet-qadar/"],
	["/islam/tron-pa-guds-anglar", "/svar/tror-muslimer-pa-anglar/"],
	["/tro/anglarna", "/svar/tror-muslimer-pa-anglar/"],
	["/tro/domedagen", "/svar/vad-ar-domedagen/"],
	["/islam/ateruppstandelsens-dag", "/svar/vad-ar-domedagen/"],
	["/religion/jesus", "/svar/jesus-i-islam/"],
	["/religion/islams-gudssyn", "/svar/islams-gudssyn/"],
	["/islam/ar-det-sant-att-muhammad-ma-guds-frid-och-valsignelser-vara-over-honom-skrev-koranen", "/svar/skrev-muhammed-koranen/"],
	["/kvinna/kvinnlig-omskarelse-konsstympning", "/svar/vad-sager-islam-om-kvinnlig-omskarelse/"],
	["/gud/big-bang", "/svar/islam-och-big-bang/"],
	["/islam/fasta-under-graviditeten", "/svar/maste-gravida-fasta/"],
	["/tro/en-medelvag-mellan-tro-och-handling", "/svar/tro-och-handling-i-islam/"],
	["/historia/det-muslimska-arvet-i-spanien", "/svar/det-muslimska-spanien-al-andalus/"],
	["/historia/emigrationen-till-medina", "/svar/vad-var-hijra/"],
	["/historia/abu-bakrs-och-umars-kalifat", "/svar/de-rattledda-kaliferna/"],
	["/islam/en-grundlaggande-forklaring-av-koranens-forsta-kapitel-al-fatihah", "/svar/vad-betyder-al-fatiha/"],
	["/kost/vinager", "/svar/ar-vinager-halal/"],
	["/kost/omskarelse", "/svar/manlig-omskarelse-i-islam/"],
	["/vetenskap/embryologi", "/svar/koranen-och-embryologi/"],
	// Free redirect wins: legacy URLs that map to pages we already built
	["/islam/ramadan", "/svar/vad-ar-ramadan/"],
	["/jihad/mer-an-ett-heligt-krig", "/svar/vad-ar-jihad/"],
	["/jihad/tvang-skall-inte-forekomma", "/svar/vad-ar-jihad/"],
	["/uncategorized/sa-blir-du-muslim-2", "/svar/hur-blir-man-muslim/"],
	["/guider/lar-dig-be", "/svar/sa-ber-man-steg-for-steg/"],
	["/gud/monoteism", "/svar/vad-ar-tawhid/"],
	// === 2026-06-20 free redirects: legacy URLs answered by an existing /svar/ page ===
	["/gud/guds-harstamning", "/svar/islams-gudssyn/"],
	["/gud/kalla-gud-for-han", "/svar/islams-gudssyn/"],
	["/gud/gud-beskriver-sig-sjalv", "/svar/islams-gudssyn/"],
	["/gud/en-existens-tyder-pa-att-det-ocksa-finns-en-skapare", "/svar/islams-gudssyn/"],
	["/gud/kan-gud-fa-en-son", "/svar/jesus-i-islam/"],
	["/kvinna/kvinnans-mindre-arv", "/svar/islams-syn-pa-kvinnan/"],
	["/kvinna/kvinnofortryck", "/svar/islams-syn-pa-kvinnan/"],
	["/kvinna/vad-onskar-den-muslimska-kvinnan", "/svar/islams-syn-pa-kvinnan/"],
	["/kvinna/temporara-aktenskap", "/svar/aktenskap-i-islam/"],
	["/islam/koranen-sager-att-muslimer-skall-drapa-de-som-inte-tror-varhelst-de-finner-dem-betyder-detta-att-islam-stodjer-vald-och-blodspillan", "/svar/vad-ar-jihad/"],
	["/jihad/manniskors-lika-varde", "/svar/vad-ar-jihad/"],
	["/jihad/islam-spreds-inte-med-svardet", "/svar/vad-ar-jihad/"],
	["/category/jihad", "/svar/vad-ar-jihad/"],
	["/existens/universums-ursprung", "/svar/islam-och-big-bang/"],
	["/islam/tron-pa-det-forutbestamda", "/svar/vad-ar-odet-qadar/"],
	["/tro/sjalens-existens", "/svar/vad-sager-islam-om-livet-efter-doden/"],
	["/islam-i-praktik/video-bonen", "/svar/sa-ber-man-steg-for-steg/"],
	["/om/om-islam-se", "/om/"],
	["/uncategorized/bonetider", "/bonetider/"],
	// --- second wave (sub-150i tail + /category/ archives that map to a live page) ---
	["/islam/tron-pa-gud", "/svar/islams-gudssyn/"],
	["/gud/gud-ar-skild-fran-skapelsen", "/svar/islams-gudssyn/"],
	["/gud/en-personlig-eller-icke-personlig-gud", "/svar/islams-gudssyn/"],
	["/gud/treenigheten", "/svar/jesus-i-islam/"],
	["/category/gud", "/svar/islams-gudssyn/"],
	["/islam/tron-pa-den-yttersta-dagen", "/svar/vad-ar-domedagen/"],
	["/islam/se-i-paradiset", "/svar/vad-sager-islam-om-livet-efter-doden/"],
	["/islam/tron-pa-sandebuden", "/svar/vem-var-profeten-muhammed/"],
	["/tro/forklaring-av-trosbekannelserna", "/svar/trosbekannelsen-shahada/"],
	["/islam/tafsir", "/svar/vad-ar-koranen/"],
	["/category/kvinna", "/svar/islams-syn-pa-kvinnan/"],
	["/kvinna/frun-foder-en-dotter", "/svar/islams-syn-pa-kvinnan/"],
	["/kvinna/tvangsaktenskap", "/svar/aktenskap-i-islam/"],
	["/kvinna/kan-kvinnan-ha-flera-man", "/svar/far-muslimska-man-ha-flera-fruar/"],
	["/guider/forberedelser-infor-bonen", "/svar/sa-ber-man-steg-for-steg/"],
	["/islam-i-praktik/odmjukhet-under-bonen", "/svar/sa-ber-man-steg-for-steg/"],
	["/islam-i-praktik", "/svar/sa-ber-man-steg-for-steg/"],
	["/jihad/attacker-mot-civila-under-jihad", "/svar/vad-ar-jihad/"],
	["/islam/varfor-alagger-islam-sa-stranga-straff-for-utomaktenskapliga-forbindelser", "/svar/vad-ar-sharia/"],
	["/islam/motsager-islam-vetenskap", "/svar/islam-och-big-bang/"],
	["/religion/skillnader-mellan-religion-och-vetenskap", "/svar/islam-och-big-bang/"],
];

export default defineConfig({
	site: "https://islam.se",
	output: "static",
	prefetch: { defaultStrategy: "hover" },
	build: { inlineStylesheets: "always" },
	experimental: { contentIntellisense: true },
	// Modern-browser-only build target: keep modern JS native (top-level await,
	// optional chaining, nullish coalescing, class fields) instead of transpiling
	// down to a legacy baseline — smaller, faster client bundles.
	vite: { build: { target: "es2022" } },
	markdown: {
		remarkPlugins: [
			[
				remarkSmartypants,
				{
					openingQuotes: { double: "»", single: "\u2019" },
					closingQuotes: { double: "«", single: "\u2019" },
					dashes: "oldschool",
				},
			],
			remarkAbbr,
		] as unknown as RemarkPlugins,
		rehypePlugins: [rehypeHonorific, rehypeQuranVerse],
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: "Literata",
			cssVariable: "--font-body",
			fallbacks: ["Georgia", "Times New Roman", "serif"],
			options: {
				variants: [
					{
						// Axis instanced to the weights actually used (300–700) — see the
						// .woff2 note below; declaring the true range keeps the browser from
						// assuming 200/800/900 masters that no longer exist in the file.
						weight: "300 700",
						style: "normal",
						src: ["./src/assets/fonts/literata-roman.woff2"],
					},
				],
			},
		},
		{
			// Italic Literata is split into its own entry (same family name, so
			// `font-style: italic` on var(--font-body) still resolves to it) PURELY so it
			// is NOT preloaded: the 240 kB italic file is almost never above the fold
			// (pull-quotes, scattered <em>), and preloading it stole ~1.4 s of Slow-4G
			// bandwidth from the LCP hero image. It now loads lazily with font-display:swap
			// the moment italic text first renders — invisible, since that's below the fold.
			provider: fontProviders.local(),
			name: "Literata",
			cssVariable: "--font-body-italic",
			fallbacks: ["Georgia", "Times New Roman", "serif"],
			options: {
				variants: [
					{
						weight: "300 700",
						style: "italic",
						src: ["./src/assets/fonts/literata-italic.woff2"],
					},
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: "Source Sans 3",
			cssVariable: "--font-heading",
			fallbacks: ["system-ui", "sans-serif"],
			options: {
				variants: [
					{
						weight: "300 700",
						style: "normal",
						src: ["./src/assets/fonts/source-sans-3-roman.woff2"],
					},
				],
			},
		},
		{
			// Amiri Quran — a purpose-made mushaf naskh, subset to the Arabic
			// blocks + harakat (45 kB woff2). Used only for the daily verse (§7.2),
			// so it is declared site-wide but not preloaded — the browser fetches
			// it lazily when an Arabic glyph first renders (font-display: swap).
			provider: fontProviders.local(),
			name: "Amiri Quran",
			cssVariable: "--font-arabic",
			fallbacks: ["Scheherazade New", "serif"],
			options: {
				variants: [
					{
						weight: "400",
						style: "normal",
						src: ["./src/assets/fonts/amiri-quran.woff2"],
					},
				],
			},
		},
	],
	integrations: [
		sitemap({
			filter: (page) => !oldPaths.some((p) => page.endsWith(`${p}/`) || page.endsWith(p)),
			serialize(item) {
				const slug = item.url.replace("https://islam.se/", "").replace(/\/$/, "");
				if (articleDates[slug]) {
					item.lastmod = new Date(articleDates[slug]).toISOString();
				} else if (slug === "bonetider") {
					item.lastmod = new Date(BONETIDER_DATA_DATE).toISOString();
					item.changefreq = ChangeFreqEnum.WEEKLY;
					item.priority = 0.8;
				} else if (slug === "bonetider/metod") {
					item.lastmod = new Date(BONETIDER_DATA_DATE).toISOString();
					item.changefreq = ChangeFreqEnum.MONTHLY;
					item.priority = 0.7;
				} else if (slug.startsWith("bonetider/")) {
					// The 2,118 city pages: a credible dataset-version lastmod (Google
					// largely ignores priority/changefreq, but uses lastmod for crawl scheduling).
					item.lastmod = new Date(BONETIDER_DATA_DATE).toISOString();
					item.changefreq = ChangeFreqEnum.DAILY;
					item.priority = 0.6;
				}
				return item;
			},
		}),
		// Emit a Cloudflare Pages `_redirects` file (true edge 301s) for the dead
		// legacy URLs, instead of Astro's default per-path meta-refresh HTML pages.
		{
			name: "legacy-redirects",
			hooks: {
				"astro:build:done": ({ dir }) => {
					// Cloudflare _redirects matches the path literally, so emit BOTH the
					// slash-less and trailing-slash form of every rule. The legacy WordPress
					// URLs Google still ranks use trailing slashes; without the slash form they
					// 404 — which was dropping ~40% of all search impressions onto the 404 page
					// (Search Console, 2026-06). Custom (specific-target) rules first so a
					// first-match win beats the generic homepage fallback for the same path.
					const both = (from: string, to: string) => [`${from} ${to} 301`, `${from}/ ${to} 301`];
					const custom = customRedirects.flatMap(([from, to]) => both(from, to));
					const legacy = oldPaths.flatMap((p) => both(p, "/"));
					const body = `${[...custom, ...legacy].join("\n")}\n`;
					writeFileSync(new URL("_redirects", dir), body);
				},
			},
		},
	],
});
