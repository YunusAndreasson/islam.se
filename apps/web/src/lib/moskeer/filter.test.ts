import { describe, expect, it } from "vitest";
import { filterFromUrl, matchesFilter, queryTerms, urlWithFilter } from "./filter";

const haystack = "fatih moske stockholm stockholms lan";

describe("the mosque directory's filter", () => {
	it("finds a place by any of its words, in any order", () => {
		// The list and the map matched the query as one string, so a name and a place
		// typed together found nothing; place search has always matched word by word.
		expect(matchesFilter(haystack, "Stockholms län", queryTerms("Moské Stockholm"), "")).toBe(true);
		expect(matchesFilter(haystack, "Stockholms län", queryTerms("stockholm fatih"), "")).toBe(true);
		expect(matchesFilter(haystack, "Stockholms län", queryTerms("fatih malmö"), "")).toBe(false);
	});

	it("keeps only the chosen län, and every place when none is chosen", () => {
		expect(matchesFilter(haystack, "Stockholms län", [], "Skåne län")).toBe(false);
		expect(matchesFilter(haystack, "Stockholms län", [], "")).toBe(true);
	});

	it("honours a linked län only when the picker offers it", () => {
		// The list's fallback assigned an unknown ?lan= straight to the <select>, which then
		// had no option chosen: a blank picker over an empty list.
		const lans = ["", "Skåne län", "Stockholms län"];
		expect(filterFromUrl("?q=malm%C3%B6&lan=Sk%C3%A5ne+l%C3%A4n", lans)).toEqual({
			raw: "malmö",
			lan: "Skåne län",
		});
		expect(filterFromUrl("?lan=Atlantis", lans)).toEqual({ raw: "", lan: "" });
	});

	it("writes the raw query into the address and drops what is empty", () => {
		const url = urlWithFilter("https://islam.se/moskeer/?lan=Sk%C3%A5ne+l%C3%A4n", "Malmö", "");
		expect(new URL(url).searchParams.get("q")).toBe("Malmö");
		expect(new URL(url).searchParams.has("lan")).toBe(false);
	});
});
