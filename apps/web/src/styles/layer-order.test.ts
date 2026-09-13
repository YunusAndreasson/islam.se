import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Cascade layers rank by FIRST mention, not by where tokens.css declares them. The build
// inlines each page's stylesheets as one <style> in module-graph order, so whichever layered
// file lands first in that string decides the order for the whole page.
//
// Deploy f643b4e4 (2026-09-13) shipped with layout.css inlined ahead of tokens.css and
// reset.css — the front page had gained components that import stylesheets before the
// layout does. The effective order became primitives, layout, components, reset, base: the
// reset's `* { margin: 0 }` outranked `.home { margin-inline: auto }` and every page's
// content sat on the left edge. The source looked right, the dev server (which injects each
// file on its own) looked right, and nothing in `pnpm verify` noticed.
//
// So every stylesheet that opens a named layer restates the full order before its first
// block, and whichever the bundler emits first carries the whole order.
const SRC = new URL("../", import.meta.url).pathname;
const STATEMENT = /@layer\s+([a-z-]+(?:\s*,\s*[a-z-]+)+)\s*;/;
const BLOCK = /@layer\s+[a-z-]+\s*\{/;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.(css|astro)$/.test(entry.name) ? [path] : [];
	});
}

const normalise = (names: string) =>
	names
		.split(",")
		.map((name) => name.trim())
		.join(", ");

describe("cascade layer order", () => {
	const tokens = readFileSync(join(SRC, "styles/tokens.css"), "utf8").match(STATEMENT);

	it("is declared once, in tokens.css", () => {
		expect(tokens, "tokens.css lost its @layer order statement").not.toBeNull();
	});

	it("is restated ahead of the first layer block in every file that opens one", () => {
		const order = normalise(tokens?.[1] ?? "");
		const offenders = sourceFiles(SRC).flatMap((file) => {
			const text = readFileSync(file, "utf8");
			const block = text.search(BLOCK);
			if (block === -1) return [];
			const statement = text.match(STATEMENT);
			const ok =
				statement?.index !== undefined &&
				statement.index < block &&
				normalise(statement[1] ?? "") === order;
			return ok ? [] : [relative(SRC, file)];
		});
		expect(
			offenders,
			`These files open an @layer block without first restating "@layer ${order};". If the build ` +
				"inlines one of them ahead of tokens.css, its layer is ranked first and the page's layer " +
				"order silently changes (see the comment at the top of this file).",
		).toEqual([]);
	});
});
