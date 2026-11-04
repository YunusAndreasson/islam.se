// Ramadan för en ort som ett A4-ark: varje fastedag med suhūr och iftar, dag för dag.
//
// Varför ett eget ark när månadens PDF finns: ramadan korsar en månadsgräns (2027:
// 8 februari – 8 mars), så månadsarket ger två halva tabeller och ingen av dem räknar
// fastedagarna. Det här är arket som sätts upp på kylskåpet och i moskéns farstu för
// just den här månaden, och det läses på håll: två siffror per rad är de som räknas,
// när suhūr tar slut och när fastan bryts, så de sätts stora och resten litet.
//
// Det som skiljer arket från andra tabeller är stapeln. Varje dags fasta ritas från
// Fajr till Maghrib på samma klocka, så att man ser månaden växa: i Göteborg från elva
// timmar till tretton, i Kiruna från nio till tolv och en halv. Gråskala först — arket
// skrivs ut på laserskrivare — och mässing som enda färg, som på sajten.
//
// Allt räknas med samma motor och standardinställningar som /bonetider/<stad> och
// månadsarket, så ingen siffra här kan säga emot sidan.

import ornamentSvg from "../../../public/ornament.svg?raw";
import { type PdfPlace, placeKey, q, typstRenderer } from "./pdf";
import { formatHours } from "./place-facts";
import { computePrayerTimes, dateForStockholmDay, formatTime, TIME_ZONE } from "./prayer-times";
import { nextRamadan, type RamadanPeriod } from "./ramadan";
import { DEFAULT_SETTINGS } from "./settings";

/** Teckningen ur serien (»Det islamiska året«: nymånen över en sjö), som JPEG: typst
 *  bäddar in en JPEG som den är men packar upp en WebP, och 43 kB mot 385 kB gånger
 *  273 ark är skillnaden. Sökvägen räknas från apps/web, typst-rendererarens rot. */
const DRAWING = "/src/assets/ritningar/aret-tryck.jpg";

/** Sajtens avslutningsvinjett (takrosett mellan två korta pärlstavar, /ornament.svg),
 *  i en ton strax under papperet: stuckatur läses när man letar efter den. Ljusare än
 *  så försvinner den i en laserutskrift. */
const ORNAMENT = ornamentSvg
	.replace(/<title>.*?<\/title>/s, "")
	.replaceAll('fill="white"', 'fill="#cdc4b1"');

const renderRamadan = typstRenderer("ramadan-pdf-cache", [
	"src/lib/bonetider/ramadan-pdf.ts",
	"src/lib/bonetider/pdf.ts",
	"src/lib/bonetider/prayer-times.ts",
	"src/lib/bonetider/settings.ts",
	"src/lib/bonetider/ramadan.ts",
	"src/assets/ritningar/aret-tryck.jpg",
	"public/ornament.svg",
	"node_modules/adhan/package.json",
]);

export interface RamadanSheetDay {
	/** Fastedagens nummer i ramadan, 1–30. */
	n: number;
	iso: string;
	/** "mån 8 feb" */
	date: string;
	friday: boolean;
	fajr: string;
	sunrise: string;
	dhuhr: string;
	asr: string;
	maghrib: string;
	isha: string;
	/** Minuter efter midnatt, för stapeln. */
	fajrMin: number;
	maghribMin: number;
	/** "11 h 03" — kort nog för en kolumn, utan att se ut som ett klockslag. */
	length: string;
	/** Kvällen då en av de udda nätterna bland de sista tio börjar (natten till dag
	 *  21, 23, 25, 27 och 29 börjar vid Maghrib dagen före). */
	oddNightBegins: boolean;
}

const minutesOf = (d: Date): number => {
	const [h, m] = new Intl.DateTimeFormat("sv-SE", {
		timeZone: TIME_ZONE,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	})
		.format(d)
		.split(":")
		.map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
};

