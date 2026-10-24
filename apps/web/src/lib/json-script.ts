// Data a page hands its own script, as a <script type="application/json"> (JsonScript.astro).
// The one rule is the escape. JSON.stringify leaves `<` alone, so a value carrying
// »</script>« would end the element early and the rest would parse as HTML; the data is
// the site's own, but some of it comes from hand-edited JSON files. Five writers each kept
// a copy of the replace and a sixth had none, and five readers each wrapped JSON.parse.

/** JSON that cannot close the <script> it sits in. */
export function jsonForScript(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** The payload of a JSON <script>, or `fallback` when the element is missing, empty or
 *  does not parse. The shape is the writer's; nothing here checks it. */
export function readJsonScript<T>(el: Element | null | undefined, fallback: T): T {
	const raw = el?.textContent;
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}
