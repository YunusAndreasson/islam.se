// COPYING TO THE CLIPBOARD, said once. The share button, the news rows' share links, the
// screen builder's address and the code on /ai/ each wrote the try/catch around
// `navigator.clipboard`, and said »Kopierad« or »Länk kopierad« as each saw fit.

/** Writes `text` to the clipboard. False where the browser refuses — no secure context, no
 *  permission, no API — so the caller falls back to what it has: a selection, the address
 *  bar, the text on screen. Never claim a copy that did not happen. */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/** Says `text` in `el` for a moment, then puts back what was there (unless something else
 *  has been said there since). */
export function flashText(el: HTMLElement, text: string, ms = 2000): void {
	const before = el.textContent;
	el.textContent = text;
	setTimeout(() => {
		if (el.textContent === text) el.textContent = before;
	}, ms);
}

/** The device's share sheet where it has one; elsewhere the address on the clipboard.
 *  »shared« covers a sheet the reader dismissed too: nothing more is owed then. */
export async function shareOrCopy(data: {
	title: string;
	url: string;
}): Promise<"shared" | "copied" | "failed"> {
	if (navigator.share) {
		try {
			await navigator.share(data);
		} catch {
			// Dismissed, or the sheet failed: the reader has seen it either way.
		}
		return "shared";
	}
	return (await copyText(data.url)) ? "copied" : "failed";
}