const addDays = (iso: string, days: number): string => {
	const d = new Date(`${iso}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
};

const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions): string =>
	new Date(`${iso}T12:00:00Z`).toLocaleDateString("sv-SE", { ...opts, timeZone: "UTC" });

/**
 * Fastedagarna för en ort, eller null om något dygn inte går att lösa (polarnatt utan
 * högbreddsregel). Allt eller inget, som ramadanTimes(): ett ark med luckor i hänger
 * ingen upp.
 */
export function ramadanSheetDays(place: PdfPlace, period: RamadanPeriod): RamadanSheetDay[] | null {
	const days: RamadanSheetDay[] = [];
	const total =
		Math.round(
			(Date.parse(`${period.endISO}T12:00:00Z`) - Date.parse(`${period.startISO}T12:00:00Z`)) /
				86_400_000,
		) + 1;
	for (let i = 0; i < total; i++) {
		const iso = addDays(period.startISO, i);
		const [y, m, d] = iso.split("-").map(Number);
		const t = computePrayerTimes(
			{ latitude: place.lat, longitude: place.lon },
			dateForStockholmDay(y ?? 0, (m ?? 1) - 1, d ?? 1),
			DEFAULT_SETTINGS,
		);
		const times = [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].map(formatTime);
		if (times.includes("—")) return null;
		const ms = t.maghrib.getTime() - t.fajr.getTime();
		if (!Number.isFinite(ms) || ms <= 0) return null;
		const mins = Math.round(ms / 60_000);
		const n = i + 1;
		const weekday = dayLabel(iso, { weekday: "short" }).replace(".", "");
		days.push({
			n,
			iso,
			date: `${weekday} ${dayLabel(iso, { day: "numeric", month: "short" }).replace(".", "")}`,
			friday: weekday === "fre",
			fajr: times[0] as string,
			sunrise: times[1] as string,
			dhuhr: times[2] as string,
			asr: times[3] as string,
			maghrib: times[4] as string,
			isha: times[5] as string,
			fajrMin: minutesOf(t.fajr),
			maghribMin: minutesOf(t.maghrib),
			length: `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}`,
			// Natten till dag n+1 börjar vid dag n:s Maghrib; de udda nätterna bland de
			// sista tio är nätterna till 21, 23, 25, 27 och 29.
			oddNightBegins: n >= 20 && n % 2 === 0 && n + 1 <= total,
		});
	}
	return days;
}

const ROW = 16; // pt — en rad; fast höjd, så att rutnätet och de sista tios hake går ihop

/** Typst-källan för en orts ramadanark. Exporterad för tester. */
export function ramadanDocument(
	place: PdfPlace,
	period: RamadanPeriod,
	days: RamadanSheetDay[],
): string {
	const first = days[0];
	const last = days.at(-1);
	if (!(first && last)) throw new Error("ramadanDocument: inga dagar");

	// Klockan stapeln står på: hela timmar från tidigaste Fajr till senaste Maghrib.
	const a0 = Math.floor(Math.min(...days.map((d) => d.fajrMin)) / 60);
	const a1 = Math.ceil(Math.max(...days.map((d) => d.maghribMin)) / 60);
	const span = (a1 - a0) * 60;
	const frac = (min: number) => ((min - a0 * 60) / span).toFixed(4);
	const hours = Array.from({ length: a1 - a0 + 1 }, (_, i) => a0 + i);

	const fmtLong = (iso: string) =>
		dayLabel(iso, { weekday: "long", day: "numeric", month: "long" });
	const eidISO = addDays(period.endISO, 1);
	const firstLen = formatHours((first.maghribMin - first.fajrMin) / 60);
	const lastLen = formatHours((last.maghribMin - last.fajrMin) / 60);
	const span0 = dayLabel(period.startISO, { day: "numeric", month: "long" });
	const span1 = dayLabel(period.endISO, { day: "numeric", month: "long", year: "numeric" });
	const where = place.county && place.county !== place.name ? `${place.county} · ` : "";
	const coords = `${place.lat.toFixed(2).replace(".", ",")}° N, ${place.lon.toFixed(2).replace(".", ",")}° O`;

	const lastTenFrom = days.findIndex((d) => d.n === 21);
	const lastTen = lastTenFrom >= 0 ? days.length - lastTenFrom : 0;

	const rows = days
		.map((d, i) => {
			const w = d.friday ? `"semibold"` : `"regular"`;
			const mark =
				i === lastTenFrom
					? `table.cell(rowspan: ${lastTen}, inset: 0pt, lastten(${lastTen}))`
					: i < lastTenFrom || lastTenFrom < 0
						? "[]"
						: null;
			const cells = [
				mark,
				`num(${d.n}, ${w})`,
				`dag(${q(d.date)}, ${w})`,
				`big(${q(d.fajr)}, ${w})`,
				`big(${q(d.maghrib)}, ${w}, odd: ${d.oddNightBegins})`,
				`fast(${frac(d.fajrMin)}, ${frac(d.maghribMin)})`,
				`small(${q(d.length)}, ${w})`,
				`small(${q(d.sunrise)}, ${w})`,
				`small(${q(d.dhuhr)}, ${w})`,
				`small(${q(d.asr)}, ${w})`,
				`small(${q(d.isha)}, ${w})`,
			].filter((c): c is string => c !== null);
			return `  ${cells.join(", ")},`;
		})
		.join("\n");

	return `#let ink = rgb("#1a1914")
#let quiet = rgb("#4c4840")
#let muted = rgb("#6d675c")
#let hair = rgb("#e3dccd")
#let gridline = rgb("#ece6da")
#let brass = rgb("#b8862f")
#let brassink = rgb("#8c6624")
#let hours = (${hours.map((h) => ((h - a0) / (a1 - a0)).toFixed(4)).join(", ")},)
#let hourlabels = (${hours.map((h) => q(String(h).padStart(2, "0"))).join(", ")},)

#set document(title: ${q(`Ramadan ${period.year} i ${place.name}`)}, author: "islam.se")
#set page(
  paper: "a4",
  margin: (left: 1.6cm, right: 1.6cm, top: 1.4cm, bottom: 1.9cm),
  footer: [
    #set text(size: 6.6pt, fill: muted)
    #set par(leading: 0.42em)
    #grid(columns: (1fr, auto), column-gutter: 1.2cm, align: (left + bottom, right + bottom),
      [Suhūr slutar när Fajr går in, och fastan bryts vid Maghrib. Tiderna är beräknade efter solens läge för ${coords} (Muslim World League, ʿAṣr enligt majoriteten av de lärda) och anges i svensk tid. Datumen följer Umm al-Qura-kalendern; ramadans första dag bekräftas genom att nymånen siktas och kan skilja sig en dag – följ din moské.],
      text(size: 7.2pt, fill: quiet)[islam.se/bonetider/${place.slug}/],
    )
  ],
)
#set text(font: "Source Sans 3", size: 8.4pt, fill: ink, lang: "sv", number-type: "lining", number-width: "tabular")
#set par(leading: 0.5em)

