// The excerpt gate. Model motivations are quoted verbatim on reader-facing pages, and the
// models do not know the site's rules (CLAUDE.md): no shia or sufi content left standing,
// no school labels, and never the pronoun »hen«. Quoted text is never edited, so a
// motivation that trips the gate is simply not quoted unless a human has approved it with
// `pnpm ai-barometern review --approve`.
//
// ⚠️ Word boundaries are Unicode-aware lookarounds, not `\b`: JavaScript's `\b` treats å, ä
// and ö as non-word characters, so it finds a "boundary" in the middle of Swedish words.
// `(?<!\p{L})` / `(?!\p{L})` test for a real letter on either side, which keeps »henne«,
// »hennes« and »Henrik« out while still catching »hen« and »hens«.

const GATE = new RegExp(
	[
		"shia\\p{L}*",
		"shiit\\p{L}*",
		"jaʿfar\\p{L}*",
		"ja'far\\p{L}*",
		"jafarit\\p{L}*",
		"tolvshi\\p{L}*",
		"imamit\\p{L}*",
		"khamsa",
		"marjaʿ",
		"sufi\\p{L}*",
		"tariqa\\p{L}*",
		"tasawwuf",
		"hen",
		"hens",
		"henom",
		"salafi\\p{L}*",
		"wahhab\\p{L}*",
		"athari\\p{L}*",
		"sunnitisk\\p{L}*",
	]
		.map((p) => `(?<!\\p{L})${p}(?!\\p{L})`)
		.join("|"),
	"giu",
);

/** Every gate word in `text`, lower-cased, in order of appearance. */
export function gateHits(text: string): string[] {
	return [...text.matchAll(GATE)].map((m) => m[0].toLowerCase());
}

export function passesGate(text: string): boolean {
	return gateHits(text).length === 0;
}
