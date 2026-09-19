/**
 * Refuse a language correction that introduces a misspelling.
 *
 * ⚠️ WHY. The first dry run of the patch-mode Swedish voice (2026-09-19) rewrote the
 * description of »Marknaden i raden« as »… för att ha styrtväljarna« — two words run
 * together. The description goes straight into the page's frontmatter, and no gate reads
 * it: the patch guards protect the body only. A correction that makes a known word
 * unknown is refused here, before it is applied.
 *
 * Only lower-case words in plain Swedish letters count. Names, transliterations
 * (*taʿaṣṣub*) and anything with ʿ ʾ or macrons are the author's to introduce, and the
 * dictionary does not know them anyway.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findDataDir } from "./services/article-publisher.js";

const SWEDISH_WORD = /^[a-zåäöéü]+(?:-[a-zåäöéü]+)*$/;

function unknownWords(text: string, dict: string): Set<string> | null {
	const run = spawnSync("hunspell", ["-d", dict, "-l"], {
		input: text,
		encoding: "utf-8",
		timeout: 20_000,
	});
	if (run.error || run.status !== 0) return null;
	return new Set(
		run.stdout
			.split("\n")
			.map((w) => w.trim())
			.filter((w) => SWEDISH_WORD.test(w)),
	);
}

/**
 * Words `after` misspells that `before` did not. Empty when the correction is clean,
 * null when hunspell or the Swedish dictionary is unavailable (treat as »not checked«).
 */
export function newMisspellings(before: string, after: string): string[] | null {
	const dict = join(findDataDir(), "hunspell", "sv");
	if (!existsSync(`${dict}.dic`)) return null;
	const was = unknownWords(before, dict);
	const now = unknownWords(after, dict);
	if (!(was && now)) return null;
	return [...now].filter((w) => !was.has(w));
}