#let label(body) = text(size: 6.4pt, fill: muted, tracking: 0.07em, weight: "semibold", upper(body))
#let num(n, w) = text(font: "Literata", size: 8.6pt, fill: muted, weight: w, str(n))
#let dag(s, w) = text(size: 8.2pt, fill: quiet, weight: w, s)
#let big(s, w, odd: false) = {
  text(font: "Literata", size: 12.6pt, weight: if w == "semibold" { "bold" } else { "medium" }, s)
  if odd { h(2.2pt); box(baseline: -3.2pt, circle(radius: 1.35pt, fill: brass, stroke: none)) } else { h(5pt) }
}
#let small(s, w) = text(size: 8.2pt, fill: quiet, weight: w, s)
// Stapeln står i en ram med luft på sidorna, så att timetiketterna i huvudet kan
// centreras över sina streck utan att sticka ut i grannkolumnerna.
#let fast(x0, x1) = pad(x: 9pt, box(width: 100%, height: ${ROW}pt, {
  for (i, x) in hours.enumerate() {
    place(dx: x * 100%, line(start: (0pt, 0pt), end: (0pt, ${ROW}pt), stroke: (if calc.even(i) { 0.45pt } else { 0.3pt }) + gridline))
  }
  place(horizon, dx: x0 * 100%, rect(width: (x1 - x0) * 100%, height: 3.4pt, radius: 1.7pt, fill: brass, stroke: none))
}))
#let axis = pad(x: 9pt, box(width: 100%, height: 8pt, {
  for (i, x) in hours.enumerate() {
    if calc.even(i) or hours.len() <= 9 {
      place(dx: x * 100%, place(center + bottom, text(size: 6.3pt, fill: muted, hourlabels.at(i))))
    }
  }
}))
#let lastten(n) = box(width: 100%, height: n * ${ROW}pt, {
  place(right + top, dx: -1.2pt, line(start: (0pt, 2pt), end: (0pt, n * ${ROW}pt - 2pt), stroke: 1.1pt + brass))
  place(left + horizon, dx: -0.5pt, rotate(-90deg, reflow: true, text(size: 6pt, fill: brassink, tracking: 0.1em, weight: "semibold", upper[De sista tio])))
})

// ── Huvudet: ord till vänster, teckningen till höger. Teckningen är exakt lika hög som
// orden (DESIGN.md, »Size follows the words«): rubrikraden och faktaraden är dess över-
// och underkant, så storleken mäts fram i stället för att gissas.
// Rubriken står på en rad. »Skanör med Falsterbo« är det längsta ortnamnet med ett ark;
// ett namn som inte ryms vid 28 pt krymper tills det gör det, i stället för att bryta
// raden och skjuta tabellen över sidkanten.
#let titletext(size) = text(font: "Literata", size: size, weight: "regular", tracking: -0.012em)[Ramadan i #${q(place.name)}]
#let title = context {
  let avail = 10.6cm
  let w = measure(titletext(28pt)).width
  if w <= avail { titletext(28pt) } else { titletext(28pt * (avail / w)) }
}
#let opening = stack(
  spacing: 0pt,
  label[islam.se · bönetider],
  15pt,
  title,
  16pt,
  text(font: "Literata", size: 11.5pt, fill: quiet)[${period.hijriYear} e.H. · ${span0} – ${span1}],
  9pt,
  text(size: 7.4pt, fill: muted)[#${q(where + coords)}],
  24pt,
  // Två uppgifter, inte tre: Eid avslutar arket i stort format längst ned.
  grid(
    columns: (auto, auto),
    column-gutter: 0.9cm,
    row-gutter: 6pt,
    label[Första fastedagen], label[Fastan växer från första till sista dagen],
    text(font: "Literata", size: 10.6pt)[${fmtLong(period.startISO)}],
    text(font: "Literata", size: 10.6pt)[${firstLen} #text(fill: brassink)[→] ${lastLen}],
  ),
)
#context {
  let h = measure(block(width: 10.6cm, opening)).height
  grid(
    columns: (1fr, auto),
    column-gutter: 0.6cm,
    align: (left + bottom, right + bottom),
    opening,
    image(${q(DRAWING)}, height: h),
  )
}

