// The two RFC 5545 text rules every .ics this site writes has to follow — the prayer
// calendar per town (lib/bonetider/ics.ts) and the Islamic year
// (pages/det-islamiska-aret.ics.ts). They were two copies, identical to the byte.
//
// ⚠️ lib/bonetider/ics.ts hashes this file into its disk-cache generation. A change
// here re-renders every cached town calendar, as it must: the bytes would change.

/** Escape a TEXT value per RFC 5545 §3.3.11. */
export function escapeText(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold a content line to ≤75 octets (RFC 5545 §3.1); continuations get a leading space. */
export function foldLine(line: string): string {
	const enc = new TextEncoder();
	let out = "";
	let cur = "";
	let bytes = 0;
	for (const ch of line) {
		const b = enc.encode(ch).length;
		// 73 keeps the continuation's leading space within the 75-octet limit.
		if (bytes + b > 73) {
			out += (out ? "\r\n " : "") + cur;
			cur = ch;
			bytes = b;
		} else {
			cur += ch;
			bytes += b;
		}
	}
	return out + (out ? "\r\n " : "") + cur;
}
