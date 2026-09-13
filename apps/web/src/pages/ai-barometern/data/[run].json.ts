import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { APIRoute } from "astro";
import index from "../../../data/ai-barometern/index.json";

// The complete record of each measurement, exactly as committed: every answer, every
// motivation (including the ones the pages do not quote), model versions, settings and cost.
// The repo is private, so this is where the raw data is published.
//
// Read from disk at build rather than imported: bundling a year of run files into the
// module graph is what series.json exists to avoid.

const RUNS = join(process.cwd(), "src/data/ai-barometern/runs");

export function getStaticPaths() {
	return (index as unknown as { runs: string[] }).runs.map((run) => ({ params: { run } }));
}

export const GET: APIRoute = ({ params }) => {
	const dir = join(RUNS, String(params.run));
	const body = {
		run: JSON.parse(readFileSync(join(dir, "run.json"), "utf8")),
		texts: JSON.parse(readFileSync(join(dir, "texts.json"), "utf8")),
	};
	return new Response(`${JSON.stringify(body)}\n`, {
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
};
