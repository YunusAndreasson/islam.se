/**
 * The mosque chart in `data/fordjupning/moske.md` is hand-written numbers copied out of
 * `src/data/moskeer-sverige.json`. This asserts they still agree.
 *
 * WHY. The JSON is canonical and gets re-imported wholesale by `scripts/build-moskeer.ts`
 * (see CLAUDE.md), and it is edited by hand to correct or remove a mosque. Nothing about
 * either operation touches the markdown. So the chart can silently start stating a
 * distribution the site's own map contradicts — on the page whose top search query is
 * »hur många moskéer finns i Sverige«, and with the two figures visible side by side to
 * any reader who clicks through to /moskeer.
 *
 * This is the same failure the mosque dataset already had once: web and mobile diverged
 * for three weeks in 2026-07 because a copy step was simply never run, and the app shipped
 * seven duplicate mosques and a Landskrona mosque placed in Göteborg. A number that lives
 * in two files needs a test, not a resolution to be careful.
 *
 * When this fails, the fix is to regenerate the chart's data block from the JSON — not to
 * edit the expectation.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseChartSpec } from "./spec.ts";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const MD = join(REPO, "data/fordjupning/moske.md");
const JSON_PATH = join(REPO, "apps/web/src/data/moskeer-sverige.json");

interface Mosque {
	lan: string;
}

describe("moské-diagrammet mot moskeer-sverige.json", () => {
	const md = readFileSync(MD, "utf8");
	const fence = /^```chart\n([\s\S]*?)^```/m.exec(md);

	it("har kvar sitt diagram", () => {
		expect(
			fence,
			"moske.md har ingen ```chart-fence längre. Togs diagrammet bort med flit? " +
				"Ta då bort den här testfilen också, i stället för att låta den falla.",
		).not.toBeNull();
	});

	it("stämmer med underlaget, län för län", () => {
		const spec = parseChartSpec(fence?.[1] ?? "");
		const mosques: Mosque[] = JSON.parse(readFileSync(JSON_PATH, "utf8"));

		const actual = new Map<string, number>();
		for (const m of mosques) actual.set(m.lan, (actual.get(m.lan) ?? 0) + 1);

		const charted = new Map(spec.data.map((d) => [d.label, d.values[0] ?? 0]));

		const drift = [...new Set([...actual.keys(), ...charted.keys()])]
			.map((lan) => ({ lan, i: actual.get(lan) ?? 0, d: charted.get(lan) ?? 0 }))
			.filter((r) => r.i !== r.d);

		expect(
			drift,
			"Diagrammet i moske.md och moskeer-sverige.json säger olika saker:\n" +
				drift.map((r) => `  ${r.lan}: underlaget ${r.i}, diagrammet ${r.d}`).join("\n") +
				"\nRegenerera datablocket ur JSON-filen — ändra inte förväntan här.",
		).toEqual([]);
	});

	it("summerar till hela underlaget, så inget län tappas bort", () => {
		const spec = parseChartSpec(fence?.[1] ?? "");
		const mosques: Mosque[] = JSON.parse(readFileSync(JSON_PATH, "utf8"));
		const charted = spec.data.reduce((sum, d) => sum + (d.values[0] ?? 0), 0);

		expect(
			charted,
			`Diagrammet visar ${charted} moskéer men underlaget har ${mosques.length}. ` +
				"Ett län har tillkommit i JSON-filen utan att hamna i diagrammet.",
		).toBe(mosques.length);
	});
});
