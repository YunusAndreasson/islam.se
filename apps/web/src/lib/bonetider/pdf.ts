// Månadens bönetider som en utskriftsfärdig A4-sida, en per ort.
//
// Varför en PDF när sidan redan visar tabellen: det här är arket som sätts upp i
// moskéns farstu och på kylskåpsdörren. Konkurrenten islam.nu erbjuder det och vi har
// inte gjort det. Det är också, tillsammans med .ics-kalendern, en av få saker på den
// här ytan som kräver ett klick — Google kan skriva ut dagens tider i resultatlistan,
// men inte räcka läsaren en fil.
//
// Bara orter över OG_POPULATION får en. 2 128 PDF:er hade kostat 18 minuter bygge och
// 130 MB; 273 kostar drygt två minuter och 17 MB, och täcker varje ort med fler än
// 5 000 invånare. Mindre orter har kalendern och webbsidan.
//
// Kostnaden är dessutom betald en gång i månaden, inte varje natt: en månadstabell är
// densamma den 1:a som den 28:e, så utdata är deterministiskt per (ort, år, månad) och
// cachas på disk precis som .ics-filerna och OG-korten. Se ics.ts för samma resonemang.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { computePrayerTimes, dateForStockholmDay, formatTime, TIME_ZONE } from "./prayer-times";
import { DEFAULT_SETTINGS } from "./settings";

const CACHE_DIR = join(process.cwd(), "node_modules/.astro/pdf-cache");
const WORK_DIR = join(process.cwd(), "node_modules/.astro/pdf-build");
// Repo-roten är två steg upp från apps/web, där både fonts/ och typst-anropet i
// scripts/generate-pdf.ts redan letar.
const FONTS_DIR = join(process.cwd(), "../../fonts");

const generation = (() => {
	try {
		const self = join(process.cwd(), "src/lib/bonetider/pdf.ts");
		return createHash("sha256").update(readFileSync(self)).digest("hex").slice(0, 12);
	} catch {
		return `nogen-${process.pid}`;
	}
})();

const GEN_DIR = join(CACHE_DIR, generation);
let pruned = false;

function pruneOldGenerations(): void {
	if (pruned) return;
	pruned = true;
	try {
		for (const entry of readdirSync(CACHE_DIR, { withFileTypes: true })) {
			if (entry.isDirectory() && entry.name !== generation) {
				rmSync(join(CACHE_DIR, entry.name), { recursive: true, force: true });
			}
		}
	} catch {
		// Ingen cachekatalog än. Ett bygge får aldrig falla på städningen.
	}
}

export interface PdfPlace {
	name: string;
	slug: string;
	county?: string | undefined;
	lat: number;
	lon: number;
}

/** Typst-strängar citeras med `"`, så ett citattecken i ett ortnamn skulle bryta
 *  dokumentet. Inget svenskt ortnamn innehåller ett — men underlaget är en GeoNames-dump
 *  och inte en lista vi skrivit själva. */
const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

interface Row {
	day: number;
	weekday: string;
	times: string[];
}

function monthRows(place: PdfPlace, year: number, month: number): Row[] {
	const coords = { latitude: place.lat, longitude: place.lon };
	const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const weekdayFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, weekday: "short" });
	return Array.from({ length: days }, (_, i) => {
		const date = dateForStockholmDay(year, month, i + 1);
		const t = computePrayerTimes(coords, date, DEFAULT_SETTINGS);
		return {
			day: i + 1,
			weekday: weekdayFmt.format(date).replace(".", ""),
			times: [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].map(formatTime),
		};
	});
}

