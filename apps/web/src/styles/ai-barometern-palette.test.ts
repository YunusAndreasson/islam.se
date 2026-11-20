import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// AI-barometern draws a model's answer as a meter of four blocks filled in brass
// (components/ai-barometern/AnswerMeter.astro), on the front page and on every page of its
// own. Until 2026-11-20 the hub drew the same scale as »++ / + / A« chips on a blue↔brass
// scale while the front page drew meters: one answer, two marks, and the only second hue on
// the site's pages. The blue was the wordmark's ring (--mark-blue) retyped as hex in the
// chips' stylesheet, so this looks for both the token and the hexes it was written as.
const STYLES = new URL("./", import.meta.url).pathname;
const COMPONENTS = new URL("../components/ai-barometern/", import.meta.url).pathname;
const BLUE = /--mark-blue|#2a557f|#7c93aa|#4b739d|#394d61/i;

const sheets = [
	...readdirSync(STYLES)
		.filter((name) => name.startsWith("ai-barometern") && name.endsWith(".css"))
		.map((name) => join(STYLES, name)),
	...readdirSync(COMPONENTS)
		.filter((name) => name.endsWith(".astro"))
		.map((name) => join(COMPONENTS, name)),
];

describe("AI-barometern's palette", () => {
	it("finds the barometer's stylesheets and components", () => {
		expect(sheets.length).toBeGreaterThan(5);
	});

	it.each(sheets)("%s charts in ink and brass, without the blue pole", (file) => {
		expect(
			readFileSync(file, "utf8"),
			"an answer is the brass meter (AnswerMeter.astro); a blue pole brings back the second drawing of the one scale",
		).not.toMatch(BLUE);
	});
});
