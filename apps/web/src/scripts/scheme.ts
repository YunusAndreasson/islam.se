// The scheme a canvas paints in, for the two scripts that draw their own colours: the
// mosque map (moskeer-map.ts) and the prayer fields (bonetider-field.ts). Each kept its
// own copy of both functions below, each copy commented as mirroring the other.
import type { Scheme } from "../lib/bonetider/render-field";

export type { Scheme };

/** ⚠️ The site's own theme switch wins over the OS. Reading only the media query painted
 *  a dark basemap under a light page for anyone whose OS is dark but who chose light
 *  (or vice versa). */
export function currentScheme(): Scheme {
	const explicit = document.documentElement.dataset.theme;
	if (explicit === "dark" || explicit === "light") return explicit;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Calls `onChange` whenever the scheme may have changed. The switch stamps `data-theme`
 *  on <html> and leaves the media query alone, so both are watched: wired to the query
 *  alone, choosing »Mörkt« left a canvas light under an already-dark page. The head
 *  script also re-stamps the same choice after every navigation, so a caller compares
 *  against what it last painted. Stops when `signal` aborts. */
export function watchScheme(onChange: () => void, signal?: AbortSignal): void {
	window
		.matchMedia("(prefers-color-scheme: dark)")
		.addEventListener("change", onChange, signal ? { signal } : undefined);
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
	signal?.addEventListener("abort", () => observer.disconnect(), { once: true });
}
