import { getUpcomingMarkesdagar } from "../lib/markesdagar";

// iCal subscription feed for the Islamic year (§7.9). Static build artifact:
// the upcoming observances as of build time, as all-day VEVENTs. Subscribable
// over webcal:// or downloadable as .ics. No dependency — RFC 5545 is small.

const compact = (iso: string) => iso.replace(/-/g, "");

/** All-day DTEND is exclusive: the day after the last day. */
function dayAfter(iso: string): string {
	return new Date(new Date(`${iso}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/** Escape a TEXT value per RFC 5545 §3.3.11. */
function esc(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Stable, ASCII UID stem from the observance name (diacritics stripped). */
function uidStem(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Fold a content line to ≤75 octets (RFC 5545 §3.1); continuations get a leading space. */
function fold(line: string): string {
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

export async function GET() {
	const events = getUpcomingMarkesdagar();
	const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");

	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//islam.se//Det islamiska året//SV",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"X-WR-CALNAME:Det islamiska året",
		"X-WR-CALDESC:Islamiska högtider och märkesdagar — islam.se",
		"X-WR-TIMEZONE:UTC",
	];

	for (const e of events) {
		const desc = e.note ? `${e.note} (${e.hijriLabel})` : e.hijriLabel;
		lines.push(
			"BEGIN:VEVENT",
			`UID:${uidStem(e.name)}-${e.startISO}@islam.se`,
			`DTSTAMP:${stamp}`,
			`DTSTART;VALUE=DATE:${compact(e.startISO)}`,
			`DTEND;VALUE=DATE:${compact(dayAfter(e.endISO ?? e.startISO))}`,
			`SUMMARY:${esc(e.name)}`,
			`DESCRIPTION:${esc(desc)}`,
			"TRANSP:TRANSPARENT",
			"END:VEVENT",
		);
	}
	lines.push("END:VCALENDAR");

	const body = `${lines.map(fold).join("\r\n")}\r\n`;
	return new Response(body, {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Content-Disposition": 'inline; filename="det-islamiska-aret.ics"',
		},
	});
}
