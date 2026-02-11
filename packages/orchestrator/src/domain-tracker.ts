import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UrlVerification } from "./source-validator.js";

export interface DomainStats {
	/** Total URLs checked from this domain */
	total: number;
	/** URLs that resolved successfully */
	ok: number;
	/** URLs that failed verification */
	failed: number;
	/** Most recent error message */
	lastError?: string;
	/** ISO timestamp of last check */
	lastChecked: string;
	/** Number of published articles that used this domain as a source */
	publishedIn?: number;
	/** Running average quality score of articles using this domain */
	avgScore?: number;
}

export interface DomainTrackerData {
	/** Schema version for future migrations */
	version: 1;
	/** Per-domain statistics keyed by hostname */
	domains: Record<string, DomainStats>;
}

const DATA_PATH = join(
	import.meta.dirname ?? new URL(".", import.meta.url).pathname,
	"../../../data/web-domains.json",
);

/**
 * Load domain tracker data from disk. Returns empty state if file doesn't exist.
 */
export function loadDomainTracker(path = DATA_PATH): DomainTrackerData {
	if (!existsSync(path)) {
		return { version: 1, domains: {} };
	}
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as DomainTrackerData;
	} catch {
		return { version: 1, domains: {} };
	}
}

/**
 * Save domain tracker data to disk.
 */
export function saveDomainTracker(data: DomainTrackerData, path = DATA_PATH): void {
	writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Extract hostname from a URL string.
 */
function extractDomain(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return null;
	}
}

/**
 * Update domain tracker with URL verification results from a single pipeline run.
 */
export function updateDomainTracker(
	data: DomainTrackerData,
	results: UrlVerification[],
): DomainTrackerData {
	const now = new Date().toISOString();
	for (const r of results) {
		const domain = extractDomain(r.url);
		if (!domain) continue;

		const existing = data.domains[domain] ?? { total: 0, ok: 0, failed: 0, lastChecked: now };
		existing.total++;
		if (r.exists) {
			existing.ok++;
		} else {
			existing.failed++;
			if (r.error) existing.lastError = r.error;
		}
		existing.lastChecked = now;
		data.domains[domain] = existing;
	}
	return data;
}

/**
 * Get domains that should be blocked in research prompts.
 * A domain is blocked if it has >= minSamples checks and >= failRate failure ratio.
 */
export function getBlockedDomains(
	data: DomainTrackerData,
	options?: { minSamples?: number; failRate?: number },
): string[] {
	const minSamples = options?.minSamples ?? 2;
	const failRate = options?.failRate ?? 0.6;

	const blocked: string[] = [];
	for (const [domain, stats] of Object.entries(data.domains)) {
		if (stats.total >= minSamples && stats.failed / stats.total >= failRate) {
			blocked.push(domain);
		}
	}
	return blocked.sort();
}

/**
 * Record that domains were used in a published article with a given quality score.
 * Updates publishedIn count and running average score.
 */
export function recordPublishedArticle(
	data: DomainTrackerData,
	sourceUrls: string[],
	qualityScore: number,
): DomainTrackerData {
	for (const url of sourceUrls) {
		const domain = extractDomain(url);
		if (!domain) continue;
		const stats = data.domains[domain];
		if (!stats) continue; // only update known domains

		const prev = stats.publishedIn ?? 0;
		const prevAvg = stats.avgScore ?? 0;
		stats.publishedIn = prev + 1;
		stats.avgScore = (prevAvg * prev + qualityScore) / (prev + 1);
	}
	return data;
}

/**
 * Format domain reputation context for the fact-checker.
 * Shows track record for domains used in the current research sources.
 * Returns empty string if no reputation data exists.
 */
export function formatDomainReputation(data: DomainTrackerData, sourceUrls: string[]): string {
	const lines: string[] = [];
	for (const url of sourceUrls) {
		const domain = extractDomain(url);
		if (!domain) continue;
		const stats = data.domains[domain];
		if (!stats?.publishedIn) continue;
		lines.push(
			`- ${domain}: used in ${stats.publishedIn} published article${stats.publishedIn > 1 ? "s" : ""}, avg score ${stats.avgScore?.toFixed(1)}/10`,
		);
	}
	if (lines.length === 0) return "";
	return `\n<domain_reputation>
Track record for web sources used in this research (from previous pipeline runs):
${lines.join("\n")}
Sources without track record are new — evaluate them on their own merits.
</domain_reputation>`;
}

/**
 * Format blocked domains as a prompt section for injection into research prompts.
 * Returns empty string if no domains are blocked.
 */
export function formatBlockedDomainsPrompt(blocked: string[]): string {
	if (blocked.length === 0) return "";
	const list = blocked.map((d) => `- ${d}`).join("\n");
	return `\n<blocked_domains>
These domains have repeatedly failed URL verification in past runs. Do NOT use them as sources:
${list}
</blocked_domains>`;
}