#v(12pt)

// ── Tabellen. Fast radhöjd: rutnätet bakom stapeln går obrutet genom raderna.
#table(
  columns: (3.4mm, 6.5mm, 17mm, 19.5mm, 17mm, 1fr, 13mm, 11.4mm, 10.4mm, 10.4mm, 10.4mm),
  rows: (auto, ${ROW}pt),
  align: (x, y) => if x in (0, 5) { left + horizon } else if x == 2 { left + horizon } else { right + horizon },
  inset: (x, y) => if x == 0 or x == 5 { (x: 0pt, y: 0pt, bottom: if y == 0 { 4pt } else { 0pt }) } else if y == 0 { (x: 2.6pt, bottom: 4pt, top: 0pt) } else { (x: 2.6pt, y: 0pt) },
  stroke: (x, y) => if y == 0 { (bottom: 0.7pt + ink) } else if x > 0 { (bottom: 0.3pt + hair) } else { none },
  table.header(
    [], [], align(left + bottom, label[Datum]),
    align(right + bottom)[#text(weight: "semibold", size: 7.6pt)[Suhūr slutar] \\ #text(size: 6.4pt, fill: muted)[vid Fajr]],
    align(right + bottom)[#text(weight: "semibold", size: 7.6pt)[Iftar] #h(5pt) \\ #text(size: 6.4pt, fill: muted)[vid Maghrib] #h(5pt)],
    align(left + bottom)[#pad(left: 9pt, label[Fastan, från gryning till solnedgång]) #v(-1pt) #axis],
    align(right + bottom, label[Längd]),
    align(right + bottom, label[Shurūq]),
    align(right + bottom, label[Ẓuhr]),
    align(right + bottom, label[ʿAṣr]),
    align(right + bottom, label[ʿIshāʾ]),
  ),
${rows}
)

#v(5pt)
#text(size: 6.8pt, fill: muted)[#box(baseline: -1.6pt, circle(radius: 1.35pt, fill: brass, stroke: none)) #h(2pt) Kvällen då en av de udda nätterna bland de sista tio börjar – Laylat al-qadr söks bland dem. Fredagar i fetstil.]

#v(1fr)
#align(center)[
  #image(bytes(${q(ORNAMENT)}), format: "svg", width: 2.8cm)
  #v(-2pt)
  #text(font: "Literata", size: 9pt, fill: muted, tracking: 0.04em)[Fastan bryts för sista gången ${dayLabel(period.endISO, { weekday: "long", day: "numeric", month: "long" })}]
  #v(0pt)
  #text(font: "Literata", size: 15pt, fill: brassink)[Eid al-Fitr, ${fmtLong(eidISO)}]
]
#v(2pt)
`;
}

/** Om orten får ett ramadanark: nästa ramadan är känd och varje fastedag går att räkna
 *  ut. Både routen och ortssidans länk frågar här, så länken pekar aldrig på en fil
 *  som inte byggdes. */
export function hasRamadanSheet(place: PdfPlace, now = new Date()): boolean {
	const period = nextRamadan(now);
	return period !== null && ramadanSheetDays(place, period) !== null;
}

/**
 * Ramadanarket för en ort som PDF-byte, eller null när ramadan inte går att lösa för
 * orten. Cachen nyckelas på orten och ramadans första dag: arket är detsamma varje natt
 * fram till dess att månaden är över, så det byggs en gång per ramadan.
 */
export function ramadanPdf(place: PdfPlace, now = new Date()): Buffer | null {
	const period = nextRamadan(now);
	if (!period) return null;
	const days = ramadanSheetDays(place, period);
	if (!days) return null;
	return renderRamadan(
		`${placeKey(place)}-${period.startISO}`,
		ramadanDocument(place, period, days),
	);
}
