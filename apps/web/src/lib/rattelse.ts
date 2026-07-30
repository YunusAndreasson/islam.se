// Turnstile sitekeys are public by design — this one is rendered into the page.
// Its secret half lives in the Pages project as TURNSTILE_SECRET.
//
// The real widget only accepts islam.se and islam-se.pages.dev, so a local run has
// to be built with PUBLIC_TURNSTILE_SITEKEY set to one of Cloudflare's test keys
// (1x00000000000000000000AA passes, 2x00000000000000000000AB blocks).
export const TURNSTILE_SITEKEY =
	import.meta.env.PUBLIC_TURNSTILE_SITEKEY || "0x4AAAAAAEBJA3MY-Ogo72_S";

/** Link to the correction form with the reader's current page already filled in. */
export function rattelseHref(path: string): string {
	return `/ratta/?sida=${encodeURIComponent(path)}`;
}
