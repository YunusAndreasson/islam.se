import { describe, expect, it } from "vitest";
import { localIsoDate } from "./daily";

describe("localIsoDate", () => {
	it("names the reader's calendar day, also in the first hour after midnight", () => {
		// Built from local fields, so it holds on any host: the year page took its »today«
		// from toISOString() and in Sweden kept yesterday until 01:00 or 02:00.
		expect(localIsoDate(new Date(2026, 9, 24, 0, 30))).toBe("2026-10-24");
		expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
	});
});
