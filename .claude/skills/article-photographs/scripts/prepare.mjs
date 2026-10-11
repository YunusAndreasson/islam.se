// prepare.mjs <run> — crop, resize and encode the chosen pictures.
//
//   node .claude/skills/article-photographs/scripts/prepare.mjs <run>
//
// Reads <run>/final.json and, for every picture, reads the licence back from the Commons
// API (never from what a search returned), fetches a large rendition, crops, resizes to
// the site's inline width and encodes a WebP master. Writes <run>/final/<id>.webp, a
// small <run>/final/_preview/<id>.webp for the review page, and <run>/final/forslag.json,
// which gallery.py and place.py read. Re-runs reuse the download, so changing a crop is
// cheap. The run directory is $BILDER_WORK/<run> (default ~/.cache/islam-se-bilder).
//
// final.json is a list:
//
//   { "id": "gaza-koranblad-i-rasmassorna",          the file name: Swedish, says what it shows
//     "commons": "File:Gaza war 2023 - 2025 IMG 3876.jpg",
//     "crop": [0, 0.12, 1, 0.66],                     x, y, width, height as fractions; optional
//     "width": 1100,                                  optional: 1400 inline, 1100 upright, 1800 card
//     "saturation": 0.78,                             optional, only to pull back a colour cast
//     "role": "inline",                               or "card" (a Pelare & tro card and its hero)
//     "creditName": "Jaber Jehad Badwan / Wikimedia Commons",
//     "creditKind": "Foto",                           »Bild« for a reproduction of a page or an object
//     "texts": [{ "file": "data/articles/x.md", "section": "Rubriken", "after": "words that end the paragraph" }],
//     "alt": "…", "caption": "…",
//     "verdict": "use",                               or "maybe": shown as »for your eye«
//     "note": "what the user should know before choosing" }
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const sharp = createRequire(join(ROOT, "apps/web/package.json"))("sharp");
const run = process.argv[2];
if (!run) {
	console.error("prepare.mjs <run>");
	process.exit(1);
}
const runDir = join(process.env.BILDER_WORK ?? join(homedir(), ".cache/islam-se-bilder"), run);
const outDir = join(runDir, "final");
const UA = "islam.se-bildsok/1.0 (https://islam.se)";
// The reading column is 42rem (672 px): 1400 px is a shade over 2×. An upright picture
// is shown at the same column width, so 1100 is already more than it needs.
const MASTER_WIDTH = 1400;
const CARD_WIDTH = 1800;
const strip = (s) =>
	(s ?? "")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as = "json") {
	for (let i = 0; i < 5; i++) {
		const res = await fetch(url, { headers: { "User-Agent": UA } });
		if (res.status === 429 || res.status >= 500) {
			await sleep(5000 * (i + 1));
			continue;
		}
		if (!res.ok) throw new Error(`${res.status} ${url}`);
		return as === "json" ? res.json() : Buffer.from(await res.arrayBuffer());
	}
	throw new Error(`gave up: ${url}`);
}

async function commons(title) {
	const data = await get(
		"https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=3840&titles=" +
			encodeURIComponent(title),
	);
	const ii = Object.values(data.query.pages)[0]?.imageinfo?.[0];
	if (!ii) throw new Error(`not on Commons: ${title}`);
	const m = ii.extmetadata ?? {};
	return {
		page: ii.descriptionurl,
		// The 3840 px rendition when the original is larger, otherwise the original.
		fetchUrl: ii.width > 3840 ? ii.thumburl : ii.url,
		width: ii.width,
		height: ii.height,
		licence: strip(m.LicenseShortName?.value),
		artist: strip(m.Artist?.value),
	};
}

