import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { newMisspellings } from "./spellguard.js";

const hasHunspell = !spawnSync("hunspell", ["-v"]).error;

describe.skipIf(!hasHunspell)("newMisspellings", () => {
	// The first dry run of the patch-mode Swedish voice wrote »styrtväljarna« into a
	// description. A correction that makes a known word unknown must be refused.
	it("catches two words run together by a correction", () => {
		expect(
			newMisspellings(
				"anklagades för att ha styrt väljarna",
				"anklagades för att ha styrtväljarna",
			),
		).toEqual(["styrtväljarna"]);
	});

	it("ignores names and transliterations, and passes a clean correction", () => {
		expect(
			newMisspellings(
				"partiskheten håller på de sina",
				"partiskheten, *taʿaṣṣub*, håller på Åkessons sida",
			),
		).toEqual([]);
		expect(newMisspellings("moskéerna anklagades", "moskéer anklagades")).toEqual([]);
	});
});
