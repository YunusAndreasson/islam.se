/** The two honorifics and what they say. One table for the three places that set one: a
 *  markdown body (plugins/rehype-honorific.ts), an .astro page (components/Honorific.astro)
 *  and the text from a frontmatter deck (inlineMarkdown in lib/articles.ts). */
export const HONORIFICS = {
	/** ﷺ, after the Prophet's name. */
	saw: {
		glyph: "ﷺ",
		sv: "Guds frid och välsignelser vare över honom",
		tip: "sallallahu alayhi wa sallam – Guds frid och välsignelser vare över honom",
	},
	/** ﷻ, after God's. */
	swt: {
		glyph: "ﷻ",
		sv: "upphöjd är Hans majestät",
		tip: "jalla jalaluhu – upphöjd är Hans majestät",
	},
} as const;

export type HonorificCode = keyof typeof HONORIFICS;

/** Every glyph in a string of HTML, set as the sign the stylesheet draws: labelled for a
 *  screen reader, which otherwise spells out a ligature's name, and explained on hover. */
export function honorificsToHtml(html: string): string {
	return html.replace(/[ﷺﷻ]/gu, (glyph) => {
		const code: HonorificCode = glyph === HONORIFICS.swt.glyph ? "swt" : "saw";
		const { sv, tip } = HONORIFICS[code];
		return `<span class="honorific honorific--${code}" role="img" aria-label="${sv}" data-tip="${tip}" tabindex="-1">${glyph}</span>`;
	});
}
