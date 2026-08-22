// The front page's day-stamp — "fredag 22 augusti · 8 Ṣafar 1448".
//
// A publication says what day it is. The front page carried no date anywhere
// above the feature's own byline: the news rail ran clocks against headlines
// while the page around it never established which day those clocks belonged
// to, which is the difference between a magazine and a folder of files.
//
// Rendered at build time so the line is in the served HTML — no flash, and a
// reader without JavaScript still gets a date — and corrected on the client,
// because this site is built statically and shipped by hand. A hard date in
// static HTML is already a day old the morning after a deploy, and a stale date
// on the front page of something presenting itself as a publication is the one
// kind of error that costs trust rather than merely clarity.

import { hijriLabel } from "./markesdagar";

// Declared here rather than imported from bonetider/prayer-times, which owns the
// canonical `TIME_ZONE`: that module carries the solar math, and pulling it into
// a client bundle to read one string would cost several kilobytes for a word.
const TIDSZON = "Europe/Stockholm";

const svenskaOrd = new Intl.DateTimeFormat("sv-SE", {
	weekday: "long",
	day: "numeric",
	month: "long",
	timeZone: TIDSZON,
});

// The same instant as NUMBERS, so the Hijri conversion can be anchored to the
// Swedish calendar day. The build runs wherever it runs and the reader's laptop
// is wherever it is; neither is necessarily Sweden.
const svenskaSiffror = new Intl.DateTimeFormat("sv-SE", {
	year: "numeric",
	month: "numeric",
	day: "numeric",
	timeZone: TIDSZON,
});

/** "fredag 22 augusti · 8 Ṣafar 1448" for the given instant, read in Sweden. */
export function dagstampel(now: Date): string {
	const delar = svenskaSiffror.formatToParts(now);
	const tal = (typ: string) => Number.parseInt(delar.find((p) => p.type === typ)?.value ?? "0", 10);

	// ⚠️ Noon UTC, per hijriLabel's own warning: its formatter reads the instant in
	// UTC, so handing it `new Date()` shortly after Swedish midnight returns
	// yesterday's Hijri date — which is exactly when the nightly rebuild runs.
	const middag = new Date(Date.UTC(tal("year"), tal("month") - 1, tal("day"), 12));

	return `${svenskaOrd.format(now)} · ${hijriLabel(middag)}`;
}