/** The deed a licence's short name stands for; the registry and the JSON-LD want the URL. */
function licenceUrl(name) {
	if (/^cc0/i.test(name)) return "https://creativecommons.org/publicdomain/zero/1.0/";
	if (/public domain|^pdm/i.test(name)) return "https://creativecommons.org/publicdomain/mark/1.0/";
	const m = /^CC (BY(?:-SA)?) (\d\.\d)( IGO)?$/i.exec(name);
	if (!m) throw new Error(`no deed known for the licence »${name}« — is it free at all?`);
	return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${m[3] ? "igo/" : ""}`;
}

mkdirSync(join(outDir, "_preview"), { recursive: true });
const items = JSON.parse(readFileSync(join(runDir, "final.json"), "utf8"));
const out = [];
for (const it of items) {
	const src = await commons(it.commons);
	if (/\b(nc|nd)\b/i.test(src.licence))
		throw new Error(`${it.id}: ${src.licence} is not a free licence`);
	// Each download lands in a directory of its own.
	const dlDir = join(outDir, "_orig", it.id);
	mkdirSync(dlDir, { recursive: true });
	const cached = join(dlDir, "original");
	const raw = existsSync(cached) ? readFileSync(cached) : await get(src.fetchUrl, "buffer");
	if (!existsSync(cached)) writeFileSync(cached, raw);

	let img = sharp(raw, { limitInputPixels: 400e6 }).rotate();
	const meta = await img.metadata();
	const [W, H] = meta.orientation >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
	if (it.crop) {
		const [x, y, w, h] = it.crop;
		img = img.extract({
			left: Math.round(x * W),
			top: Math.round(y * H),
			width: Math.round(w * W),
			height: Math.round(h * H),
		});
	}
	const role = it.role ?? "inline";
	const target = it.width ?? (role === "card" ? CARD_WIDTH : MASTER_WIDTH);
	img = img.resize({ width: target, withoutEnlargement: true, kernel: "lanczos3" });
	// A phone picture taken through tinted glass: pull the colour cast back, nothing more.
	if (it.saturation) img = img.modulate({ saturation: it.saturation });
	const file = join(outDir, `${it.id}.webp`);
	// sharp drops EXIF/XMP by default: the credit travels in forslag.json, not in the file.
	const info = await img
		.clone()
		.flatten({ background: "#ffffff" })
		.webp({ quality: it.quality ?? 80, effort: 6, smartSubsample: true })
		.toFile(file);
	await img
		.clone()
		.resize({ width: 900, withoutEnlargement: true })
		.webp({ quality: 72 })
		.toFile(join(outDir, "_preview", `${it.id}.webp`));

	const changed = [it.crop ? "beskuren" : "", it.saturation ? "färgbearbetad" : ""]
		.filter(Boolean)
		.join(" och ");
	const who = it.creditName ?? src.artist;
	const pd = /public domain|cc0|^pdm/i.test(src.licence);
	const kind = it.creditKind ?? (pd ? "Bild" : "Foto");
	out.push({
		id: it.id,
		file: `${it.id}.webp`,
		role,
		width: info.width,
		height: info.height,
		bytes: statSync(file).size,
		texts: it.texts,
		alt: it.alt,
		caption: it.caption,
		markdown:
			role === "inline"
				? `![${it.alt}](../../apps/web/src/assets/images/inline/${it.id}.webp "${it.caption}")`
				: "",
		kind,
		author: who,
		licence: src.licence,
		licenceUrl: licenceUrl(src.licence),
		source: src.page,
		changed,
		credit: `${kind}: ${who}, ${pd ? "fri från upphovsrätt" : src.licence}${changed ? `, ${changed}` : ""}.`,
		original: `${src.width}×${src.height}`,
		note: it.note ?? "",
		verdict: it.verdict ?? "maybe",
	});
	console.log(
		`${it.id.padEnd(46)} ${info.width}×${info.height} ${(statSync(file).size / 1024).toFixed(0).padStart(4)} kB  ${src.licence}`,
	);
	await sleep(600);
}
writeFileSync(join(outDir, "forslag.json"), `${JSON.stringify(out, null, "\t")}\n`);
console.log(`${out.length} files → ${outDir}`);
