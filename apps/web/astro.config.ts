import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type UnifiedProcessorOptions, unified } from "@astrojs/markdown-remark";
import sitemap, { ChangeFreqEnum } from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";
import remarkSmartypants from "remark-smartypants";
import { BONETIDER_DATA_DATE } from "./src/lib/bonetider/meta";
import { MOSKEER_DATA_DATE } from "./src/lib/moskeer/meta";
import { rehypeHonorific } from "./src/plugins/rehype-honorific";
import { rehypeQuoteAttribution } from "./src/plugins/rehype-quote-attribution";
import { rehypeQuranVerse } from "./src/plugins/rehype-quran-verse";
import { rehypeSidenotes } from "./src/plugins/rehype-sidenotes";
import { remarkAbbr } from "./src/plugins/remark-abbr";

// remark-smartypants resolves its own `unified` version, whose Plugin type does not
// nominally match Astro's bundled RemarkPlugin (they are identical at runtime). This
// alias lets us cast the plugin list to the type Astro's markdown config expects.
type RemarkPlugins = NonNullable<UnifiedProcessorOptions["remarkPlugins"]>;

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

// The 2,118 /bonetider/[stad] pages server-render *this day's* prayer times, so a fresh
// build genuinely changes their content. Their sitemap <lastmod> must therefore track the
// build date, not a frozen dataset constant — otherwise the DAILY changefreq we already
// signal contradicts a weeks-old lastmod and Google discounts the freshness. Computed once
// per build so every city URL shares one consistent timestamp.
const BONETIDER_BUILD_LASTMOD = new Date().toISOString();

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
	// ⚠️ nar-ghusl-kravs still earns ~1 200 impressions / 32 clicks a month at position 3
	// on legacy authority. A page file at this path shadowed the redirect into the sitemap
	// until 2026-07-30; do not recreate one.
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
	[
		"/islam/ar-det-sant-att-muhammad-ma-guds-frid-och-valsignelser-vara-over-honom-skrev-koranen",
		"/svar/skrev-muhammed-koranen/",
	],
	["/kvinna/kvinnlig-omskarelse-konsstympning", "/svar/vad-sager-islam-om-kvinnlig-omskarelse/"],
	["/gud/big-bang", "/svar/islam-och-big-bang/"],
	["/islam/fasta-under-graviditeten", "/svar/maste-gravida-fasta/"],
	["/tro/en-medelvag-mellan-tro-och-handling", "/svar/tro-och-handling-i-islam/"],
	["/historia/det-muslimska-arvet-i-spanien", "/svar/det-muslimska-spanien-al-andalus/"],
	["/historia/emigrationen-till-medina", "/svar/vad-var-hijra/"],
	["/historia/abu-bakrs-och-umars-kalifat", "/svar/de-rattledda-kaliferna/"],
	[
		"/islam/en-grundlaggande-forklaring-av-koranens-forsta-kapitel-al-fatihah",
		"/svar/vad-betyder-al-fatiha/",
	],
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
	[
		"/islam/koranen-sager-att-muslimer-skall-drapa-de-som-inte-tror-varhelst-de-finner-dem-betyder-detta-att-islam-stodjer-vald-och-blodspillan",
		"/svar/vad-ar-jihad/",
	],
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
	[
		"/islam/varfor-alagger-islam-sa-stranga-straff-for-utomaktenskapliga-forbindelser",
		"/svar/vad-ar-sharia/",
	],
	["/islam/motsager-islam-vetenskap", "/svar/islam-och-big-bang/"],
	["/religion/skillnader-mellan-religion-och-vetenskap", "/svar/islam-och-big-bang/"],
	// === 2026-06-20 free redirects (GSC click-leak sweep): legacy URLs answered by an existing page ===
	// "Guds profeter" (all prophets) → the Muhammad page, which carries the prophethood
	// answer; repoint if a dedicated profeterna-i-islam page is ever built.
	["/islam/guds-profeter", "/svar/vem-var-profeten-muhammed/"],
	// "Kristendomens gudssyn" is the comparative half of tawhid vs. trinity, which
	// islams-gudssyn already addresses.
	["/religion/kristendomens-gudssyn", "/svar/islams-gudssyn/"],
	// The biggest remaining click leak (115c/180d). The backlog read the "omsesidig
	// kärlek" essay as love/brotherhood, but GSC shows it ranks for MARRIAGE queries
	// ("äktenskap islam", "giftermål islam regler") — already answered by aktenskap-i-islam.
	// So it's a free redirect, not a content gap. Repoint if a love/brotherhood page is built.
	["/featured/omsesidig-karlek", "/svar/aktenskap-i-islam/"],
	// New page (2026-06-20): the "five pillars" overview. /tro/islams-fem-pelare and
	// /category/pelare were HARD 404s (not even in oldPaths) pulling ~3,150 impr/180d
	// of focused "islams fem pelare" intent at p10–12; now answered + 301'd to the page.
	["/tro/islams-fem-pelare", "/svar/islams-fem-pelare/"],
	["/category/pelare", "/svar/islams-fem-pelare/"],
	// "Dyrkan" (worship/ibadah) — GSC shows definitional intent ("dyrkan", "vad betyder
	// dyrka") at p3–11; tawhid al-ulūhiyya (worship of God alone) is exactly this answer.
	["/pelare/dyrkan", "/svar/vad-ar-tawhid/"],
	// === 2026-06-20 batch 3 (orchestrated): new /svar/ pages for GSC content gaps ===
	// Superstition / amulets / evil eye (1017i p6.8). Horoscopes/fortune-telling share
	// the same shirk frame → fold the divination URL into the same page.
	["/religion/vidskepelse", "/svar/vad-sager-islam-om-vidskepelse/"],
	["/religion/spadomar-och-horoskop", "/svar/vad-sager-islam-om-vidskepelse/"],
	// === 2026-06-24 batch 4 (orchestrated): new /svar/ pages for the remaining GSC content gaps ===
	// Agnosticism was the single biggest soft-404 to the homepage (2150i/90d, p8.2) — now answered.
	["/religion/agnosticism", "/svar/vad-sager-islam-om-agnosticism/"],
	["/islam/hinduismens-manga-gudar", "/svar/islam-och-polyteism/"],
	["/religion/ateism", "/svar/vad-sager-islam-om-ateism/"],
	["/religion/deism-och-sekularism", "/svar/islam-deism-och-sekularism/"],
	[
		"/islam/hur-skiljer-sig-koranen-fran-de-andra-skrifterna",
		"/svar/koranen-och-tidigare-skrifter/",
	],
	["/islam/karma", "/svar/tror-muslimer-pa-karma/"],
	["/kvinna/fyra-vittnen-till-en-valdtakt", "/svar/fyra-vittnen-och-valdtakt/"],
	["/historia/uppenbarelsens-borjan", "/svar/forsta-uppenbarelsen/"],
	["/existens/syftet-med-skapelsen-av-manniskoslaktet", "/svar/varfor-skapade-gud-manniskan/"],
	["/historia/erovringen-av-mecka", "/svar/erovringen-av-mecka/"],
	["/gud/argument-for-guds-existens", "/svar/finns-bevis-for-gud/"],
	// Islamic golden age (science in history): the dedicated page absorbs the whole science-history cluster.
	[
		"/historia/vetenskap-i-den-islamiska-varlden-under-medeltiden",
		"/svar/den-islamiska-guldaldern/",
	],
	["/historia/ett-vetenskapligt-synsatt", "/svar/den-islamiska-guldaldern/"],
	["/historia/kultur-som-undervarderar-vetenskap", "/svar/den-islamiska-guldaldern/"],
	// === 2026-06-27: head-term ("islam") recovery → the new /vad-ar-islam pillar ===
	// The old WordPress "fakta om islam" page is still served (200) but Google has
	// dropped it ("Crawled – currently not indexed"); consolidate its intent onto the
	// new encyclopedic pillar instead of a soft-404 to the homepage (it was in oldPaths).
	["/utvalda/fakta-om-islam", "/vad-ar-islam/"],
	// The legacy author archive was a hard 404 still pulling ~3,000 "islam" impressions
	// (Search Console) — point that residual equity at the pillar, the relevant live page.
	["/author/user", "/vad-ar-islam/"],
	// === 2026-06-28: split FAKTA (cornerstone) from FRÅGOR & SVAR (the question list) ===
	// FAKTA lives at /vad-ar-islam/ (the Five Pillars + six Articles of Faith, image-led);
	// the full question list lives at /svar/ (a real index page again). Every
	// /svar/<slug> answer page keeps its exact URL — cornerstone answers are reclassified
	// in the data layer, never moved. Courtesy: the intuitive /fakta resolves to the hub.
	["/fakta", "/vad-ar-islam/"],
	// === 2026-07-28 (GSC coverage sweep): 151 legacy URLs still 301'd to the homepage,
	// i.e. soft-404s. These are the ones an existing page actually answers. The rest
	// stay on "/" — they are the content backlog, not a redirect target. ===
	// Gud, tawhid, gudssyn
	["/gudssyn", "/svar/islams-gudssyn/"],
	["/tro/gud", "/svar/islams-gudssyn/"],
	["/islam/allah-eller-gud", "/svar/islams-gudssyn/"],
	["/islam/antropomorfism", "/svar/islams-gudssyn/"],
	["/islam/guds-attribut", "/svar/islams-gudssyn/"],
	["/gud/verklig-kunskap-om-gud", "/svar/islams-gudssyn/"],
	["/gud/intellektets-begransningar", "/svar/islams-gudssyn/"],
	["/gud/allsmaktighetsparadoxen", "/svar/islams-gudssyn/"],
	["/religion/filosofernas-gudssyn", "/svar/islams-gudssyn/"],
	["/religion/judendomens-gudssyn", "/svar/islams-gudssyn/"],
	["/existens/konstverket-ar-inte-konstnaren", "/svar/islams-gudssyn/"],
	["/uncategorized/naderik-eller-bestraffande", "/svar/islams-gudssyn/"],
	["/gud/hur-manga-skapare-finns-det", "/svar/vad-ar-tawhid/"],
	["/islam/ingen-finns-som-kan-liknas-vid-honom", "/svar/vad-ar-tawhid/"],
	["/uncategorized/forsta-skyldigheten-som-aligger-manniskan", "/svar/vad-ar-tawhid/"],
	["/islam/ingen-gud-utom-gud", "/svar/trosbekannelsen-shahada/"],
	["/religion/de-flesta-har-trott-pa-gud", "/svar/finns-bevis-for-gud/"],
	["/religion/i-sjalen-medfott", "/svar/finns-bevis-for-gud/"],
	// Skapelsen, universum, själen
	["/universum", "/svar/islam-och-big-bang/"],
	["/uncategorized/evolutio", "/svar/islam-och-big-bang/"],
	["/existens/manniskans-plats-i-universum", "/svar/varfor-skapade-gud-manniskan/"],
	["/existens/hur-manniskan-skapar", "/svar/varfor-skapade-gud-manniskan/"],
	["/gud/gud-skapar-men-manniskan-omvandlar", "/svar/varfor-skapade-gud-manniskan/"],
	["/gud/anledning-till-att-vi-dyrkar-allah", "/svar/varfor-skapade-gud-manniskan/"],
	["/featured/meningen-med-livet", "/svar/varfor-skapade-gud-manniskan/"],
	["/existens/en-levande-planet", "/amnen/skapelsen/"],
	["/featured/en-levande-planet-2", "/amnen/skapelsen/"],
	["/category/existens", "/amnen/skapelsen/"],
	["/islam/sjalens-existens-2", "/amnen/sjalen/"],
	// Embryologi
	[
		"/islam/koranen-namner-att-manniskan-skapats-fran-jordstoff-men-den-namner-ocksa-att-hon-skapats-av-sadesvatska-ar-inte-detta-motsagelsefullt",
		"/svar/koranen-och-embryologi/",
	],
	["/uncategorized/skapad-av-sadesvatska", "/svar/koranen-och-embryologi/"],
	["/uncategorized/avgora-barnets-kon", "/svar/koranen-och-embryologi/"],
	["/uncategorized/vad-kvinnans-skote-doljer", "/svar/koranen-och-embryologi/"],
	// Skrifterna
	["/islam/tron-pa-skrifterna", "/svar/koranen-och-tidigare-skrifter/"],
	["/islam/tron-pa-skrifterna-som-gud-sant-ned", "/svar/koranen-och-tidigare-skrifter/"],
	["/tro/sandebuden-och-skrifterna", "/svar/koranen-och-tidigare-skrifter/"],
	["/islam/jag-har-delat-bonen-mellan-mig-och-min-tjanare", "/svar/vad-betyder-al-fatiha/"],
	// Jihad, extremism, terrorism
	["/jihad/extremism", "/svar/vad-ar-jihad/"],
	["/jihad/terrorism-2", "/svar/vad-ar-jihad/"],
	["/jihad/samexistens-och-tolerans", "/svar/vad-ar-jihad/"],
	["/jihad/en-avslappnad-installning", "/svar/vad-ar-jihad/"],
	["/uncategorized/terrorism", "/svar/vad-ar-jihad/"],
	["/islam/ar-islam-en-militant-religion", "/svar/vad-ar-jihad/"],
	// Kvinnan
	["/kvinna/hedersrelaterat-vald", "/svar/vad-sager-islam-om-hedersmord/"],
	["/kvinna/modern-har-tre-rattigheter", "/svar/islams-syn-pa-kvinnan/"],
	["/kvinna/graviditet-ar-inte-ett-bevis", "/svar/fyra-vittnen-och-valdtakt/"],
	["/islam/johara-att-bara-sloja-under-en-dag", "/svar/vad-ar-hijab/"],
	["/islam/sara-varfor-jag-bar-sloja", "/svar/vad-ar-hijab/"],
	// Konvertering — de fyra sista är konvertitvittnesmål, inte lärotext
	["/islam-i-praktik/konvertera", "/svar/hur-blir-man-muslim/"],
	["/islam/annica-folk-visar-mig-mer-respekt", "/svar/hur-blir-man-muslim/"],
	["/islam/en-kar-mormor", "/svar/hur-blir-man-muslim/"],
	["/islam/jenny-jag-angrar-inte-min-sjal", "/svar/hur-blir-man-muslim/"],
	["/islam/rabia-vad-jag-tycker-om-min-sjal", "/svar/hur-blir-man-muslim/"],
	// Bön och tvagning
	["/islam-i-praktik/video-tvagningen", "/svar/tvagning-wudu/"],
	["/uncategorized/forberedelser-infor-bonen-2", "/svar/sa-ber-man-steg-for-steg/"],
	// Ramadan och fastan
	["/islam/fastans-inre-hemligheter", "/svar/vad-ar-ramadan/"],
	["/featured/fastans-historiska-anknytning", "/svar/vad-ar-ramadan/"],
	["/islam/liknelsen-for-den-fastande-ar-en-man-som-bar-pa-en-sack-mysk", "/svar/vad-ar-ramadan/"],
	// ⚠️ Fastetider = Fajr/Maghrib, alltså bönetiderna — inte årskalendern.
	["/tag/faste-tider", "/bonetider/"],
	["/tag/fastetider", "/bonetider/"],
	["/tag/ramdan-tidtabell", "/bonetider/"],
	["/tag/ramadankalender", "/det-islamiska-aret/"],
	// Historia och vetenskap
	["/historia/uthmans-kalifat", "/svar/de-rattledda-kaliferna/"],
	["/historia", "/svar/den-islamiska-guldaldern/"],
	["/vetenskap", "/svar/den-islamiska-guldaldern/"],
	["/category/historia", "/svar/den-islamiska-guldaldern/"],
	// Sunna, sunni, de lärda
	["/islam/ahlus-sunnah", "/svar/sunni-och-shia/"],
	["/islam/muhammad-ibn-ismail-al-bukhari", "/svar/vad-ar-sunna/"],
	["/islam/ibn-taymiyyah", "/tankare/ibn-taymiyya/"],
	// Ateism, sekularism, sufism, ödet
	["/islam/ett-liv-utan-religion", "/svar/vad-sager-islam-om-ateism/"],
	["/religion/anledningar-till-att-religionen-avvisats", "/svar/vad-sager-islam-om-ateism/"],
	["/islam/existensialism", "/svar/islam-deism-och-sekularism/"],
	["/religion/mysticism", "/svar/vad-ar-sufism/"],
	["/featured/mangudemyten", "/svar/islam-och-polyteism/"],
	["/islam/ar-islam-fatalistiskt", "/svar/vad-ar-odet-qadar/"],
	// ⚠️ /category/polare är WordPress felstavning av "pelare" — inte "polare".
	["/category/polare", "/svar/islams-fem-pelare/"],
	["/category/polare-1a", "/svar/islams-fem-pelare/"],
	// Arkiv och ingångar som pelarsidan/svarsindexet bär
	["/category/islam", "/vad-ar-islam/"],
	["/category/religion", "/vad-ar-islam/"],
	["/category/tro", "/vad-ar-islam/"],
	["/islam/islams-troslara", "/vad-ar-islam/"],
	["/trosartiklar", "/vad-ar-islam/"],
	["/islam/dawah", "/vad-ar-islam/"],
	["/livsaskadning", "/vad-ar-islam/"],
	["/livsaskadning/genomgang", "/vad-ar-islam/"],
	["/religion/behovet-av-religion", "/vad-ar-islam/"],
	["/religion/kriterier-for-en-sann-religion", "/vad-ar-islam/"],
	["/religion/vagarna-till-sann-religion", "/vad-ar-islam/"],
	["/religion/alla-religioner-sager-sig-vara-den-ratta", "/vad-ar-islam/"],
	[
		"/islam/alla-religioner-lar-i-grund-och-botten-dess-anhangare-att-vara-goda-sa-varfor-skall-man-folja-just-islam",
		"/vad-ar-islam/",
	],
	["/category/faq", "/svar/"],
	["/category/guider", "/svar/"],
	["/guider", "/svar/"],
	["/category/kost", "/svar/varfor-ater-muslimer-inte-griskott/"],
	// Redaktion och policy
	["/om/kontakt", "/om/"],
	["/om/forslag", "/om/"],
	["/om/rattigheter", "/om/"],
	["/om/integritet", "/integritetspolicy/"],
	["/author/admin", "/om/redaktion/"],
	["/author/knut", "/om/redaktion/"],
	["/author/dr-abdullah-s-ash-shehri", "/om/redaktion/"],
	["/author/muhammad-bin-salih-al-uthaymin", "/om/redaktion/"],
	// === 2026-08-08 (GSC 90d sweep, 2026-05-07 → 2026-08-05) ===
	// The soft-404 recovery project is finished: only 10 legacy paths still 301 to the
	// homepage, and 1 088 of their 1 282 impressions belong to /samlingsvolym.pdf. These
	// five are the remainder worth a destination. Targets were chosen from each URL's OWN
	// Search Console queries, never from its slug — the lesson /featured/omsesidig-karlek
	// taught in 2026-06 (it read as "brotherhood" and ranked for marriage).
	// Ranks for "hur många muslimer finns det i världen" / "islams utbredning i världen",
	// i.e. demographics — not the picture gallery the slug promises. No page answers that
	// yet, so the Fakta hub is the closest honest destination (cf. /utvalda/fakta-om-islam).
	["/historia/den-islamiska-varlden-bilder", "/vad-ar-islam/"],
	// Both rank for "bli muslim". The /uncategorized/ twin of sa-blir-du-muslim-2 is
	// already wired above; this is its /guider/ sibling, which GSC shows separately.
	["/islam/islams-behorighetskrav", "/svar/hur-blir-man-muslim/"],
	["/guider/sa-blir-du-muslim-2", "/svar/hur-blir-man-muslim/"],
	["/author/muhammad-salih-al-munajjid", "/om/redaktion/"],
	["/author/prof-sami-al-majid", "/om/redaktion/"],
	// Deliberately NOT redirected, though both still earn impressions:
	//  • /religion/pandoras-ask (43i) ranks for the Greek idiom ("pandoras ask betyder"),
	//    not for anything islam.se covers — any Islamic target would just bounce.
	//  • /samlingsvolym.pdf (1 088i) collects filetype:pdf and unrelated-phrase hits.
	//  • /islam/foraldrar, /category/featured, /andra-religioners-syn-pa-gud rank only for
	//    the brand query "islam.se" — the homepage 301 is already the right answer.
];

