// Shared Swedish number formatters. Cached module-level instances (constructing an
// Intl.NumberFormat is not free) reused across the bönetider/moskeer pages, which
// each previously declared their own identical `nf0`. Swedish locale gives the
// space-grouped thousands ("4 102") the design calls for.

/** Integer — no decimals (populations, densities, counts). */
export const nf0 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

/** One decimal (areas, solar-depression degrees). */
export const nf1 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });
