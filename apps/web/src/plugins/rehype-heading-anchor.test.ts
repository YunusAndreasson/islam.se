import { describe, expect, it } from "vitest";
import { rehypeHeadingAnchor } from "./rehype-heading-anchor";

/**
 * The permalink a reader uses to hand someone one section of a 14-minute essay instead of
 * the whole thing. Astro's slugger puts the `id` on the heading; this pass puts something
 * on the page that points at it.
 *
 * ⚠️ ORDER. Astro adds those ids with its OWN rehype pass, which runs AFTER the user
 * plugin list — so this plugin has to be LAST in astro.config.ts. Anywhere earlier it
 * walks headings that have no id yet, matches nothing, and ships no permalinks at all,
 * silently and on every page. That is exactly how it failed the first time it was wired
 * up, which is why `skips a heading that has no id yet` is here.
 */

interface El {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children: Array<El | { type: "text"; value: string }>;
}

const h = (tagName: string, id: string | undefined, text: string): El => ({
	type: "element",
	tagName,
	properties: id === undefined ? {} : { id },
	children: [{ type: "text", value: text }],
});

const root = (...children: El[]): El => ({ type: "root", children });

const run = (tree: El): El => {
	rehypeHeadingAnchor()(tree as never);
	return tree;
};

const anchorsIn = (tree: El): Array<Record<string, unknown>> => {
	const found: Array<Record<string, unknown>> = [];
	const walk = (n: { children?: Array<El | { type: string }> }) => {
		for (const c of n.children ?? []) {
			const el = c as El;
			if (el.tagName === "a") found.push(el.properties ?? {});
			walk(el);
		}
	};
	walk(tree);
	return found;
};

describe("rehypeHeadingAnchor", () => {
	it("gives h2 and h3 a permalink pointing at their own id", () => {
		const tree = run(root(h("h2", "medlemskortet", "Medlemskortet"), h("h3", "en-not", "En not")));
		expect(anchorsIn(tree).map((p) => p.href)).toEqual(["#medlemskortet", "#en-not"]);
	});

	it("names the section in the label, since the visible mark is only »#«", () => {
		const tree = run(root(h("h2", "vad-siffrorna-mater", "Vad siffrorna mäter")));
		expect(anchorsIn(tree)[0]?.ariaLabel).toBe("Länk till avsnittet Vad siffrorna mäter");
	});

	it("appends the anchor, so a screen reader hears the section before the permalink", () => {
		const tree = run(root(h("h2", "x", "Rubriken")));
		const heading = tree.children[0] as El;
		expect((heading.children[0] as { value: string }).value).toBe("Rubriken");
		expect((heading.children[1] as El).tagName).toBe("a");
	});

	it("skips a heading that has no id yet — the ordering trap", () => {
		// Astro has not run its slugger at this point. If the plugin is placed before that
		// pass, EVERY heading looks like this and the whole feature silently does nothing.
		expect(anchorsIn(run(root(h("h2", undefined, "Ingen id ännu"))))).toEqual([]);
	});

	it("leaves the GFM footnote heading alone", () => {
		// Not a section of the article; Innehall.astro filters it out of the contents too.
		expect(anchorsIn(run(root(h("h2", "footnote-label", "Fotnoter"))))).toEqual([]);
	});

	it("does not touch h1 or h4", () => {
		const tree = run(root(h("h1", "titeln", "Titeln"), h("h4", "djupt", "Djupt")));
		expect(anchorsIn(tree)).toEqual([]);
	});

	it("is idempotent — a second pass adds no second mark", () => {
		const tree = root(h("h2", "en-rubrik", "En rubrik"));
		run(tree);
		run(tree);
		expect(anchorsIn(tree)).toHaveLength(1);
	});
});
