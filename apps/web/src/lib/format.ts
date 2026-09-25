// Shared Swedish number formatters. Cached module-level instances (constructing an
// Intl.NumberFormat is not free) reused across the bönetider/moskeer pages, which
// each previously declared their own identical `nf0`. Swedish locale gives the
// space-grouped thousands ("4 102") the design calls for.

/** Integer — no decimals (populations, densities, counts). */
export const nf0 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

/** One decimal (areas, solar-depression degrees). */
export const nf1 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

/** Swedish genitive of a place name. A name ending in s, x or z takes no extra s:
 *  »Borås breddgrad«, »Västerås stadsdelar« — the template's naive `${name}s` printed
 *  »Boråss« and »Västeråss« on every such page. */
export function genitive(name: string): string {
	return /[sxz]$/i.test(name) ? name : `${name}s`;
}

/** »Stockholms kommun«, »Malmö kommun«, »Borås kommun«: the official form adds a
 *  genitive s only after a consonant other than s, x or z. The template's
 *  `${kommun} kommun` printed »Stockholm kommun«. */
export function kommunLabel(kommun: string): string {
	return /[aeiouyåäö]$/i.test(kommun) ? `${kommun} kommun` : `${genitive(kommun)} kommun`;
}