function document(place: PdfPlace, year: number, month: number): string {
	const rows = monthRows(place, year, month);
	const monthName = new Intl.DateTimeFormat("sv-SE", {
		timeZone: TIME_ZONE,
		month: "long",
		year: "numeric",
	}).format(dateForStockholmDay(year, month, 1));
	const where = place.county && place.county !== place.name ? `${place.county} · ` : "";
	const coords = `${place.lat.toFixed(2).replace(".", ",")}° N, ${place.lon.toFixed(2).replace(".", ",")}° O`;

	// Fredagen sätts fet. Arket hänger i en farstu och skannas på håll, och fredagen är
	// den dag läsaren letar efter — jumuʿa ersätter Ẓuhr. Ingen annan gråskala: en tonad
	// rad som ser tydlig ut på skärmen försvinner i en laserutskrift.
	const cell = (v: string, friday: boolean) => (friday ? `strong(${q(v)})` : q(v));
	const body = rows
		.map((r) => {
			const fri = r.weekday === "fre";
			const cells = [String(r.day), r.weekday, ...r.times].map((v) => cell(v, fri));
			return `  ${cells.join(", ")},`;
		})
		.join("\n");

	return `#set page(
  paper: "a4",
  margin: (x: 1.8cm, y: 1.6cm),
  footer: context [
    #set text(size: 7.5pt, fill: luma(40%))
    #grid(columns: (1fr, auto),
      align: (left, right),
      [Beräknat efter solens läge (Muslim World League, shafii) i tidszonen Europe/Stockholm.],
      [islam.se/bonetider/${place.slug}/],
    )
  ],
)
#set text(font: "Source Sans 3", size: 9.5pt, lang: "sv")
#show heading: set text(font: "Literata")

#heading(level: 1, outlined: false)[Bönetider i ${place.name}]
#text(size: 11pt, fill: luma(30%))[${monthName}]
#linebreak()
#text(size: 8.5pt, fill: luma(45%))[${where}${coords}]
#v(0.5em)

#table(
  columns: (auto, auto, 1fr, 1fr, 1fr, 1fr, 1fr, 1fr),
  align: (right, left, center, center, center, center, center, center),
  stroke: none,
  inset: (x: 4pt, y: 3.2pt),
  table.header(
    [], [], [*Fajr*], [*Shurūq*], [*Ẓuhr*], [*ʿAṣr*], [*Maghrib*], [*ʿIshāʾ*],
  ),
  table.hline(stroke: 0.5pt),
${body}
)
`;
}

/**
 * Månadens bönetider för en ort som PDF-byte.
 *
 * ⚠️ Anropar `typst` som underprocess. Binären finns på byggmaskinen och på
 * deploy-värden (mise), och `pnpm pdf` har krävt den sedan samlingsvolymen kom till.
 * Saknas den kastar den här funktionen — hellre ett brutet bygge än en deploy där
 * länken går till en 404, eftersom Cloudflare Pages är en ögonblicksbild av dist/.
 */
export function monthPdf(place: PdfPlace, now = new Date()): Buffer {
	pruneOldGenerations();
	const year = now.getUTCFullYear();
	const month = now.getUTCMonth();
	const key = `${place.slug}-${year}-${String(month + 1).padStart(2, "0")}`;
	const cached = join(GEN_DIR, `${key}.pdf`);
	try {
		if (existsSync(cached)) return readFileSync(cached);
	} catch {
		// Oläsbar cachepost — fall igenom och rendera om.
	}

	mkdirSync(WORK_DIR, { recursive: true });
	// Filnamnet bär nyckeln: Astro renderar sidor parallellt, och en delad temp-fil
	// hade låtit två orter skriva över varandras underlag mitt i kompileringen.
	const typPath = join(WORK_DIR, `${key}.typ`);
	const outPath = join(WORK_DIR, `${key}.pdf`);
	writeFileSync(typPath, document(place, year, month));
	try {
		execFileSync("typst", ["compile", "--font-path", FONTS_DIR, typPath, outPath], {
			stdio: "pipe",
		});
		const pdf = readFileSync(outPath);
		try {
			mkdirSync(GEN_DIR, { recursive: true });
			writeFileSync(cached, pdf);
		} catch {
			// En cache som inte går att skriva får inte fälla bygget.
		}
		return pdf;
	} finally {
		for (const f of [typPath, outPath]) {
			try {
				if (existsSync(f)) unlinkSync(f);
			} catch {
				// Städningen får inte maskera ett riktigt fel från typst.
			}
		}
	}
}
