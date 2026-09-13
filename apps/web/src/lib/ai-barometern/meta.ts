import series from "../../data/ai-barometern/series.json";

// Freshness for /ai-barometern/: the date of the latest committed measurement, read from the
// derived series file so it can never disagree with the charts. Imported by astro.config.ts
// for the sitemap `lastmod`, so it imports nothing but the JSON.
export const AI_BAROMETERN_DATA_DATE: string | null =
	(series as { runs: { date: string }[] }).runs.at(-1)?.date ?? null;