export default defineConfig({
	site: "https://islam.se",
	output: "static",
	// ⚠️ "hover", not "tap". The strategies REPLACE each other — "tap" does not widen
	// "hover", it removes it — and a pointer user always hovers before clicking, so hover
	// is a strict superset there, with hundreds of ms of head start instead of the tens
	// "tap" gets from mousedown. It is also the only strategy `clientPrerender` below has
	// room to finish a real Speculation-Rules prerender in. Touch is not left empty either:
	// mobile browsers fire mouseover on tap ahead of click, and Astro already downgrades on
	// saveData/2g.
	prefetch: { defaultStrategy: "hover" },
	// concurrency: measured 102 s -> 86 s on this 8-core box. Do NOT raise it to 8 —
	// page rendering is CPU-bound and single-threaded, so 8 measured SLOWER (98 s) than
	// 4 through contention. The sampled validation build is deliberately serial: Astro's
	// parallel prerender can intermittently ENOENT a freshly-created route directory in
	// the partial /bonetider sample, which makes `pnpm run build:fast` flaky.
	// inlineStylesheets stays "always": it costs ~5 s of build and buys the
	// render-blocking-request-free FCP the Lighthouse pass depends on.
	build: { inlineStylesheets: "always", concurrency: process.env.BONETIDER_SAMPLE ? 1 : 4 },
	// Astro 7 defaults this to "warn". Nearly every route here is generated from a DERIVED
	// slug — ~2100 bonetider/[stad] pages plus moskeer/[stad] and moskeer/lan/[lan] — and a
	// collision means one page silently overwrites another (we have already been bitten by
	// counties colliding under /lan/). A warning in a 2500-page build log is a warning
	// nobody reads; fail the build instead.
	prerenderConflictBehavior: "error",
	experimental: {
		contentIntellisense: true,
		// Upgrades the `prefetch` hover strategy from "fetch the HTML" to a real Speculation
		// Rules prerender in supporting browsers (Chrome), falling back to plain prefetch
		// elsewhere. Worth it on a densely cross-linked prose site. The usual objection —
		// prerendered pages inflating analytics — does not apply since GA4 was removed.
		clientPrerender: true,
	},
	vite: {
		// Vite's own Baseline target (chrome111 / edge111 / firefox114 / safari16.4 /
		// ios16.4) rather than a hand-picked `es2022`. It is a HIGHER floor than
		// es2022's, so less is transpiled, and it advances with Baseline instead of
		// being re-guessed here.
		build: { target: "baseline-widely-available" },
		define: {
			// src/lib/lqip.ts reads the original hero files with sharp at build time to
			// inline a 20px placeholder behind the homepage spread. It cannot find them
			// from its own `import.meta.url`: the static build bundles server modules
			// into a temp chunk directory, so a source-relative URL resolves to nothing
			// — the placeholder worked in dev and silently vanished from production.
			// This config file is never bundled, so its `import.meta.url` is the one
			// dependable anchor to the project.
			__HERO_IMAGES_DIR__: JSON.stringify(
				fileURLToPath(new URL("./src/assets/images", import.meta.url)),
			),
		},
	},
	markdown: {
		// Astro 7 made Sätteri (Rust) the default Markdown processor, and deprecated the
		// top-level `remarkPlugins`/`rehypePlugins` keys — they only still work through a
		// compatibility shim that silently swaps in `unified()` and warns on every build.
		// Declaring the processor explicitly pins the pipeline we actually run.
		//
		// We stay on unified deliberately. Sätteri's `smartPunctuation` is boolean-only
		// (quotes/dashes/ellipses) and cannot emit the house guillemets »…« configured
		// below — switching would rewrite the quotes in every essay and svar page to the
		// curly English pair. The three local plugins are unist/hast-based as well, and
		// rehype-quran-verse drives the essay recitation player.
		//
		// `unified()` defaults to `gfm: true` / `smartypants: true`, exactly what the shim
		// produced, so the emitted HTML is unchanged.
		processor: unified({
			// MUST stay false: Astro registers its OWN remark-smartypants when this is
			// true, and that one runs with default options — it turns "…" into “…”
			// before our guillemet-configured instance below ever sees a straight quote.
			smartypants: false,
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
			// rehype-quote-attribution runs last: rehype-quran-verse decides on the
			// recitation player by reading the closing attribution as plain text, so it
			// sees the shape it was written against before the citation is wrapped.
			// rehypeSidenotes runs LAST. It copies footnote bodies into the prose, and
			// every pass before it reads the document shape it was written against —
			// rehypeQuranVerse in particular scans paragraph text to decide where a
			// recitation player belongs, and would otherwise be reading note text that
			// is not part of the paragraph at all.
			rehypePlugins: [rehypeHonorific, rehypeQuranVerse, rehypeQuoteAttribution, rehypeSidenotes],
		}),
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: "Literata",
			cssVariable: "--font-body",
			fallbacks: ["Georgia", "Times New Roman", "serif"],
			// REVERTED 2026-07-24, back to the "swap" default.
			//
			// The 2026-07-23 experiment set "optional" to keep the font off the LCP
			// critical path, accepting that a cold-cache visit renders the
			// metric-matched fallback. Measured on a cold cache (CDP
			// CSS.getPlatformFontsForNode, which reports what was actually
			// rasterised rather than what document.fonts claims), the cost turned out
			// to be the whole typeface: both .woff2 files download fine and report
			// `loaded`, but they arrive after "optional"'s ~100ms block period, so
			// the browser locks in the fallback for the entire page load and never
			// swaps. Body rendered as Liberation Serif, headings as Liberation Sans.
			//
			// That is every first-time visitor — which on this site is most of them,
			// arriving from search — reading a typography-led page in Times New Roman.
			// Too high a price for the LCP points. "swap" paints text immediately in
			// the fallback and upgrades when the font lands; because
			// optimizedFallbacks generates a metric-matched face (size-adjust +
			// ascent/descent overrides), that swap costs almost no layout shift.
			display: "swap",
			options: {
				// Split by unicode-range: the core carries Latin-1, typography, arrows and
				// the exact transliteration pairs the corpus sets, so real pages fetch 141 kB
				// instead of 227 kB and never touch -ext. -ext is the safety net — a glyph
				// outside the core triggers a fetch, so this can never render tofu.
				// Regenerate both with pyftsubset --flavor=woff2 --layout-features='*' after
				// any font change; the ranges below are the --unicodes arguments.
				// The core MUST keep U+2190-2192 — the ← and → in .back-link/.arrow-link
				// exist only in CSS `content`, so no text scan will tell you they are needed.
				variants: [
					{
						// Axis instanced to the weights actually used (300–700) — see the
						// .woff2 note below; declaring the true range keeps the browser from
						// assuming 200/800/900 masters that no longer exist in the file.
						weight: "300 700",
						style: "normal",
						src: ["./src/assets/fonts/literata-roman-core.woff2"],
						unicodeRange: [
							"U+0000-00FF",
							"U+2000-206F",
							"U+2190-21FF",
							"U+2300-231F",
							"U+0100-0101",
							"U+012A-012B",
							"U+015E-0161",
							"U+016A-016B",
							"U+02BE-02BF",
							"U+1E0C-1E0D",
							"U+1E24-1E25",
							"U+1E5A-1E5B",
							"U+1E62-1E63",
							"U+1E6C-1E6D",
							"U+1E92-1E93",
						],
					},
					{
						weight: "300 700",
						style: "normal",
						src: ["./src/assets/fonts/literata-roman-ext.woff2"],
						unicodeRange: [
							"U+0102-0129",
							"U+012C-015D",
							"U+0162-0169",
							"U+016C-02BD",
							"U+02C0-1E0B",
							"U+1E0E-1E23",
							"U+1E26-1E59",
							"U+1E5C-1E61",
							"U+1E64-1E6B",
							"U+1E6E-1E91",
							"U+1E94-1FFF",
							"U+2070-218F",
							"U+2200-22FF",
							"U+2320-FFFF",
						],
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
			// See the --font-body entry above for why "optional" was reverted here too.
			display: "swap",
			options: {
				// Same core/ext split as --font-body; see the note there.
				variants: [
					{
						weight: "300 700",
						style: "normal",
						src: ["./src/assets/fonts/source-sans-3-roman-core.woff2"],
						unicodeRange: [
							"U+0000-00FF",
							"U+2000-206F",
							"U+2190-21FF",
							"U+2300-231F",
							"U+0100-0101",
							"U+012A-012B",
							"U+015E-0161",
							"U+016A-016B",
							"U+02BE-02BF",
							"U+1E0C-1E0D",
							"U+1E24-1E25",
							"U+1E5A-1E5B",
							"U+1E62-1E63",
							"U+1E6C-1E6D",
							"U+1E92-1E93",
						],
					},
					{
						weight: "300 700",
						style: "normal",
						src: ["./src/assets/fonts/source-sans-3-roman-ext.woff2"],
						unicodeRange: [
							"U+0102-0129",
							"U+012C-015D",
							"U+0162-0169",
							"U+016C-02BD",
							"U+02C0-1E0B",
							"U+1E0E-1E23",
							"U+1E26-1E59",
							"U+1E5C-1E61",
							"U+1E64-1E6B",
							"U+1E6E-1E91",
							"U+1E94-1FFF",
							"U+2070-218F",
							"U+2200-22FF",
							"U+2320-FFFF",
						],
					},
				],
			},
		},
		{
			// Amiri Quran — a purpose-made mushaf naskh, subset to the Arabic
			// blocks + harakat (45 kB woff2). Declared site-wide but not preloaded
			// by default — the browser fetches it lazily when an Arabic glyph first
			// renders (font-display: swap).
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
			// /ratta is a noindex utility page — keep it out of the sitemap too, or
			// Search Console reports it as "indexerad, men blockerad".
			filter: (page) =>
				!(
					page.endsWith("/ratta/") ||
					oldPaths.some((p) => page.endsWith(`${p}/`) || page.endsWith(p))
				),
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
					// The 2,118 city pages regenerate their day's times each build, so lastmod =
					// build date (Google uses lastmod for crawl scheduling; a moving lastmod on a
					// DAILY page prompts re-crawl and keeps the indexed times current).
					item.lastmod = BONETIDER_BUILD_LASTMOD;
					item.changefreq = ChangeFreqEnum.DAILY;
					item.priority = 0.6;
				} else if (slug === "moskeer") {
					item.lastmod = new Date(MOSKEER_DATA_DATE).toISOString();
					item.changefreq = ChangeFreqEnum.MONTHLY;
					item.priority = 0.6;
					// `moskeer/lan/x` also matches `moskeer/`, so test the län prefix first.
				} else if (slug.startsWith("moskeer/lan/")) {
					item.lastmod = new Date(MOSKEER_DATA_DATE).toISOString();
					item.changefreq = ChangeFreqEnum.MONTHLY;
					item.priority = 0.6;
				} else if (slug.startsWith("moskeer/")) {
					item.lastmod = new Date(MOSKEER_DATA_DATE).toISOString();
					item.changefreq = ChangeFreqEnum.MONTHLY;
					item.priority = 0.5;
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
					// A path that already has a custom rule must not also get a homepage line:
					// it is unreachable (first match wins) and Cloudflare caps the file at 2100.
					const claimed = new Set(customRedirects.map(([from]) => from));
					const legacy = oldPaths.filter((p) => !claimed.has(p)).flatMap((p) => both(p, "/"));
					const body = `${[...custom, ...legacy].join("\n")}\n`;
					writeFileSync(new URL("_redirects", dir), body);
				},
			},
		},
	],
});
