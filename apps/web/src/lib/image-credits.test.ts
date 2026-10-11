import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IMAGE_CREDITS, imageKey, inlineFigures, publishFigureLines } from "./image-credits";

const ASSETS = new URL("../assets/images/", import.meta.url);
const DATA = new URL("../../../../data/", import.meta.url);

/** Every figure the three text collections set, with the file that sets it. */
function placedFigures(): { key: string; file: string }[] {
	const placed: { key: string; file: string }[] = [];
	for (const collection of ["articles", "svar", "fordjupning"]) {
		const dir = new URL(`${collection}/`, DATA);
		for (const name of readdirSync(dir)) {
			if (!name.endsWith(".md")) continue;
			const body = readFileSync(new URL(name, dir), "utf8");
			for (const figure of inlineFigures(body)) {
				placed.push({ key: figure.key, file: `data/${collection}/${name}` });
			}
		}
	}
	return placed;
}

// The seven photographs in the two Gaza essays predate the registry. They are credited
// where a reader finds it, in each essay's first note; the registry has no entry for
// them yet, so their structured data asserts no licence. Add the entry and delete the
// line: the list may only shrink.
const CREDITED_IN_THE_NOTES_ONLY = new Set([
	"inline/gaza-flicka-pa-gatan",
	"inline/gaza-flygblad-oktober-2023",
	"inline/gaza-forstort-hus",
	"inline/gaza-fotografen-i-arbete",
	"inline/gaza-lasning-vid-ljus",
	"inline/gaza-stad-skymning-oktober-2023",
	"inline/gaza-vaggmalning",
]);

describe("image credits", () => {
	it("records a credit for every photograph set inside a text", () => {
		const missing = placedFigures()
			.filter(({ key }) => !(IMAGE_CREDITS[key] || CREDITED_IN_THE_NOTES_ONLY.has(key)))
			.map(({ key, file }) => `${key} (${file})`);
		expect(
			missing,
			"a picture that is not ours needs an entry in src/data/image-credits.json: without it the page's structured data cannot state its licence, and nothing records where it came from",
		).toEqual([]);
	});

	it("names only files that exist", () => {
		const orphans = Object.keys(IMAGE_CREDITS).filter(
			(key) => !existsSync(new URL(`${key}.webp`, ASSETS)),
		);
		expect(
			orphans,
			"an entry whose picture is gone credits nothing; delete it with the file",
		).toEqual([]);
	});

	it("gives every entry a source page and a licence deed to link to", () => {
		for (const [key, credit] of Object.entries(IMAGE_CREDITS)) {
			expect(credit.by, `${key}: nobody to credit`).not.toBe("");
			expect(credit.source, `${key}: the source must be a page a reader can open`).toMatch(
				/^https:\/\//,
			);
			expect(credit.licenceUrl, `${key}: the licence must link to its deed`).toMatch(
				/^https:\/\/creativecommons\.org\//,
			);
		}
	});
});

describe("inlineFigures", () => {
	const path = "../../apps/web/src/assets/images/inline/kaba-1880-sadiq-bey.webp";

	it("reads the key, the alt text and the caption of a photograph on its own line", () => {
		const body = `Stycke ett.\n\n![Kaba i mörkt tyg.](${path} "Kaba 1880 (Mecka).")\n\nStycke två.`;
		expect(inlineFigures(body)).toEqual([
			{
				key: "inline/kaba-1880-sadiq-bey",
				alt: "Kaba i mörkt tyg.",
				caption: "Kaba 1880 (Mecka).",
			},
		]);
	});

	// The figure plugin only lifts an image that has a paragraph to itself; an image in
	// a sentence is not a figure and must not be listed in the sitemap as one.
	it("ignores an image that sits inside a sentence", () => {
		expect(inlineFigures(`Före ![x](${path}) efter.`)).toEqual([]);
	});

	it("derives the key from the folder and the file name, whatever the extension", () => {
		expect(imageKey("../assets/images/fakta/vad-ar-hajj.webp")).toBe("fakta/vad-ar-hajj");
		expect(imageKey("https://example.com/bild.jpg")).toBeUndefined();
	});
});

describe("publishFigureLines", () => {
	const line =
		'![Kaba.](../../apps/web/src/assets/images/inline/kaba-1880-sadiq-bey.webp "Kaba 1880.")';

	// The Markdown twins used to quote the repository path, `../../apps/web/src/…`: a
	// link to nowhere for the language models the twins are written for.
	it("swaps the repository path for the published URL and keeps alt and caption", () => {
		const out = publishFigureLines(
			`Före.\n\n${line}\n\nEfter.`,
			() => "https://islam.se/_astro/kaba.webp",
		);
		expect(out).toBe('Före.\n\n![Kaba.](https://islam.se/_astro/kaba.webp "Kaba 1880.")\n\nEfter.');
	});

	it("drops a figure it cannot resolve instead of leaving a dead path", () => {
		expect(publishFigureLines(`Före.\n\n${line}\n\nEfter.`, () => undefined)).not.toContain(
			"apps/web",
		);
	});
});
